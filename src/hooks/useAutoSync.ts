import { useCallback, useEffect, useRef } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { syncRemoteArchive } from '@/lib/data-layer';
import { getRemoteServers } from '@/lib/local-repositories';
import { useAuthStore } from '@/stores/auth-store';

const DEFAULT_POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Auto-syncs all configured archive servers on mount, then polls at a
 * configurable interval while the tab is visible.
 *
 * 1. Hydrates the in-memory auth store from IndexedDB
 * 2. Syncs every server that has credentials (baseUrl + token)
 * 3. Invalidates TanStack Query caches after each successful sync
 * 4. Polls at `pollIntervalMs` (default 5 min) while the document is visible
 * 5. Pauses polling when the tab is hidden, resumes when it becomes visible
 * 6. Skips polls if a previous sync is still in flight
 */
export function useAutoSync(options?: { pollIntervalMs?: number }): void {
  const queryClient = useQueryClient();
  const hasSynced = useRef(false);
  const isSyncingRef = useRef(false);
  const pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  /**
   * Run a full sync cycle for all servers with credentials.
   * Guards against concurrent calls via isSyncingRef.
   */
  const runSync = useCallback(async (): Promise<void> => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;

    try {
      const records = await getRemoteServers();

      // Hydrate the in-memory auth store so the UI shows servers immediately
      await useAuthStore.getState().hydrateServers();

      const serversWithCredentials = records.filter(
        (r): r is typeof r & { token: string } => !!(r.baseUrl && r.token),
      );

      // Fire syncs in parallel and wait for all to settle
      const results = await Promise.allSettled(
        serversWithCredentials.map((server) =>
          syncRemoteArchive(server.id, {
            baseUrl: server.baseUrl,
            token: server.token,
          }).then(() => {
            void queryClient.invalidateQueries({ queryKey: ['projects'] });
            void queryClient.invalidateQueries({
              queryKey: ['observations'],
            });
            void queryClient.invalidateQueries({ queryKey: ['alerts'] });
          }),
        ),
      );

      // Surface any errors for observability (non-critical — don't throw)
      for (const r of results) {
        if (r.status === 'rejected') {
          console.warn('[useAutoSync] sync error:', r.reason);
        }
      }
    } catch {
      // Failed to load servers from IndexedDB — nothing to sync.
    } finally {
      isSyncingRef.current = false;
    }
  }, [queryClient]);

  // Initial sync on mount
  useEffect(() => {
    if (hasSynced.current) return;
    hasSynced.current = true;

    void runSync();
  }, [runSync]);

  // Polling effect
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    function startPolling() {
      if (intervalId !== null) return; // Already polling
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
      if (document.visibilityState === 'visible') {
        startPolling();
      } else {
        stopPolling();
      }
    }

    // Start polling if tab is visible
    if (document.visibilityState === 'visible') {
      startPolling();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [pollIntervalMs, runSync]);
}
