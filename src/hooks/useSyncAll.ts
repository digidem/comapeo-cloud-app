import { useCallback, useRef, useState } from 'react';

import { syncRemoteArchive } from '@/lib/data-layer';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Hook for manually triggering a sync of all configured archive servers.
 * The application coordinator owns per-archive locking, status transitions,
 * and cache invalidation.
 */
export function useSyncAll(): {
  sync: () => Promise<void>;
  isSyncing: boolean;
} {
  const [isSyncing, setIsSyncing] = useState(false);
  const isRunningRef = useRef(false);

  const sync = useCallback(async () => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    setIsSyncing(true);

    try {
      const servers = useAuthStore.getState().servers;
      const serversWithCredentials = servers.filter(
        (server): server is typeof server & { token: string } =>
          Boolean(
            server.baseUrl &&
            server.token &&
            server.onboardingStatus !== 'cancelled',
          ),
      );
      if (serversWithCredentials.length === 0) return;

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
          console.warn('[useSyncAll] sync error:', result.reason);
        } else if (!result.value.success || result.value.status !== 'ready') {
          console.warn(
            `[useSyncAll] archive sync settled as ${result.value.status}:`,
            result.value.error ?? result.value.warnings,
          );
        }
      }
    } catch {
      // Unexpected error — swallow to avoid unhandled rejections.
    } finally {
      isRunningRef.current = false;
      setIsSyncing(false);
    }
  }, []);

  return { sync, isSyncing };
}
