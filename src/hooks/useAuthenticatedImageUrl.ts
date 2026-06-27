import { useEffect, useRef, useState } from 'react';

import { ARCHIVE_TARGET_HEADER } from '@/lib/archive-proxy';
import { getCachedIconBlob, putCachedIconBlob } from '@/lib/db';
import { type CacheKey, createImageBlobCache } from '@/lib/image-blob-cache';
import { useAuthStore } from '@/stores/auth-store';

interface AuthenticatedImageState {
  blobUrl: string | null;
  isLoading: boolean;
  error: Error | null;
}

interface UseAuthenticatedImageUrlOptions {
  /**
   * When true, the fetched blob is cached in IndexedDB (keyed by `url`) and
   * served from there on subsequent loads for instant display. Intended for
   * small, stable assets like category icons — NOT large photos.
   */
  cache?: boolean;
}

interface ArchiveCredentials {
  baseUrl: string;
  token: string;
}

// Module-scope singleton: survives component unmount/remount
const blobCache = createImageBlobCache();

/** @internal Reset the in-memory blob cache between tests */
export function resetImageBlobCacheForTests(): void {
  blobCache.clear();
}

function getArchiveBasePath(baseUrl: string): string | null {
  try {
    const pathname = new URL(baseUrl).pathname.replace(/\/+$/, '');
    return pathname === '' ? '/' : pathname;
  } catch {
    return null;
  }
}

function removeArchiveBasePath(pathname: string, baseUrl: string): string {
  const basePath = getArchiveBasePath(baseUrl);
  if (!basePath || basePath === '/') return pathname;

  if (pathname === basePath) return '/';
  if (pathname.startsWith(`${basePath}/`)) {
    return pathname.slice(basePath.length);
  }
  return pathname;
}

function findMatchingServer(
  parsedUrl: URL,
  servers: ArchiveCredentials[],
): ArchiveCredentials | undefined {
  const sameOriginServers = servers.filter((server) => {
    try {
      return new URL(server.baseUrl).origin === parsedUrl.origin;
    } catch {
      return false;
    }
  });

  return (
    sameOriginServers.find((server) => {
      const basePath = getArchiveBasePath(server.baseUrl);
      return (
        basePath === '/' ||
        parsedUrl.pathname === basePath ||
        parsedUrl.pathname.startsWith(`${basePath}/`)
      );
    }) ?? sameOriginServers[0]
  );
}

function getRelativeArchiveCredentials({
  baseUrl,
  servers,
  token,
}: {
  baseUrl: string | null;
  servers: ArchiveCredentials[];
  token: string | null;
}): ArchiveCredentials | null {
  if (baseUrl && token) return { baseUrl, token };
  return servers.length === 1 ? servers[0]! : null;
}

/**
 * Build a cache key from the image URL and the server context that serves it.
 *
 * The key includes the server kind, base URL, AND the auth token so that
 * a token change (login/logout, server re-auth) naturally invalidates the
 * cache by producing a new key — stale entries are simply unused and
 * eventually evicted by the grace-period timer.
 */
function buildImageCacheKey(
  url: string,
  matchingServer: ArchiveCredentials | null,
  localToken: string | null,
): CacheKey {
  if (matchingServer) {
    return `archive:${matchingServer.baseUrl}|${matchingServer.token}|${url}`;
  }
  return `local:${localToken ?? ''}|${url}`;
}

/**
 * Fetches an image URL with proper Authorization headers and returns a blob URL.
 *
 * For remote archive URLs (matching a server in the auth store), the request is
 * routed through the /api proxy with x-target-url header.
 * For other URLs (local server), the URL is used as-is with the store token.
 *
 * Uses an in-memory ref-counted blob URL cache so that:
 * - Same image rendered by multiple components = 1 network request, 1 blob URL
 * - Blob URLs survive component unmount/remount (30s grace period)
 * - Cache entries are scoped to (URL + auth context), so token changes
 *   produce new keys and old entries are simply unused until eviction
 *
 * Dedup model:
 * - The originator creates a shared AbortController and registers an
 *   in-flight entry in the cache BEFORE doing any async work (IDB read
 *   or network fetch). Concurrent mounts see the in-flight entry and
 *   attach to it instead of starting a parallel fetch.
 * - The cache aborts the shared controller when refCount drops to 0, so
 *   exactly one abort fires per shared fetch regardless of how many
 *   subscribers attached.
 */
export function useAuthenticatedImageUrl(
  url: string,
  options?: UseAuthenticatedImageUrlOptions,
): AuthenticatedImageState {
  const cache = options?.cache ?? false;
  const [state, setState] = useState<AuthenticatedImageState>(() => {
    if (!url) return { blobUrl: null, isLoading: false, error: null };
    return { blobUrl: null, isLoading: true, error: null };
  });

  const mountedRef = useRef(true);

  // Subscribe to auth store to re-fetch when servers or token change
  const servers = useAuthStore((s) => s.servers);
  const token = useAuthStore((s) => s.token);
  const baseUrl = useAuthStore((s) => s.baseUrl);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    const setImageState = (nextState: AuthenticatedImageState) => {
      queueMicrotask(() => {
        if (!cancelled && mountedRef.current) {
          setState(nextState);
        }
      });
    };

    // Early return for empty/invalid URL
    if (!url) {
      setImageState({ blobUrl: null, isLoading: false, error: null });
      return () => {
        cancelled = true;
      };
    }

    const isRelativeUrl = url.startsWith('/') && !url.startsWith('//');
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(
        url,
        isRelativeUrl ? window.location.origin : undefined,
      );
    } catch {
      setImageState({ blobUrl: null, isLoading: false, error: null });
      return () => {
        cancelled = true;
      };
    }

    const matchingServer = isRelativeUrl
      ? getRelativeArchiveCredentials({ baseUrl, servers, token })
      : (findMatchingServer(parsedUrl, servers) ?? null);

    // Compute the in-memory cache key
    const cacheKey = buildImageCacheKey(url, matchingServer, token);

    let fetchUrl: string;
    let fetchHeaders: Record<string, string>;

    if (matchingServer) {
      // Remote archive: route through /api proxy
      const proxyPath = isRelativeUrl
        ? parsedUrl.pathname
        : removeArchiveBasePath(parsedUrl.pathname, matchingServer.baseUrl);
      fetchUrl = '/api' + proxyPath + parsedUrl.search;
      fetchHeaders = {
        Authorization: `Bearer ${matchingServer.token}`,
        [ARCHIVE_TARGET_HEADER]: matchingServer.baseUrl,
      };
    } else {
      // Local server or unmatched: use URL as-is
      fetchUrl = url;
      fetchHeaders = token ? { Authorization: `Bearer ${token}` } : {};
    }

    // === Path 1: cache hit on a resolved entry — reuse the blob URL ===
    const cachedEntry = blobCache.get(cacheKey);
    if (cachedEntry && cachedEntry.blobUrl && !cachedEntry.inflight) {
      blobCache.ref(cacheKey);
      // Honor the cache:true IDB write contract even when this consumer
      // attaches to an entry originated by a cache:false consumer. Guard with
      // the _persisted flag to avoid redundant IDB writes across consumers.
      if (cache && cachedEntry.blob && !cachedEntry._persisted) {
        cachedEntry._persisted = true;
        void putCachedIconBlob(url, cachedEntry.blob).catch(() => {});
      }
      setImageState({
        blobUrl: cachedEntry.blobUrl,
        isLoading: false,
        error: null,
      });
      return () => {
        cancelled = true;
        mountedRef.current = false;
        blobCache.unref(cacheKey);
      };
    }

    // === Path 2: another fetch is in-flight — claim a slot and reuse its result ===
    if (cachedEntry && cachedEntry.inflight) {
      blobCache.ref(cacheKey); // Claim a ref slot so the entry doesn't evict mid-flight
      setImageState({ blobUrl: null, isLoading: true, error: null });

      cachedEntry.inflight
        .then(() => {
          if (cancelled || !mountedRef.current) return;
          // The first subscriber already created the blob URL. Just read it
          // from the cache — do NOT create a new one, do NOT increment ref.
          const resolved = blobCache.get(cacheKey);
          if (resolved && resolved.blobUrl) {
            setState({
              blobUrl: resolved.blobUrl,
              isLoading: false,
              error: null,
            });
            // Joiner-side IDB write: if the originator unmounted before
            // writing to IDB, this joiner fills the cache so subsequent
            // mounts skip the network entirely. Guard with _persisted to
            // avoid redundant writes across originator + joiners.
            if (cache && resolved.blob && !resolved._persisted) {
              resolved._persisted = true;
              void putCachedIconBlob(url, resolved.blob).catch(() => {});
            }
          }
        })
        .catch((err: unknown) => {
          if (cancelled || !mountedRef.current) return;
          setState({
            blobUrl: null,
            isLoading: false,
            error: err as Error,
          });
        });

      return () => {
        cancelled = true;
        mountedRef.current = false;
        // Joiners don't own the controller — the cache's unref handles the
        // shared abort when refCount drops to 0.
        blobCache.unref(cacheKey);
      };
    }

    // === Path 3: cache miss — start a new fetch and claim the first ref slot ===
    setImageState({ blobUrl: null, isLoading: true, error: null });

    // Shared AbortController owned by the cache entry. The originator
    // registers it; joiners reuse it. The cache aborts it on last unref.
    const controller = new AbortController();

    // Deferred promise that resolves once the in-flight work (IDB read +
    // optional network fetch) completes. We register it in the cache BEFORE
    // any async work so concurrent mounts attach to it instead of starting
    // parallel fetches.
    let resolveInflight!: (blob: Blob) => void;
    let rejectInflight!: (err: unknown) => void;
    const inflight: Promise<Blob> = new Promise((resolve, reject) => {
      resolveInflight = resolve;
      rejectInflight = reject;
    });
    // Swallow unhandled-rejection warnings on the stored reference. When the
    // originator is the only subscriber and the fetch fails, no one attaches
    // a .then() to the stored inflight. Joiners attach their own handlers,
    // which create separate derived promises that still propagate the
    // rejection.
    inflight.catch(() => {});

    // Register the in-flight entry IMMEDIATELY — before the IDB read.
    // This is what dedupes concurrent cache:true mounts during the IDB
    // phase: the second mount sees the in-flight entry and joins via
    // Path 2 instead of starting its own IDB lookup.
    blobCache.set(cacheKey, {
      blobUrl: '',
      serverToken: matchingServer?.token ?? token ?? '',
      serverSignature: JSON.stringify(servers.map((s) => s.id)),
      inflight,
      controller,
      refCount: 1,
    });

    const publishBlob = (blob: Blob) => {
      // Only this path creates a blob URL. Subsequent subscribers reuse it.
      const blobUrl = URL.createObjectURL(blob);
      // Preserve the current refCount — in-flight subscribers may have already
      // claimed additional refs via blobCache.ref() while the fetch was pending.
      const existing = blobCache.get(cacheKey);
      const preservedRefCount = existing?.refCount ?? 1;
      // Carry the _persisted flag so the originator's IDB write (set on the
      // inflight entry before publishBlob) survives the entry reconstruction.
      // Without this, publishBlob creates a fresh object that drops _persisted,
      // and the first cache-hit consumer redundantly re-writes to IDB.
      const wasPersisted = existing?._persisted ?? false;
      // Always store in the in-memory cache — even if the originating
      // subscriber has unmounted, other in-flight subscribers need the
      // resolved blob URL.
      blobCache.set(cacheKey, {
        blobUrl,
        blob,
        serverToken: matchingServer?.token ?? token ?? '',
        serverSignature: JSON.stringify(servers.map((s) => s.id)),
        refCount: preservedRefCount,
        // Keep the controller so that a later all-subscribers-unmount can
        // still abort. The fetch has already resolved at this point so
        // abort() is a no-op on the network, but the reference stays
        // consistent for any cleanup path that reads it.
        controller,
        _persisted: wasPersisted,
      });
      // Resolve the in-flight promise so any Path 2 joiners can read the
      // cached blobUrl.
      resolveInflight(blob);
      // Only update React state if the originating subscriber is still mounted
      if (!cancelled && mountedRef.current) {
        setState({ blobUrl, isLoading: false, error: null });
      }
    };

    // Settle the in-flight promise and drop the cache entry when the shared
    // AbortController has fired (the last subscriber unmounted). Returning
    // without this — the old behavior — left `inflight` pending forever, so
    // any joiner (including a remount during the grace period) hung on a
    // promise that never settled. Rejecting surfaces the abort to joiners,
    // and invalidating lets the next mount retry instead of attaching to a
    // dead entry. Does not touch React state: by the time the controller
    // fires, the originator has already unmounted.
    const settleOnAbort = () => {
      // Identity-guard: only invalidate the entry this run created. A servers
      // store change mid-flight triggers effect cleanup → re-run, which creates
      // a replacement entry (new controller) under the same cache key. Without
      // this guard, the aborted originator would invalidate + abort the
      // replacement entry, leaving the remounted hook stuck at isLoading:true.
      //
      // Note: in this abort path the guard is defensively dead code — the
      // cache deletes the entry in the same operation that aborts the
      // controller, so `get(cacheKey)` returns either undefined or a
      // replacement entry (different controller). The genuine own-entry
      // invalidate fires in the catch block below (network failure where the
      // controller is NOT aborted and the entry is still live). We keep the
      // guard here for symmetry and as a safety net if the cache's abort
      // coupling ever changes. The meaningful work in this path is
      // `rejectInflight`, which settles joiners on the aborted promise.
      const cur = blobCache.get(cacheKey);
      if (cur && cur.controller === controller) {
        blobCache.invalidate((k) => k === cacheKey);
      }
      rejectInflight(new DOMException('Aborted', 'AbortError'));
    };

    const run = async () => {
      try {
        // Serve from the local icon cache first when caching is enabled, so
        // cached icons render instantly without a network round-trip.
        if (cache) {
          try {
            const cachedBlob = await getCachedIconBlob(url);
            if (controller.signal.aborted) {
              settleOnAbort();
              return;
            }
            if (cachedBlob) {
              // The blob originated from IDB — mark the entry as already
              // persisted so publishBlob carries _persisted: true. Without
              // this, a later cache-hit consumer sees _persisted: false and
              // redundantly writes the same blob back to IDB.
              const existing = blobCache.get(cacheKey);
              if (existing) {
                existing._persisted = true;
              }
              publishBlob(cachedBlob);
              return;
            }
          } catch {
            // Cache read failed — fall through to the network fetch.
          }
        }

        if (controller.signal.aborted) {
          settleOnAbort();
          return;
        }

        const response = await fetch(fetchUrl, {
          headers: fetchHeaders,
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const blob = await response.blob();

        if (controller.signal.aborted) {
          settleOnAbort();
          return;
        }

        // Always publish to cache (other subscribers may be waiting),
        // but only write to the IDB icon cache if still mounted.
        if (cache && !cancelled && mountedRef.current) {
          // Best-effort write; never block display on the cache.
          const existing = blobCache.get(cacheKey);
          if (existing && !existing._persisted) {
            existing._persisted = true;
            void putCachedIconBlob(url, blob).catch(() => {});
          }
        }
        publishBlob(blob);
      } catch (err: unknown) {
        // Identity-guard: only invalidate the entry this run created. A servers
        // store change mid-flight triggers effect cleanup → re-run, which creates
        // a replacement entry (new controller) under the same cache key. Without
        // this guard, the aborted originator would invalidate + abort the
        // replacement entry, leaving the remounted hook stuck at isLoading:true.
        const cur = blobCache.get(cacheKey);
        if (cur && cur.controller === controller) {
          blobCache.invalidate((k) => k === cacheKey);
        }
        // Propagate to in-flight joiners so they see the error too.
        rejectInflight(err);
        if (cancelled || !mountedRef.current) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({ blobUrl: null, isLoading: false, error: err as Error });
      }
    };

    void run();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      // Unref hands the entry to the cache. If this is the last subscriber
      // (refCount → 0), the cache aborts the shared controller and
      // schedules grace-period eviction. If other subscribers are still
      // attached, the fetch continues uninterrupted.
      blobCache.unref(cacheKey);
    };
  }, [url, servers, token, baseUrl, cache]);

  return state;
}
