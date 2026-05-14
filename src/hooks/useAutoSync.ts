import { useEffect, useRef } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { syncRemoteArchive } from '@/lib/data-layer';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Auto-syncs all configured archive servers on mount.
 *
 * Runs once when the wrapping component mounts, syncing every server
 * that has credentials (baseUrl + token). After each successful sync,
 * invalidates TanStack Query caches for projects, observations, and alerts
 * so all screens see fresh data.
 *
 * Place this in AuthenticatedLayout (or any component that wraps all
 * authenticated screens) so every page benefits from up-to-date data.
 */
export function useAutoSync(): void {
  const queryClient = useQueryClient();
  const hasSynced = useRef(false);

  useEffect(() => {
    if (hasSynced.current) return;
    hasSynced.current = true;

    const { servers } = useAuthStore.getState();
    const serversWithCredentials = servers.filter((s) => s.baseUrl && s.token);

    for (const server of serversWithCredentials) {
      void syncRemoteArchive(server.id, {
        baseUrl: server.baseUrl,
        token: server.token,
      })
        .then(() => {
          void queryClient.invalidateQueries({ queryKey: ['projects'] });
          void queryClient.invalidateQueries({ queryKey: ['observations'] });
          void queryClient.invalidateQueries({ queryKey: ['alerts'] });
        })
        .catch(() => {
          // Sync errors are surfaced via auth store status updates.
          // Swallow here to avoid unhandled promise rejections.
        });
    }
  }, [queryClient]);
}
