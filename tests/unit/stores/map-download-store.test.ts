import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useMapDownloadStore } from '@/stores/map-download-store';

describe('useMapDownloadStore', () => {
  beforeEach(() => {
    useMapDownloadStore.setState({ active: null });
  });

  it('tracks an active download and its progress', () => {
    const cancel = vi.fn();
    useMapDownloadStore.getState().start({
      mapId: 'map-1',
      mapName: 'Forest Map',
      cancel,
    });

    expect(useMapDownloadStore.getState().active).toMatchObject({
      mapId: 'map-1',
      mapName: 'Forest Map',
      progress: null,
      cancel,
    });

    useMapDownloadStore.getState().updateProgress('map-1', {
      downloaded: 4,
      total: 10,
      bytes: 4096,
      skipped: 1,
    });

    expect(useMapDownloadStore.getState().active?.progress).toEqual({
      downloaded: 4,
      total: 10,
      bytes: 4096,
      skipped: 1,
    });
  });

  it('ignores progress and clear operations for another map', () => {
    const cancel = vi.fn();
    useMapDownloadStore.getState().start({
      mapId: 'map-1',
      mapName: 'Forest Map',
      cancel,
    });

    useMapDownloadStore.getState().updateProgress('map-2', {
      downloaded: 1,
      total: 2,
      bytes: 1024,
      skipped: 0,
    });
    useMapDownloadStore.getState().clear('map-2');

    expect(useMapDownloadStore.getState().active).toMatchObject({
      mapId: 'map-1',
      progress: null,
    });
  });

  it('clears the matching active download', () => {
    useMapDownloadStore.getState().start({
      mapId: 'map-1',
      mapName: 'Forest Map',
      cancel: vi.fn(),
    });

    useMapDownloadStore.getState().clear('map-1');

    expect(useMapDownloadStore.getState().active).toBeNull();
  });
});
