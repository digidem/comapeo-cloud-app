import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { SavedMap } from '@/lib/db';
import { getDb } from '@/lib/db';
import type { DownloadProgress } from '@/lib/map/smp-download';
import { downloadSmp } from '@/lib/map/smp-download';
import { closeSmpReader } from '@/lib/map/smp-serve';
import { useMapStore } from '@/stores/map-store';

export const mapsQueryKey = (projectLocalId: string | null) => [
  'maps',
  projectLocalId,
];

export function useMaps(projectLocalId: string | null) {
  return useQuery({
    queryKey: mapsQueryKey(projectLocalId),
    queryFn: async () => {
      const db = getDb();
      const maps = await db.maps
        .where('projectLocalId')
        .equals(projectLocalId!)
        .toArray();
      return maps.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    enabled: projectLocalId !== null,
  });
}

export function useCreateMap() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (map: SavedMap) => {
      await getDb().maps.add(map);
      return map;
    },
    onSuccess: (map) => {
      void queryClient.invalidateQueries({
        queryKey: mapsQueryKey(map.projectLocalId),
      });
    },
  });
}

export function useRenameMap(projectLocalId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ mapId, name }: { mapId: string; name: string }) => {
      const updatedAt = new Date().toISOString();
      await getDb().maps.update(mapId, { name, updatedAt });
    },
    onSuccess: (_data, { mapId }) => {
      void queryClient.invalidateQueries({
        queryKey: mapsQueryKey(projectLocalId),
      });
      void queryClient.invalidateQueries({ queryKey: ['map', mapId] });
    },
  });
}

export function useDeleteMap(projectLocalId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (mapId: string) => {
      await closeSmpReader(mapId);
      const db = getDb();
      const updatedAt = new Date().toISOString();
      await db.transaction('rw', [db.maps, db.projects], async () => {
        await db.maps.delete(mapId);
        await db.projects
          .filter((project) => project.activeMapId === mapId)
          .modify((project) => {
            project.activeMapId = null;
            project.updatedAt = updatedAt;
          });
      });

      const storeState = useMapStore.getState();
      if (
        storeState.activeMapId === mapId &&
        storeState.activeProjectLocalId === projectLocalId
      ) {
        storeState.hydrateActiveMap(projectLocalId, null);
      }
    },
    onSuccess: (_data, mapId) => {
      void queryClient.invalidateQueries({
        queryKey: mapsQueryKey(projectLocalId),
      });
      void queryClient.invalidateQueries({ queryKey: ['map', mapId] });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useSetActiveMapMutation(projectLocalId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (mapId: string | null) => {
      if (!projectLocalId) return;

      const previousMapId =
        mapId === null ? useMapStore.getState().activeMapId : null;

      await useMapStore.getState().setActiveMap(projectLocalId, mapId);

      if (previousMapId !== null) {
        await closeSmpReader(previousMapId);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      void queryClient.invalidateQueries({
        queryKey: mapsQueryKey(projectLocalId),
      });
    },
  });
}

export function useDownloadMap() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      map,
      onProgress,
      signal,
      mapboxAccessToken,
    }: {
      map: SavedMap;
      onProgress?: (progress: DownloadProgress) => void;
      signal?: AbortSignal;
      mapboxAccessToken?: string;
    }): Promise<string> => {
      return downloadSmp({ map, onProgress, signal, mapboxAccessToken });
    },
    onSuccess: (_mapId, { map }) => {
      void queryClient.invalidateQueries({
        queryKey: mapsQueryKey(map.projectLocalId),
      });
      void queryClient.invalidateQueries({ queryKey: ['map', map.id] });
    },
    onError: (_error, { map }) => {
      void queryClient.invalidateQueries({
        queryKey: mapsQueryKey(map.projectLocalId),
      });
    },
  });
}
