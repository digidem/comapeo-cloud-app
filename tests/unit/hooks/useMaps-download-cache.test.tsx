import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useAllMaps, useDownloadMap, useMaps } from '@/hooks/useMaps';
import type { SavedMap } from '@/lib/db';
import { getDb, resetDb } from '@/lib/db';
import { downloadSmp } from '@/lib/map/smp-download';

vi.mock('@/lib/map/smp-download', () => ({
  downloadSmp: vi.fn(),
}));

function createMap(): SavedMap {
  return {
    id: 'map-1',
    projectLocalId: 'project-1',
    name: 'Territory map',
    type: 'raster',
    origin: 'authored',
    styleUrl: 'https://example.com/{z}/{x}/{y}.png',
    bbox: [-70, -5, -60, 2],
    minZoom: 0,
    maxZoom: 14,
    scheme: 'xyz',
    status: 'draft',
    createdAt: '2026-08-12T12:00:00.000Z',
    updatedAt: '2026-08-12T12:00:00.000Z',
  };
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('useDownloadMap cache consistency', () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
  });

  it('invalidates the exact map query when a download fails', async () => {
    const map = createMap();
    vi.mocked(downloadSmp).mockRejectedValueOnce(new Error('download failed'));

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = createWrapper(queryClient);
    const { result } = renderHook(() => useDownloadMap(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ map })).rejects.toThrow(
        'download failed',
      );
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['map', map.id],
      exact: true,
    });
  });

  it('refreshes project and all-project observers after download completion', async () => {
    const map = createMap();
    await getDb().maps.add(map);
    vi.mocked(downloadSmp).mockImplementationOnce(async ({ map: inputMap }) => {
      await getDb().maps.update(inputMap.id, {
        status: 'ready',
        smpBlob: new Blob(['smp']),
        smpSize: 3,
        updatedAt: '2026-08-12T13:00:00.000Z',
      });
      return inputMap.id;
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });
    const wrapper = createWrapper(queryClient);
    const { result } = renderHook(
      () => ({
        projectMaps: useMaps('project-1'),
        allMaps: useAllMaps(),
        downloadMap: useDownloadMap(),
      }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.projectMaps.data?.[0]?.status).toBe('draft');
      expect(result.current.allMaps.data?.[0]?.status).toBe('draft');
    });

    await act(async () => {
      await result.current.downloadMap.mutateAsync({ map });
    });

    await waitFor(() => {
      expect(result.current.projectMaps.data?.[0]?.status).toBe('ready');
      expect(result.current.allMaps.data?.[0]?.status).toBe('ready');
    });
  });
});
