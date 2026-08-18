import { useEffect, useState } from 'react';

/**
 * Persistent-storage state for the Cases feature.
 *
 * - `persisted` — the browser persists data and eviction is unlikely.
 * - `denied`     — the user (or browser default) declined persistence.
 * - `unsupported` — the Storage API is not available (e.g. older Safari / SSR).
 * - `error`      — the Storage API exists but `persist()` or `persisted()` threw.
 * - `quota-risk` — usage is high relative to quota, so eviction is a real risk
 *                  even if the origin is marked persisted.
 * - `loading`    — initial check in progress.
 */
export type StoragePersistState =
  'loading' | 'persisted' | 'denied' | 'unsupported' | 'error' | 'quota-risk';

export interface StoragePersistResult {
  state: StoragePersistState;
  isPersisted: boolean;
  isLoading: boolean;
  isEvictionRisk: boolean;
  quota: number | null;
  usage: number | null;
  usagePercent: number | null;
}

const QUOTA_RISK_THRESHOLD_PERCENT = 80;

/**
 * Module-level cache for persistence state.
 *
 * Stores only storage-persistence metadata — **never Case data**.
 * Process-local safe: survives unmount/remount within the same JS process so
 * that `persist()` is never called a second time after the initial check has
 * resolved.
 */
interface PersistCacheEntry {
  state: Exclude<StoragePersistState, 'loading'>;
  quota: number | null;
  usage: number | null;
  usagePercent: number | null;
}
let persistCache: PersistCacheEntry | null = null;

/**
 * Reset the module-level persistence cache.
 *
 * Intended for test isolation only — allows each test to simulate a fresh
 * process where persistence has not yet been determined.
 */
export function resetPersistCacheForTesting(): void {
  persistCache = null;
}

interface InternalState {
  state: StoragePersistState;
  quota: number | null;
  usage: number | null;
  usagePercent: number | null;
}

/**
 * Compute the initial state, using the module-level cache if available so that
 * unmount/remount does not re-trigger the persistence check.
 */
function getInitialState(): InternalState {
  if (persistCache) {
    return {
      state: persistCache.state,
      quota: persistCache.quota,
      usage: persistCache.usage,
      usagePercent: persistCache.usagePercent,
    };
  }
  return {
    state: 'loading',
    quota: null,
    usage: null,
    usagePercent: null,
  };
}

/**
 * Requests persistent browser storage via `navigator.storage.persist()` on
 * first durable Case use (when the Storage API supports it), and tracks the
 * resulting state: persisted, denied, unsupported, error, and quota-risk.
 *
 * - On first call, if persistence is not known to be granted, `persist()` is
 *   called once. If persistence is already known (granted or denied), `persist()`
 *   is never called again — even across unmount/remount of the component,
 *   because the resolved state is cached at module scope.
 * - Fails safe: unsupported / throwing Storage API paths leave the app usable
 *   with `state: 'unsupported'` or `state: 'error'` — Case CRUD is never blocked.
 */
export function useStoragePersist(): StoragePersistResult {
  const [internal, setInternal] = useState<InternalState>(getInitialState);

  useEffect(() => {
    let cancelled = false;

    // If persistence state was already resolved in a prior mount cycle within
    // this JS process, the lazy initial state already loaded it — no work needed.
    if (persistCache) {
      return;
    }

    void (async () => {
      const storage = (
        typeof navigator !== 'undefined'
          ? (navigator as Navigator).storage
          : undefined
      ) as
        | {
            persist?: () => Promise<boolean>;
            persisted?: () => Promise<boolean>;
            estimate?: () => Promise<StorageEstimate>;
          }
        | undefined;

      // Unsupported: Storage API or persist/persisted methods are absent
      if (
        !storage ||
        typeof storage.persist !== 'function' ||
        typeof storage.persisted !== 'function'
      ) {
        const resolved: PersistCacheEntry = {
          state: 'unsupported',
          quota: null,
          usage: null,
          usagePercent: null,
        };
        persistCache = resolved;
        setInternal({
          state: resolved.state,
          quota: resolved.quota,
          usage: resolved.usage,
          usagePercent: resolved.usagePercent,
        });
        return;
      }

      let persisted: boolean;
      try {
        persisted = await storage.persisted();
      } catch {
        const resolved: PersistCacheEntry = {
          state: 'error',
          quota: null,
          usage: null,
          usagePercent: null,
        };
        persistCache = resolved;
        setInternal({
          state: resolved.state,
          quota: resolved.quota,
          usage: resolved.usage,
          usagePercent: resolved.usagePercent,
        });
        return;
      }

      if (!persisted) {
        // Persistence not yet granted — request it (first durable use)
        try {
          const granted = await storage.persist();
          if (!granted) {
            const resolved: PersistCacheEntry = {
              state: 'denied',
              quota: null,
              usage: null,
              usagePercent: null,
            };
            persistCache = resolved;
            setInternal({
              state: resolved.state,
              quota: resolved.quota,
              usage: resolved.usage,
              usagePercent: resolved.usagePercent,
            });
            return;
          }
        } catch {
          const resolved: PersistCacheEntry = {
            state: 'error',
            quota: null,
            usage: null,
            usagePercent: null,
          };
          persistCache = resolved;
          setInternal({
            state: resolved.state,
            quota: resolved.quota,
            usage: resolved.usage,
            usagePercent: resolved.usagePercent,
          });
          return;
        }
      }

      // Persistence is granted — check quota / usage for eviction risk
      let quota: number | null = null;
      let usage: number | null = null;
      let usagePercent: number | null = null;

      if (storage.estimate) {
        try {
          const est = await storage.estimate();
          quota = est.quota ?? 0;
          usage = est.usage ?? 0;
          usagePercent = quota > 0 ? (usage / quota) * 100 : 0;
        } catch {
          // Estimate throwing is non-fatal — persistence is already granted
        }
      }

      const resolvedState =
        usagePercent !== null && usagePercent > QUOTA_RISK_THRESHOLD_PERCENT
          ? 'quota-risk'
          : 'persisted';

      const resolved: PersistCacheEntry = {
        state: resolvedState,
        quota,
        usage,
        usagePercent,
      };
      persistCache = resolved;

      if (!cancelled) {
        setInternal({
          state: resolved.state,
          quota: resolved.quota,
          usage: resolved.usage,
          usagePercent: resolved.usagePercent,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    state: internal.state,
    isPersisted:
      internal.state === 'persisted' || internal.state === 'quota-risk',
    isLoading: internal.state === 'loading',
    isEvictionRisk:
      internal.state === 'quota-risk' || internal.state === 'denied',
    quota: internal.quota,
    usage: internal.usage,
    usagePercent: internal.usagePercent,
  };
}
