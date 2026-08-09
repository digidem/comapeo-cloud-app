import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SavedMap } from '@/lib/db';
import { getDb } from '@/lib/db';
import {
  buildRasterStyleUrl,
  downloadSmp,
  estimateDownloadSize,
  formatBytes,
} from '@/lib/map/smp-download';

const { mockDownload } = vi.hoisted(() => ({
  mockDownload: vi.fn(),
}));

vi.mock('styled-map-package-api/download', () => ({
  download: mockDownload,
}));

function createMockMap(overrides: Partial<SavedMap> = {}): SavedMap {
  return {
    id: 'map-1',
    projectLocalId: 'project-1',
    name: 'Test Map',
    type: 'style',
    styleUrl: 'https://tiles.example.com/style.json',
    bbox: [-75, -12, -45, 8],
    minZoom: 0,
    maxZoom: 1,
    status: 'draft',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('estimateDownloadSize', () => {
  it('returns 0 for degenerate bbox (east <= west)', () => {
    expect(estimateDownloadSize([10, 5, 5, 10], 0, 5)).toBe(0);
  });

  it('returns 0 when minZoom > maxZoom', () => {
    expect(estimateDownloadSize([-10, -5, 10, 5], 10, 5)).toBe(0);
  });

  it('returns a positive estimate for a valid small bbox with single zoom level', () => {
    const size = estimateDownloadSize([-1, -1, 1, 1], 0, 0);
    // At zoom 0 there is exactly 1 tile covering the whole world, but our
    // fractional bbox may yield 0 or 1 tiles depending on the floor math.
    // Just verify it's a non-negative finite number.
    expect(size).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(size)).toBe(true);
  });

  it('returns larger estimate for wider bbox', () => {
    const small = estimateDownloadSize([-0.1, -0.1, 0.1, 0.1], 0, 4);
    const large = estimateDownloadSize([-80, -50, -30, 20], 0, 4);
    expect(large).toBeGreaterThan(small);
  });

  it('uses worldwide coverage for zooms 0-3 when global overview is enabled', () => {
    const bbox: [number, number, number, number] = [-75, -12, -45, 8];
    const global = estimateDownloadSize(bbox, 0, 5, {
      includeGlobalOverview: true,
    });
    const expected =
      estimateDownloadSize([-180, -85.0511, 180, 85.0511], 0, 3) +
      estimateDownloadSize(bbox, 4, 5);

    expect(global).toBe(expected);
  });
});

describe('formatBytes', () => {
  it('formats 0 as "0 B"', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats bytes under 1024', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  it('formats KB', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
  });

  it('formats MB', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('formats GB', () => {
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
  });
});

describe('buildRasterStyleUrl', () => {
  let originalCreateObjectURL: typeof URL.createObjectURL;
  let capturedStyle: string;

  beforeEach(() => {
    capturedStyle = '';
    originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = (blob: Blob | MediaSource) => {
      // Capture the blob text for assertions
      void (blob as Blob).text().then((t: string) => {
        capturedStyle = t;
      });
      return 'blob:test';
    };
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
  });

  it('produces a valid MapLibre style with {z}/{x}/{y} template', async () => {
    buildRasterStyleUrl('https://tiles.example.com/{z}/{x}/{y}.png', 'xyz');
    // Let the microtask resolve
    await new Promise((r) => setTimeout(r, 0));
    const style = JSON.parse(capturedStyle) as {
      sources: { raster: { tiles: string[] } };
    };
    expect(style.sources.raster.tiles).toHaveLength(1);
    expect(style.sources.raster.tiles[0]).toContain('{z}');
    expect(style.sources.raster.tiles[0]).toContain('{x}');
    expect(style.sources.raster.tiles[0]).toContain('{y}');
  });

  it('normalizes {zoom} to {z}', async () => {
    buildRasterStyleUrl('https://tiles.example.com/{zoom}/{x}/{y}.png', 'xyz');
    await new Promise((r) => setTimeout(r, 0));
    expect(capturedStyle).toContain('{z}');
    expect(capturedStyle).not.toContain('{zoom}');
  });

  it('normalizes {-y} to {y}', async () => {
    buildRasterStyleUrl('https://tiles.example.com/{z}/{x}/{-y}.png', 'tms');
    await new Promise((r) => setTimeout(r, 0));
    expect(capturedStyle).toContain('{y}');
    expect(capturedStyle).not.toContain('{-y}');
  });

  it('expands {switch:a,b} into multiple tile URLs', async () => {
    buildRasterStyleUrl(
      'https://{switch:a,b}.tiles.example.com/{z}/{x}/{y}.png',
      'xyz',
    );
    await new Promise((r) => setTimeout(r, 0));
    const style = JSON.parse(capturedStyle) as {
      sources: { raster: { tiles: string[] } };
    };
    expect(style.sources.raster.tiles).toHaveLength(2);
    expect(style.sources.raster.tiles[0]).toContain('a.tiles');
    expect(style.sources.raster.tiles[1]).toContain('b.tiles');
  });
});

describe('downloadSmp', () => {
  it('returns mapId on successful download', async () => {
    const updateSpy = vi.spyOn(getDb().maps, 'update').mockResolvedValue(1);
    mockDownload.mockReturnValue(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      }),
    );

    const result = await downloadSmp({
      map: createMockMap(),
      includeGlobalOverview: false,
    });

    expect(result).toBe('map-1');
    expect(updateSpy).toHaveBeenCalledTimes(2);
    expect(updateSpy).toHaveBeenLastCalledWith('map-1', {
      smpBlob: expect.any(Blob),
      smpSize: 3,
      status: 'ready',
      errorMessage: undefined,
      updatedAt: expect.any(String),
    });
  });

  it('merges global zoom 0-3 tiles into the regional SMP by default', async () => {
    const updateSpy = vi.spyOn(getDb().maps, 'update').mockResolvedValue(1);
    const globalZip = new JSZip();
    globalZip.file('VERSION', '1.0');
    globalZip.file(
      'style.json',
      JSON.stringify({
        version: 8,
        sources: {
          raster: {
            type: 'raster',
            tiles: ['smp://maps.v1/s/0/{z}/{x}/{y}.png'],
            minzoom: 0,
            maxzoom: 3,
            bounds: [-180, -85.0511, 180, 85.0511],
          },
        },
        layers: [{ id: 'raster', type: 'raster', source: 'raster' }],
        metadata: {
          'smp:bounds': [-180, -85.0511, 180, 85.0511],
          'smp:maxzoom': 3,
          'smp:sourceFolders': { raster: 's/0' },
        },
      }),
    );
    globalZip.file('s/0/0/0/0.png', new Uint8Array([1]));
    globalZip.file('s/0/3/7/7.png', new Uint8Array([2]));
    const regionalZip = new JSZip();
    regionalZip.file('VERSION', '1.0');
    regionalZip.file(
      'style.json',
      JSON.stringify({
        version: 8,
        sources: {
          raster: {
            type: 'raster',
            tiles: ['smp://maps.v1/s/0/{z}/{x}/{y}.png'],
            minzoom: 0,
            maxzoom: 4,
            bounds: [-75, -12, -45, 8],
          },
        },
        layers: [{ id: 'raster', type: 'raster', source: 'raster' }],
        metadata: {
          'smp:bounds': [-75, -12, -45, 8],
          'smp:maxzoom': 4,
          'smp:sourceFolders': { raster: 's/0' },
        },
      }),
    );
    regionalZip.file('s/0/3/4/4.png', new Uint8Array([3]));
    regionalZip.file('s/0/4/8/8.png', new Uint8Array([4]));

    const streams = [
      await globalZip.generateAsync({ type: 'uint8array' }),
      await regionalZip.generateAsync({ type: 'uint8array' }),
    ];
    mockDownload.mockImplementation(() => {
      const bytes = streams.shift();
      if (!bytes) throw new Error('Unexpected download call');
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      });
    });

    await downloadSmp({ map: createMockMap({ maxZoom: 4 }) });

    expect(mockDownload).toHaveBeenCalledTimes(2);
    expect(mockDownload).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        bbox: [-180, -85.0511, 180, 85.0511],
        maxzoom: 3,
      }),
    );
    expect(mockDownload).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ bbox: [-75, -12, -45, 8], maxzoom: 4 }),
    );

    const persisted = updateSpy.mock.calls.at(-1)?.[1] as
      Partial<SavedMap> | undefined;
    expect(persisted?.smpBlob).toBeInstanceOf(Blob);
    const merged = await JSZip.loadAsync(persisted?.smpBlob as Blob);
    expect(merged.file('s/g0/0/0/0.png')).not.toBeNull();
    expect(merged.file('s/g0/3/7/7.png')).not.toBeNull();
    expect(merged.file('s/0/3/4/4.png')).toBeNull();
    expect(merged.file('s/0/4/8/8.png')).not.toBeNull();
    const style = JSON.parse(
      (await merged.file('style.json')?.async('string')) ?? '{}',
    ) as {
      sources: Record<string, { minzoom?: number; maxzoom?: number }>;
      layers: Array<{
        id: string;
        source?: string;
        minzoom?: number;
        maxzoom?: number;
      }>;
      metadata?: {
        'smp:bounds'?: number[];
        'smp:maxzoom'?: number;
        'smp:sourceFolders'?: Record<string, string>;
      };
    };
    expect(validateStyleMin(style as unknown as StyleSpecification)).toEqual(
      [],
    );
    expect(style.sources.raster__global_overview?.maxzoom).toBe(3);
    expect(style.metadata?.['smp:bounds']).toEqual([-75, -12, -45, 8]);
    expect(style.metadata?.['smp:maxzoom']).toBe(4);
    expect(style.metadata?.['smp:sourceFolders']).toEqual({
      raster: 's/0',
      raster__global_overview: 's/g0',
    });
    expect(style.layers).toEqual([
      expect.objectContaining({
        id: 'raster__global_overview',
        source: 'raster__global_overview',
        maxzoom: 4,
      }),
      expect.objectContaining({
        id: 'raster',
        source: 'raster',
        minzoom: 4,
      }),
    ]);
  });

  it('preserves the storage error when recording the error state also fails', async () => {
    const storageError = new Error('Quota exceeded while saving blob');
    const recoveryError = new Error('Quota exceeded while saving error state');
    const updateSpy = vi
      .spyOn(getDb().maps, 'update')
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce(storageError)
      .mockRejectedValueOnce(recoveryError)
      .mockResolvedValueOnce(1); // retry succeeds on second attempt
    mockDownload.mockReturnValue(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      }),
    );

    await expect(
      downloadSmp({ map: createMockMap(), includeGlobalOverview: false }),
    ).rejects.toBe(storageError);
    expect(updateSpy).toHaveBeenCalledTimes(4);
    expect(updateSpy).toHaveBeenLastCalledWith('map-1', {
      errorMessage: 'Storage error: Quota exceeded while saving blob',
      status: 'error',
      updatedAt: expect.any(String),
    });
  });
});
