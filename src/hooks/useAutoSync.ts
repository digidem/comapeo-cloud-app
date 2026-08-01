import { useCallback, useEffect, useRef } from 'react';

import { syncRemoteArchive } from '@/lib/data-layer';
import { getRemoteServers } from '@/lib/local-repositories';
import { useAuthStore } from '@/stores/auth-store';

const DEFAULT_POLL_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Auto-syncs all configured archive servers on mount, then polls at a
 * configurable interval while the tab is visible. Cache invalidation and
 * per-archive concurrency are owned by the sync coordinator.
 */
export function useAutoSync(options?: { pollIntervalMs?: number }): void {
  const hasSynced = useRef(false);
  const isSyncingRef = useRef(false);
  const pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  const runSync = useCallback(async (): Promise<void> => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;

    try {
      const records = await getRemoteServers();
      await useAuthStore.getState().hydrateServers();

      const serversWithCredentials = records.filter(
        (record): record is typeof record & { token: string } =>
          Boolean(record.baseUrl && record.token),
      );
      const results = await Promise.allSettled(
        serversWithCredentials.map((server) =>
          syncRemoteArchive(server.id, {
            baseUrl: server.baseUrl,
            token: server.token,
          }),
        ),
      );

      for (const result of results) {
        if (result.status === 'rejected') {
          console.warn('[useAutoSync] sync error:', result.reason);
        } else if (!result.value.success || result.value.status !== 'ready') {
          console.warn(
            `[useAutoSync] archive sync settled as ${result.value.status}:`,
            result.value.error ?? result.value.warnings,
          );
        }
      }
    } catch {
      // Failed to load servers from IndexedDB — nothing to sync.
    } finally {
      isSyncingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (hasSynced.current) return;
    hasSynced.current = true;
    void runSync();
  }, [runSync]);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    function startPolling() {
      if (intervalId !== null) return;
      intervalId = setInterval(() => {
        void runSync();
      }, pollIntervalMs);
    }

    function stopPolling() {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') startPolling();
      else stopPolling();
    }

    if (document.visibilityState === 'visible') startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [pollIntervalMs, runSync]);
}
