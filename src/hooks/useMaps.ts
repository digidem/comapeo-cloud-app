import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { SavedMap } from '@/lib/db';
import { getDb } from '@/lib/db';
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
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: mapsQueryKey(projectLocalId),
      });
    },
  });
}

export function useDeleteMap(projectLocalId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (mapId: string) => {
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

      if (useMapStore.getState().activeMapId === mapId) {
        useMapStore.getState().hydrateActiveMap(null);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: mapsQueryKey(projectLocalId),
      });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useSetActiveMapMutation(projectLocalId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (mapId: string | null) => {
      if (!projectLocalId) return;

      await getDb().projects.update(projectLocalId, { activeMapId: mapId });
      useMapStore.getState().hydrateActiveMap(mapId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      void queryClient.invalidateQueries({
        queryKey: mapsQueryKey(projectLocalId),
      });
    },
  });
}
