/**
 * In-memory, ref-counted blob URL cache for authenticated images.
 *
 * Deduplicates in-flight and completed fetches so that the same image URL
 * rendered by multiple components results in only one network request and
 * one blob URL with N subscribers. Blob URLs are kept alive while refCount
 * is > 0, and remain in the store during a grace period after the last
 * unref so that rapid unmount/remount cycles reuse the cached entry
 * without re-fetching. After the grace period elapses with no new ref,
 * the entry is evicted (blob URL revoked, store entry removed).
 *
 * Entries can also be removed earlier via explicit invalidation
 * (e.g. on auth changes) or clear().
 *
 * The cache also tracks an optional shared `AbortController` for the
 * in-flight fetch. The originator registers its controller on the entry;
 * subsequent joiners reuse it. When refCount drops to 0 the eviction
 * logic aborts the shared controller so that any pending network request
 * is cancelled by exactly one signal — no matter how many subscribers
 * attached to the entry.
 */

export type CacheKey = string;

export interface CacheEntry {
  blobUrl: string;
  refCount: number;
  inflight?: Promise<Blob>;
  /**
   * Shared AbortController for the in-flight fetch. The originator registers
   * its controller when it sets the entry; joiners reuse it. The cache
   * aborts this controller when refCount drops to 0 so that exactly one
   * abort fires per shared fetch, regardless of how many subscribers
   * attached and detached.
   */
  controller?: AbortController;
  /** The resolved Blob, stored alongside blobUrl for joiner-side IDB writes. */
  blob?: Blob;
  serverToken: string;
  serverSignature: string;
  /** Internal: timer handle for grace-period eviction. Not part of the public API. */
  _evictionTimer?: ReturnType<typeof setTimeout>;
}

export interface ImageBlobCacheOptions {
  /**
   * How long (in ms) an entry with refCount === 0 stays in the store before
   * being revoked and removed. Default: 30000 (30s). Use a small value (e.g.
   * 0) in tests to make eviction deterministic with fake timers.
   */
  revokeAfterMs?: number;
}

export interface ImageBlobCache {
  get(key: CacheKey): CacheEntry | undefined;
  set(
    key: CacheKey,
    entry: Omit<CacheEntry, 'refCount' | '_evictionTimer'> & {
      refCount?: number;
    },
  ): void;
  ref(key: CacheKey): void;
  unref(key: CacheKey): void;
  invalidate(matcher: (key: CacheKey, entry: CacheEntry) => boolean): number;
  clear(): void;
  size(): number;
}

export function createImageBlobCache(
  opts: ImageBlobCacheOptions = {},
): ImageBlobCache {
  const { revokeAfterMs = 30_000 } = opts;
  const store = new Map<CacheKey, CacheEntry>();

  function cancelEvictionTimer(entry: CacheEntry): void {
    if (entry._evictionTimer) {
      clearTimeout(entry._evictionTimer);
      entry._evictionTimer = undefined;
    }
  }

  function revokeEntry(entry: CacheEntry): void {
    cancelEvictionTimer(entry);
    if (entry.blobUrl) {
      URL.revokeObjectURL(entry.blobUrl);
    }
  }

  /**
   * Abort the shared controller (if any) and clear the reference. Idempotent
   * — safe to call from any cleanup path. Does NOT throw if the controller
   * has already been aborted by the originator's URL change or by a prior
   * eviction.
   */
  function abortController(entry: CacheEntry): void {
    if (entry.controller) {
      try {
        entry.controller.abort();
      } catch {
        // ignore — already aborted
      }
      entry.controller = undefined;
    }
  }

  function scheduleEviction(key: CacheKey, entry: CacheEntry): void {
    cancelEvictionTimer(entry);
    if (revokeAfterMs <= 0) {
      // Synchronous eviction (test mode)
      if (store.get(key) === entry) {
        store.delete(key);
        abortController(entry);
        if (entry.blobUrl) {
          URL.revokeObjectURL(entry.blobUrl);
        }
      }
      return;
    }
    entry._evictionTimer = setTimeout(() => {
      // Only evict if the entry is still in the store and still at refCount 0.
      const current = store.get(key);
      if (current === entry && current.refCount === 0) {
        store.delete(key);
        abortController(current);
        if (current.blobUrl) {
          URL.revokeObjectURL(current.blobUrl);
        }
      }
    }, revokeAfterMs);
  }

  return {
    get(key: CacheKey): CacheEntry | undefined {
      return store.get(key);
    },

    set(
      key: CacheKey,
      entry: Omit<CacheEntry, 'refCount' | '_evictionTimer'> & {
        refCount?: number;
      },
    ): void {
      const existing = store.get(key);
      if (existing && existing.blobUrl && existing.blobUrl !== entry.blobUrl) {
        // Revoke old blob URL if it's being replaced with a different one.
        // Cancel any pending eviction timer on the old entry first.
        revokeEntry(existing);
      } else if (existing) {
        // Same blob URL (or empty during inflight swap) — just cancel the
        // pending eviction timer if any.
        cancelEvictionTimer(existing);
      }

      store.set(key, {
        ...entry,
        refCount: entry.refCount ?? 0,
      });
    },

    ref(key: CacheKey): void {
      const entry = store.get(key);
      if (!entry) return;
      // Cancel any pending eviction — we're being claimed again.
      cancelEvictionTimer(entry);
      entry.refCount++;
    },

    unref(key: CacheKey): void {
      const entry = store.get(key);
      if (!entry) return;

      entry.refCount--;
      if (entry.refCount < 0) {
        entry.refCount = 0;
      }

      if (entry.refCount === 0) {
        // No more subscribers. Abort the shared in-flight fetch (if any) so
        // it doesn't continue running with no one waiting for the result.
        abortController(entry);

        // If the fetch never completed (still has an unresolved inflight),
        // remove the entry immediately. Dead in-flight promises must not
        // remain joinable during the grace period — a rapid remount would
        // attach to the aborted promise and surface a spurious AbortError
        // instead of starting a fresh fetch. The grace period only applies
        // to resolved blob URLs (completed fetches worth reusing).
        if (entry.inflight) {
          store.delete(key);
        } else {
          // Start the grace-period eviction timer. A subsequent ref() cancels it.
          scheduleEviction(key, entry);
        }
      }
    },

    invalidate(matcher: (key: CacheKey, entry: CacheEntry) => boolean): number {
      let count = 0;
      for (const [key, entry] of store) {
        if (matcher(key, entry)) {
          store.delete(key);
          abortController(entry);
          revokeEntry(entry);
          count++;
        }
      }
      return count;
    },

    clear(): void {
      for (const entry of store.values()) {
        abortController(entry);
        revokeEntry(entry);
      }
      store.clear();
    },

    size(): number {
      return store.size;
    },
  };
}
