import { useCallback, useRef, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { syncRemoteArchive } from '@/lib/data-layer';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Hook for manually triggering a sync of all configured archive servers.
 *
 * Returns `{ sync, isSyncing }` for use by UI components (e.g. RefreshButton).
 * Guards against concurrent sync calls — if a sync is already in flight,
 * subsequent calls are no-ops.
 */
export function useSyncAll(): {
  sync: () => Promise<void>;
  isSyncing: boolean;
} {
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const isRunningRef = useRef(false);

  const sync = useCallback(async () => {
    // Guard against concurrent calls
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    setIsSyncing(true);

    try {
      const servers = useAuthStore.getState().servers;
      const serversWithCredentials = servers.filter(
        (s): s is typeof s & { token: string } => !!(s.baseUrl && s.token),
      );

      if (serversWithCredentials.length === 0) {
        return;
      }

      const results = await Promise.allSettled(
        serversWithCredentials.map((server) =>
          syncRemoteArchive(server.id, {
            baseUrl: server.baseUrl,
            token: server.token,
          }),
        ),
      );

      // Invalidate queries regardless of individual sync results
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      void queryClient.invalidateQueries({ queryKey: ['observations'] });
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });

      // Surface any errors (but don't throw)
      for (const r of results) {
        if (r.status === 'rejected') {
          console.warn('[useSyncAll] sync error:', r.reason);
        }
      }
    } catch {
      // Unexpected error — swallow to avoid unhandled rejections
    } finally {
      isRunningRef.current = false;
      setIsSyncing(false);
    }
  }, [queryClient]);

  return { sync, isSyncing };
}
