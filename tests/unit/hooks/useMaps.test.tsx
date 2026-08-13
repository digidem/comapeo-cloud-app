import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import {
  allMapsQueryKey,
  clearDeletedMapFromActiveStore,
  mapsQueryKey,
  removeMapsFromListCaches,
  useAllMaps,
  useCreateMap,
  useDeleteMap,
  useMaps,
  useRenameMap,
  useSetActiveMapMutation,
} from '@/hooks/useMaps';
import type { SavedMap } from '@/lib/db';
import { getDb, resetDb } from '@/lib/db';
import { useMapDownloadStore } from '@/stores/map-download-store';
import { useMapStore } from '@/stores/map-store';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function createWrapper(queryClient = createQueryClient()) {
  return function TestWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

function createMap(overrides: Partial<SavedMap> = {}): SavedMap {
  return {
    id: 'map-1',
    projectLocalId: 'project-1',
    name: 'Territory draft',
    type: 'raster',
    origin: 'authored',
    styleUrl: 'https://example.com/{z}/{x}/{y}.png',
    bbox: [-70, -5, -60, 2],
    minZoom: 0,
    maxZoom: 14,
    scheme: 'xyz',
    status: 'draft',
    createdAt: '2026-06-29T10:00:00.000Z',
    updatedAt: '2026-06-29T10:00:00.000Z',
    ...overrides,
  };
}

async function addProject(localId: string, activeMapId?: string | null) {
  await getDb().projects.add({
    localId,
    sourceType: 'local',
    sourceId: 'local',
    activeMapId,
    createdAt: '2026-06-29T00:00:00.000Z',
    updatedAt: '2026-06-29T00:00:00.000Z',
    dirtyLocal: false,
    deleted: false,
  });
}

describe('map query cache helpers', () => {
  it('uses a structurally distinct key for the all-projects map list', () => {
    expect(allMapsQueryKey).not.toEqual(mapsQueryKey('all-projects'));
  });

  it('removes deleted maps synchronously from every cached map list', () => {
    const queryClient = new QueryClient();
    const keptMap = createMap({ id: 'map-2', projectLocalId: 'project-2' });
    const deletedMap = createMap({ id: 'map-1' });

    queryClient.setQueryData(mapsQueryKey('project-1'), [deletedMap]);
    queryClient.setQueryData(allMapsQueryKey, [deletedMap, keptMap]);

    removeMapsFromListCaches(queryClient, ['map-1']);

    expect(queryClient.getQueryData(mapsQueryKey('project-1'))).toEqual([]);
    expect(queryClient.getQueryData(allMapsQueryKey)).toEqual([keptMap]);
  });
});

describe('map list observer consistency', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('updates project and all-project observers after rename', async () => {
    await getDb().maps.add(createMap());
    const queryClient = createQueryClient();
    const observerWrapper = createWrapper(queryClient);
    const { result } = renderHook(
      () => ({
        projectMaps: useMaps('project-1'),
        allMaps: useAllMaps(),
        renameMap: useRenameMap(),
      }),
      { wrapper: observerWrapper },
    );

    await waitFor(() => {
      expect(result.current.projectMaps.data?.[0]?.name).toBe(
        'Territory draft',
      );
      expect(result.current.allMaps.data?.[0]?.name).toBe('Territory draft');
    });

    await act(async () => {
      await result.current.renameMap.mutateAsync({
        mapId: 'map-1',
        name: 'Renamed territory',
      });
    });

    await waitFor(() => {
      expect(result.current.projectMaps.data?.[0]?.name).toBe(
        'Renamed territory',
      );
      expect(result.current.allMaps.data?.[0]?.name).toBe('Renamed territory');
    });
  });

  it('removes a deleted map from project and all-project observers', async () => {
    await getDb().maps.add(createMap());
    const queryClient = createQueryClient();
    const observerWrapper = createWrapper(queryClient);
    const { result } = renderHook(
      () => ({
        projectMaps: useMaps('project-1'),
        allMaps: useAllMaps(),
        deleteMap: useDeleteMap(),
      }),
      { wrapper: observerWrapper },
    );

    await waitFor(() => {
      expect(result.current.projectMaps.data).toHaveLength(1);
      expect(result.current.allMaps.data).toHaveLength(1);
    });

    await act(async () => {
      await result.current.deleteMap.mutateAsync('map-1');
    });

    await waitFor(() => {
      expect(result.current.projectMaps.data).toEqual([]);
      expect(result.current.allMaps.data).toEqual([]);
    });
  });
});

describe('useCreateMap', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('persists authored maps with an explicit origin', async () => {
    const map = createMap();
    const { result } = renderHook(() => useCreateMap(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(map);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(await getDb().maps.get(map.id)).toEqual(map);
  });

  it('rejects new maps that omit the origin marker', async () => {
    const map = createMap({ origin: undefined });
    const { result } = renderHook(() => useCreateMap(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync(map)).rejects.toThrow(
        'Authored maps require an explicit origin and style URL',
      );
    });

    expect(await getDb().maps.get(map.id)).toBeUndefined();
  });

  it('persists ready imported SMP records with an explicit imported origin', async () => {
    const map = createMap({
      id: 'imported-map',
      type: 'style',
      origin: 'imported',
      styleUrl: '',
      scheme: undefined,
      status: 'ready',
      smpBlob: new Blob(['smp']),
      smpSize: 3,
    });
    const { result } = renderHook(() => useCreateMap(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(map);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(await getDb().maps.get(map.id)).toEqual(
      expect.objectContaining({
        id: map.id,
        origin: 'imported',
        type: 'style',
        styleUrl: '',
        status: 'ready',
        smpSize: 3,
      }),
    );
  });
});

describe('useDeleteMap', () => {
  beforeEach(async () => {
    await resetDb();
    localStorage.clear();
    useMapStore.setState({ activeProjectLocalId: null, activeMapId: null });
    useMapDownloadStore.setState({ active: null });
  });

  it('clears the active map in the store when the deleted map is active for the current project', async () => {
    await addProject('project-1', 'map-1');
    await getDb().maps.add(createMap());
    useMapStore.getState().hydrateActiveMap('project-1', 'map-1');

    const { result } = renderHook(() => useDeleteMap(), {
      wrapper,
    });
    result.current.mutate('map-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(useMapStore.getState().activeMapId).toBeNull();
    expect(useMapStore.getState().activeProjectLocalId).toBe('project-1');
  });

  it('clears the deleted map from whichever project is currently hydrated', async () => {
    await addProject('project-1', 'map-1');
    await addProject('project-2', 'map-1');
    await getDb().maps.add(createMap());
    useMapStore.getState().hydrateActiveMap('project-2', 'map-1');

    const { result } = renderHook(() => useDeleteMap(), { wrapper });
    result.current.mutate('map-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(useMapStore.getState().activeProjectLocalId).toBe('project-2');
    expect(useMapStore.getState().activeMapId).toBeNull();
    expect((await getDb().projects.get('project-2'))?.activeMapId).toBeNull();
  });

  it('does not touch the store when the deleted map is not the active one', async () => {
    await addProject('project-1', 'map-2');
    await getDb().maps.add(createMap());
    useMapStore.getState().hydrateActiveMap('project-1', 'map-2');

    const { result } = renderHook(() => useDeleteMap(), {
      wrapper,
    });
    result.current.mutate('map-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(useMapStore.getState().activeMapId).toBe('map-2');
  });

  it('does not clear a newer selection after the active project changes', () => {
    useMapStore.getState().hydrateActiveMap('project-1', 'map-1');
    useMapStore.getState().hydrateActiveMap('project-2', 'map-2');

    clearDeletedMapFromActiveStore('map-1');

    expect(useMapStore.getState().activeProjectLocalId).toBe('project-2');
    expect(useMapStore.getState().activeMapId).toBe('map-2');
  });

  it('removes the map and clears activeMapId on every referencing project row', async () => {
    await addProject('project-1', 'map-1');
    await addProject('project-2', 'map-1');
    await getDb().maps.add(createMap());

    const { result } = renderHook(() => useDeleteMap(), {
      wrapper,
    });
    result.current.mutate('map-1');

    await waitFor(async () => {
      expect(await getDb().maps.get('map-1')).toBeUndefined();
      expect((await getDb().projects.get('project-1'))?.activeMapId).toBeNull();
      expect((await getDb().projects.get('project-2'))?.activeMapId).toBeNull();
    });
  });

  it('cancels and clears an active download before deleting its map', async () => {
    await addProject('project-1', 'map-1');
    await getDb().maps.add(createMap({ status: 'downloading' }));
    const cancel = vi.fn();
    useMapDownloadStore.getState().start({
      mapId: 'map-1',
      mapName: 'Territory draft',
      cancel,
    });

    const { result } = renderHook(() => useDeleteMap(), {
      wrapper,
    });
    result.current.mutate('map-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(cancel).toHaveBeenCalledOnce();
    expect(useMapDownloadStore.getState().active).toBeNull();
    expect(await getDb().maps.get('map-1')).toBeUndefined();
  });

  it('recovers a cancelled download when map deletion fails', async () => {
    await addProject('project-1', 'map-1');
    await getDb().maps.add(createMap({ status: 'downloading' }));
    const cancel = vi.fn();
    useMapDownloadStore.getState().start({
      mapId: 'map-1',
      mapName: 'Territory draft',
      cancel,
    });
    vi.spyOn(getDb().maps, 'delete').mockRejectedValueOnce(
      new Error('delete failed'),
    );

    const { result } = renderHook(() => useDeleteMap(), { wrapper });
    result.current.mutate('map-1');

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(cancel).toHaveBeenCalledOnce();
    expect(useMapDownloadStore.getState().active).toBeNull();
    expect(await getDb().maps.get('map-1')).toMatchObject({ status: 'draft' });
  });
});

describe('useSetActiveMapMutation', () => {
  beforeEach(async () => {
    await resetDb();
    localStorage.clear();
    useMapStore.setState({ activeProjectLocalId: null, activeMapId: null });
  });

  it('rejects and rolls back the store when the project update touches zero rows', async () => {
    useMapStore.getState().hydrateActiveMap('missing-project', 'map-before');

    const { result } = renderHook(() => useSetActiveMapMutation(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          targetProjectLocalId: 'missing-project',
          mapId: 'map-after',
        }),
      ).rejects.toThrow('Project not found: missing-project');
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(useMapStore.getState().activeProjectLocalId).toBe('missing-project');
    expect(useMapStore.getState().activeMapId).toBe('map-before');
    expect(await getDb().projects.get('missing-project')).toBeUndefined();
  });
});
