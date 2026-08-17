import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import type { SavedMap } from '@/lib/db';
import { getDb } from '@/lib/db';
import { recoverCancelledMapDownload } from '@/lib/map/saved-map-lifecycle';
import { isImportedSmpRecord } from '@/lib/map/saved-map-utils';
import type { DownloadProgress } from '@/lib/map/smp-download';
import { downloadSmp } from '@/lib/map/smp-download';
import { useMapDownloadStore } from '@/stores/map-download-store';
import { useMapStore } from '@/stores/map-store';

export const mapsQueryKey = (projectLocalId: string | null) =>
  ['maps', { scope: 'project', projectLocalId }] as const;

export const allMapsQueryKey = ['maps', { scope: 'all' }] as const;

export function removeMapsFromListCaches(
  queryClient: QueryClient,
  mapIds: Iterable<string>,
): void {
  const removedMapIds = new Set(mapIds);
  if (removedMapIds.size === 0) return;

  queryClient.setQueriesData<SavedMap[]>({ queryKey: ['maps'] }, (maps) =>
    maps?.filter((map) => !removedMapIds.has(map.id)),
  );
}

export function clearDeletedMapFromActiveStore(mapId: string): void {
  const storeState = useMapStore.getState();
  if (storeState.activeMapId === mapId) {
    storeState.hydrateActiveMap(storeState.activeProjectLocalId, null);
  }
}

function sortMapsNewestFirst(maps: SavedMap[]): SavedMap[] {
  return [...maps].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

type NewSavedMap = SavedMap & { smpData?: ArrayBuffer };

function assertValidNewMapOrigin(map: NewSavedMap): void {
  if (map.origin === 'imported') {
    const hasPackageBytes = Boolean(map.smpBlob || map.smpData);
    if (
      !isImportedSmpRecord(map) ||
      map.status !== 'ready' ||
      !hasPackageBytes
    ) {
      throw new Error(
        'Imported maps must be ready self-contained style packages',
      );
    }
    return;
  }

  if (map.origin !== 'authored' || map.styleUrl.length === 0) {
    throw new Error('Authored maps require an explicit origin and style URL');
  }
}

export function useMaps(projectLocalId: string | null, enabled = true) {
  return useQuery({
    queryKey: mapsQueryKey(projectLocalId),
    queryFn: async () => {
      const db = getDb();
      const maps = await db.maps
        .where('projectLocalId')
        .equals(projectLocalId!)
        .toArray();
      return sortMapsNewestFirst(maps);
    },
    enabled: enabled && projectLocalId !== null,
  });
}

export function useAllMaps(enabled = true) {
  return useQuery({
    queryKey: allMapsQueryKey,
    queryFn: async () => sortMapsNewestFirst(await getDb().maps.toArray()),
    enabled,
  });
}

export function useCreateMap() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (map: NewSavedMap) => {
      assertValidNewMapOrigin(map);
      const db = getDb();

      if (map.origin === 'imported') {
        const packageData = map.smpData ?? (await map.smpBlob!.arrayBuffer());
        const {
          smpBlob: _legacyBlob,
          smpData: _packageData,
          ...persistedMap
        } = map;
        await db.transaction('rw', [db.maps, db.mapPackages], async () => {
          await db.maps.add(persistedMap);
          await db.mapPackages.put({
            mapId: map.id,
            data: packageData,
            contentType: 'application/zip',
            updatedAt: map.updatedAt,
          });
        });
        return persistedMap;
      }

      await db.maps.add(map);
      return map;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['maps'] });
    },
  });
}

export function useRenameMap() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ mapId, name }: { mapId: string; name: string }) => {
      const updatedAt = new Date().toISOString();
      await getDb().maps.update(mapId, { name, updatedAt });
    },
    onSuccess: (_data, { mapId }) => {
      void queryClient.invalidateQueries({ queryKey: ['maps'] });
      void queryClient.invalidateQueries({ queryKey: ['map', mapId] });
    },
  });
}

export function useDeleteMap() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (mapId: string) => {
      const downloadState = useMapDownloadStore.getState();
      const cancelledDownload = downloadState.active?.mapId === mapId;
      if (cancelledDownload) downloadState.active?.cancel();

      const db = getDb();
      const updatedAt = new Date().toISOString();
      try {
        await db.transaction(
          'rw',
          [db.maps, db.mapPackages, db.projects],
          async () => {
            await db.maps.delete(mapId);
            await db.mapPackages.delete(mapId);
            await db.projects
              .filter((project) => project.activeMapId === mapId)
              .modify((project) => {
                project.activeMapId = null;
                project.updatedAt = updatedAt;
              });
          },
        );
      } catch (error) {
        if (cancelledDownload) {
          await recoverCancelledMapDownload(mapId);
          useMapDownloadStore.getState().clear(mapId);
        }
        throw error;
      }

      if (cancelledDownload) useMapDownloadStore.getState().clear(mapId);
      clearDeletedMapFromActiveStore(mapId);
    },
    onSuccess: (_data, mapId) => {
      removeMapsFromListCaches(queryClient, [mapId]);
      queryClient.removeQueries({ queryKey: ['map', mapId], exact: true });
      void queryClient.invalidateQueries({ queryKey: ['maps'] });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useSetActiveMapMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      targetProjectLocalId,
      mapId,
    }: {
      targetProjectLocalId: string;
      mapId: string | null;
    }) => {
      await useMapStore.getState().setActiveMap(targetProjectLocalId, mapId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      void queryClient.invalidateQueries({ queryKey: ['maps'] });
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
      includeGlobalOverview,
    }: {
      map: SavedMap;
      onProgress?: (progress: DownloadProgress) => void;
      signal?: AbortSignal;
      mapboxAccessToken?: string;
      includeGlobalOverview?: boolean;
    }): Promise<string> => {
      return downloadSmp({
        map,
        onProgress,
        signal,
        mapboxAccessToken,
        includeGlobalOverview,
      });
    },
    onSuccess: (_mapId, { map }) => {
      void queryClient.invalidateQueries({ queryKey: ['maps'] });
      void queryClient.invalidateQueries({ queryKey: ['map', map.id] });
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: ['maps'] });
    },
  });
}
