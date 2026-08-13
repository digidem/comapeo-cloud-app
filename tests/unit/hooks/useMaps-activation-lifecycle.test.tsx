import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useSetActiveMapMutation } from '@/hooks/useMaps';
import type { SavedMap } from '@/lib/db';
import { getDb, resetDb } from '@/lib/db';
import { deleteProject } from '@/lib/local-repositories';
import { useMapStore } from '@/stores/map-store';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

async function addProject(localId: string, activeMapId: string | null = null) {
  await getDb().projects.add({
    localId,
    sourceType: 'local',
    sourceId: 'local',
    activeMapId,
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
    dirtyLocal: false,
    deleted: false,
  });
}

function createMap(): SavedMap {
  return {
    id: 'shared-map',
    projectLocalId: 'origin-project',
    name: 'Shared map',
    type: 'raster',
    origin: 'authored',
    styleUrl: 'https://example.com/{z}/{x}/{y}.png',
    bbox: [-70, -5, -60, 2],
    minZoom: 0,
    maxZoom: 14,
    scheme: 'xyz',
    status: 'draft',
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
  };
}

describe('saved-map activation lifecycle', () => {
  beforeEach(async () => {
    await resetDb();
    localStorage.clear();
    useMapStore.setState({ activeProjectLocalId: null, activeMapId: null });
  });

  it('rejects overlapping activation when the map origin project is deleted first', async () => {
    await addProject('target-project');
    await addProject('origin-project');
    await getDb().maps.add(createMap());
    useMapStore.getState().hydrateActiveMap('target-project', null);

    const { result } = renderHook(() => useSetActiveMapMutation(), { wrapper });

    await act(async () => {
      const deletionPromise = deleteProject('origin-project');
      const activationPromise = result.current.mutateAsync({
        targetProjectLocalId: 'target-project',
        mapId: 'shared-map',
      });

      await deletionPromise;
      await expect(activationPromise).rejects.toThrow(
        'Map not found: shared-map',
      );
    });

    expect(await getDb().maps.get('shared-map')).toBeUndefined();
    expect(
      (await getDb().projects.get('target-project'))?.activeMapId,
    ).toBeNull();
    expect(useMapStore.getState().activeMapId).toBeNull();
  });
});
