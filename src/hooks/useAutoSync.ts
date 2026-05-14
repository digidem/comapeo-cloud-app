import { useEffect, useRef } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { syncRemoteArchive } from '@/lib/data-layer';
import { getRemoteServers } from '@/lib/local-repositories';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Auto-syncs all configured archive servers on mount.
 *
 * Runs once when the wrapping component mounts. It:
 * 1. Hydrates the in-memory auth store from IndexedDB (so the sidebar,
 *    archive status, etc. show servers immediately)
 * 2. Syncs every server that has credentials (baseUrl + token)
 * 3. Invalidates TanStack Query caches after each successful sync
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

    // Load servers from IndexedDB (persisted, includes tokens) rather than
    // the in-memory auth store which is empty after a page refresh.
    void getRemoteServers()
      .then(async (records) => {
        // Hydrate the in-memory auth store so the UI shows servers immediately
        await useAuthStore.getState().hydrateServers();

        const serversWithCredentials = records.filter(
          (r): r is typeof r & { token: string } => !!(r.baseUrl && r.token),
        );

        for (const server of serversWithCredentials) {
          void syncRemoteArchive(server.id, {
            baseUrl: server.baseUrl,
            token: server.token,
          })
            .then(() => {
              void queryClient.invalidateQueries({ queryKey: ['projects'] });
              void queryClient.invalidateQueries({
                queryKey: ['observations'],
              });
              void queryClient.invalidateQueries({ queryKey: ['alerts'] });
            })
            .catch(() => {
              // Sync errors are surfaced via auth store status updates.
              // Swallow here to avoid unhandled promise rejections.
            });
        }
      })
      .catch(() => {
        // Failed to load servers from IndexedDB — nothing to sync.
      });
  }, [queryClient]);
}
