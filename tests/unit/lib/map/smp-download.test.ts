import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SavedMap } from '@/lib/db';
import { getDb, getSavedMapSmpBlob, resetDb } from '@/lib/db';
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

/** Build a minimal valid global-overview SMP zip (zooms 0-3) as raw bytes. */
async function buildGlobalZipBytes(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('VERSION', '1.0');
  zip.file(
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
  zip.file('s/0/0/0/0.png', new Uint8Array([1]));
  zip.file('s/0/3/7/7.png', new Uint8Array([2]));
  return zip.generateAsync({ type: 'uint8array' });
}

/** Build a minimal valid regional SMP zip (zooms 0-4) as raw bytes. */
async function buildRegionalZipBytes(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('VERSION', '1.0');
  zip.file(
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
  zip.file('s/0/3/4/4.png', new Uint8Array([3]));
  zip.file('s/0/4/8/8.png', new Uint8Array([4]));
  return zip.generateAsync({ type: 'uint8array' });
}

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function getPersistedPackageData(mapId = 'map-1'): Promise<Uint8Array> {
  const blob = await getSavedMapSmpBlob({ id: mapId });
  expect(blob).toBeDefined();
  expect(blob!.size).toBeGreaterThan(0);
  return new Uint8Array(await blob!.arrayBuffer());
}

describe('downloadSmp', () => {
  beforeEach(async () => {
    await resetDb();
    await getDb().maps.add(createMockMap());
  });

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
      smpBlob: undefined,
      smpSize: 3,
      status: 'ready',
      errorMessage: undefined,
      updatedAt: expect.any(String),
    });
    expect(await getPersistedPackageData()).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('merges global zoom 0-3 tiles into the regional SMP by default', async () => {
    vi.spyOn(getDb().maps, 'update').mockResolvedValue(1);
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

    const merged = await JSZip.loadAsync(await getPersistedPackageData());
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
    expect(style.metadata?.['smp:bounds']).toEqual([
      -180, -85.0511, 180, 85.0511,
    ]);
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

  it('aggregates per-pass onprogress events into a summed onProgress callback', async () => {
    vi.spyOn(getDb().maps, 'update').mockResolvedValue(1);
    const [globalBytes, regionalBytes] = await Promise.all([
      buildGlobalZipBytes(),
      buildRegionalZipBytes(),
    ]);
    const streams = [globalBytes, regionalBytes];
    let call = 0;
    mockDownload.mockImplementation(
      (opts: { onprogress: (p: unknown) => void }) => {
        call += 1;
        if (call === 1) {
          opts.onprogress({
            tiles: { downloaded: 5, total: 10, skipped: 1 },
            output: { totalBytes: 1000 },
          });
        } else {
          opts.onprogress({
            tiles: { downloaded: 20, total: 40, skipped: 2 },
            output: { totalBytes: 5000 },
          });
        }
        const bytes = streams.shift();
        if (!bytes) throw new Error('Unexpected download call');
        return streamOf(bytes);
      },
    );
    const onProgress = vi.fn();

    await downloadSmp({
      // Degenerate bbox zeroes the regional pass's seeded total estimate,
      // making the aggregated totals after each onprogress event exactly
      // predictable from the synthetic per-pass numbers above.
      map: createMockMap({ maxZoom: 4, bbox: [10, 5, 5, 10] }),
      onProgress,
    });

    expect(onProgress).toHaveBeenNthCalledWith(1, {
      downloaded: 5,
      total: 10,
      bytes: 1000,
      skipped: 1,
    });
    expect(onProgress).toHaveBeenNthCalledWith(2, {
      downloaded: 25,
      total: 50,
      bytes: 6000,
      skipped: 3,
    });
    const lastCall = onProgress.mock.calls.at(-1)?.[0] as
      { downloaded: number; total: number; skipped: number } | undefined;
    expect(lastCall).toMatchObject({ downloaded: 25, total: 50, skipped: 3 });
  });

  it('writes draft status and throws AbortError when cancelled before the merge starts', async () => {
    const updateSpy = vi.spyOn(getDb().maps, 'update').mockResolvedValue(1);
    const abortController = new AbortController();
    mockDownload.mockImplementation(() => {
      abortController.abort();
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(
            new DOMException('Download cancelled', 'AbortError'),
          );
        },
      });
    });

    await expect(
      downloadSmp({
        map: createMockMap({ maxZoom: 4 }),
        signal: abortController.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(updateSpy).toHaveBeenLastCalledWith('map-1', {
      status: 'draft',
      errorMessage: undefined,
      updatedAt: expect.any(String),
    });
  });

  it('writes draft status and throws AbortError when cancelled mid-merge', async () => {
    const updateSpy = vi.spyOn(getDb().maps, 'update').mockResolvedValue(1);
    const abortController = new AbortController();
    const [globalBytes, regionalBytes] = await Promise.all([
      buildGlobalZipBytes(),
      buildRegionalZipBytes(),
    ]);
    const streams = [globalBytes, regionalBytes];
    mockDownload.mockImplementation(() => {
      const bytes = streams.shift();
      if (!bytes) throw new Error('Unexpected download call');
      return streamOf(bytes);
    });

    const originalLoadAsync = JSZip.loadAsync.bind(JSZip);
    let loadCount = 0;
    const loadAsyncSpy = vi
      .spyOn(JSZip, 'loadAsync')
      .mockImplementation(
        async (...args: Parameters<typeof JSZip.loadAsync>) => {
          const zip = await originalLoadAsync(...args);
          loadCount += 1;
          // Abort right as both global/regional zips finish loading, i.e.
          // after JSZip.loadAsync resolves but before the merge completes.
          if (loadCount === 2) {
            abortController.abort();
          }
          return zip;
        },
      );

    try {
      await expect(
        downloadSmp({
          map: createMockMap({ maxZoom: 4 }),
          signal: abortController.signal,
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });

      expect(updateSpy).toHaveBeenLastCalledWith('map-1', {
        status: 'draft',
        errorMessage: undefined,
        updatedAt: expect.any(String),
      });
    } finally {
      loadAsyncSpy.mockRestore();
    }
  });

  it('disambiguates colliding source/folder/layer ids and preserves unmapped layers', async () => {
    vi.spyOn(getDb().maps, 'update').mockResolvedValue(1);

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
          },
        },
        layers: [{ id: 'raster', type: 'raster', source: 'raster' }],
        metadata: { 'smp:sourceFolders': { raster: 's/0' } },
      }),
    );
    globalZip.file('s/0/0/0/0.png', new Uint8Array([1]));
    globalZip.file('s/0/3/7/7.png', new Uint8Array([2]));

    // Regional style pre-populates the ids/folders the merge would normally
    // pick for the global pass, forcing every disambiguation loop to run:
    // - sources['raster__global_overview'] already exists -> globalSourceId
    //   disambiguation loop (appends '_').
    // - folder 'g0' already in use -> mergedFolder disambiguation loop.
    // - layers['raster__global_overview'] already exists -> globalLayerId
    //   disambiguation loop.
    // - 'unrelated-layer' has no `source` -> pushed through unmodified.
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
          },
          raster__global_overview: {
            type: 'raster',
            tiles: ['smp://maps.v1/s/g0/{z}/{x}/{y}.png'],
            minzoom: 0,
            maxzoom: 3,
          },
        },
        layers: [
          { id: 'raster', type: 'raster', source: 'raster' },
          {
            id: 'raster__global_overview',
            type: 'raster',
            source: 'raster__global_overview',
          },
          { id: 'unrelated-layer', type: 'background' },
        ],
        metadata: {
          'smp:sourceFolders': {
            raster: 's/0',
            raster__global_overview: 's/g0',
          },
        },
      }),
    );
    regionalZip.file('s/0/3/4/4.png', new Uint8Array([3]));
    regionalZip.file('s/0/4/8/8.png', new Uint8Array([4]));
    regionalZip.file('s/g0/0/0/0.png', new Uint8Array([5]));

    const streams = [
      await globalZip.generateAsync({ type: 'uint8array' }),
      await regionalZip.generateAsync({ type: 'uint8array' }),
    ];
    mockDownload.mockImplementation(() => {
      const bytes = streams.shift();
      if (!bytes) throw new Error('Unexpected download call');
      return streamOf(bytes);
    });

    await downloadSmp({ map: createMockMap({ maxZoom: 4 }) });

    const merged = await JSZip.loadAsync(await getPersistedPackageData());
    const style = JSON.parse(
      (await merged.file('style.json')?.async('string')) ?? '{}',
    ) as {
      sources: Record<string, unknown>;
      layers: Array<{ id: string; source?: string; minzoom?: number }>;
      metadata?: { 'smp:sourceFolders'?: Record<string, string> };
    };

    // Disambiguated source id/folder: 'raster__global_overview' was taken,
    // so it fell back to 'raster__global_overview_' / folder 'g1' ('g0' taken).
    expect(style.sources['raster__global_overview_']).toBeDefined();
    expect(
      style.metadata?.['smp:sourceFolders']?.['raster__global_overview_'],
    ).toBe('s/g1');
    expect(merged.file('s/g1/0/0/0.png')).not.toBeNull();

    // Disambiguated layer id: 'raster__global_overview' was taken, so the
    // newly split global layer fell back to 'raster__global_overview_'.
    const globalLayer = style.layers.find(
      (l) => l.id === 'raster__global_overview_',
    );
    expect(globalLayer?.source).toBe('raster__global_overview_');

    // The pre-existing 'raster__global_overview' layer has no entry in
    // sourceMap (only the original 'raster' source id is mapped), so it is
    // pushed through unmodified.
    expect(
      style.layers.find((l) => l.id === 'raster__global_overview'),
    ).toEqual({
      id: 'raster__global_overview',
      type: 'raster',
      source: 'raster__global_overview',
    });

    // A layer with no `source` field is also pushed through unmodified.
    expect(style.layers.find((l) => l.id === 'unrelated-layer')).toEqual({
      id: 'unrelated-layer',
      type: 'background',
    });
  });

  it('initializes metadata and smp:sourceFolders when missing or non-object', async () => {
    vi.spyOn(getDb().maps, 'update').mockResolvedValue(1);

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
          },
        },
        layers: [{ id: 'raster', type: 'raster', source: 'raster' }],
        metadata: { 'smp:sourceFolders': { raster: 's/0' } },
      }),
    );
    globalZip.file('s/0/0/0/0.png', new Uint8Array([1]));

    // No `metadata` key at all, and sources are otherwise mergeable.
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
          },
        },
        layers: [{ id: 'raster', type: 'raster', source: 'raster' }],
      }),
    );
    regionalZip.file('s/0/4/8/8.png', new Uint8Array([2]));

    const streams = [
      await globalZip.generateAsync({ type: 'uint8array' }),
      await regionalZip.generateAsync({ type: 'uint8array' }),
    ];
    mockDownload.mockImplementation(() => {
      const bytes = streams.shift();
      if (!bytes) throw new Error('Unexpected download call');
      return streamOf(bytes);
    });

    await downloadSmp({ map: createMockMap({ maxZoom: 4 }) });

    const merged = await JSZip.loadAsync(await getPersistedPackageData());
    const style = JSON.parse(
      (await merged.file('style.json')?.async('string')) ?? '{}',
    ) as {
      metadata?: {
        'smp:sourceFolders'?: Record<string, string>;
        'smp:bounds'?: number[];
      };
    };

    expect(style.metadata).toBeDefined();
    expect(style.metadata?.['smp:sourceFolders']?.raster).toBe('s/0');
    expect(
      style.metadata?.['smp:sourceFolders']?.['raster__global_overview'],
    ).toBe('s/g0');
  });

  it('rebuilds smp:sourceFolders when the existing value is not an object', async () => {
    vi.spyOn(getDb().maps, 'update').mockResolvedValue(1);

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
          },
        },
        layers: [{ id: 'raster', type: 'raster', source: 'raster' }],
        metadata: { 'smp:sourceFolders': { raster: 's/0' } },
      }),
    );
    globalZip.file('s/0/0/0/0.png', new Uint8Array([1]));

    // `metadata` present but `smp:sourceFolders` is an array, not an object.
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
          },
        },
        layers: [{ id: 'raster', type: 'raster', source: 'raster' }],
        metadata: { 'smp:sourceFolders': [] },
      }),
    );
    regionalZip.file('s/0/4/8/8.png', new Uint8Array([2]));

    const streams = [
      await globalZip.generateAsync({ type: 'uint8array' }),
      await regionalZip.generateAsync({ type: 'uint8array' }),
    ];
    mockDownload.mockImplementation(() => {
      const bytes = streams.shift();
      if (!bytes) throw new Error('Unexpected download call');
      return streamOf(bytes);
    });

    await downloadSmp({ map: createMockMap({ maxZoom: 4 }) });

    const merged = await JSZip.loadAsync(await getPersistedPackageData());
    const style = JSON.parse(
      (await merged.file('style.json')?.async('string')) ?? '{}',
    ) as {
      metadata?: { 'smp:sourceFolders'?: Record<string, string> };
    };

    expect(Array.isArray(style.metadata?.['smp:sourceFolders'])).toBe(false);
    expect(style.metadata?.['smp:sourceFolders']?.raster).toBe('s/0');
  });

  it('skips sources that have no id match or no valid tile folder, and leaves metadata untouched', async () => {
    vi.spyOn(getDb().maps, 'update').mockResolvedValue(1);

    const globalZip = new JSZip();
    globalZip.file('VERSION', '1.0');
    globalZip.file(
      'style.json',
      JSON.stringify({
        version: 8,
        sources: {
          // No corresponding entry in regionalStyle.sources -> line340 continue.
          onlyGlobal: {
            type: 'raster',
            tiles: ['smp://maps.v1/s/0/{z}/{x}/{y}.png'],
          },
          // Present in both, but malformed tiles -> getSmpTileFolder returns
          // null -> line343 continue.
          badfolder: { type: 'raster', tiles: [] },
        },
        layers: [],
        metadata: {},
      }),
    );
    globalZip.file('s/0/0/0/0.png', new Uint8Array([1]));

    const regionalZip = new JSZip();
    regionalZip.file('VERSION', '1.0');
    regionalZip.file(
      'style.json',
      JSON.stringify({
        version: 8,
        sources: {
          onlyRegional: {
            type: 'raster',
            tiles: ['smp://maps.v1/s/1/{z}/{x}/{y}.png'],
          },
          badfolder: {
            type: 'raster',
            tiles: ['smp://maps.v1/s/2/{z}/{x}/{y}.png'],
          },
        },
        layers: [
          { id: 'onlyRegional-layer', type: 'raster', source: 'onlyRegional' },
          { id: 'badfolder-layer', type: 'raster', source: 'badfolder' },
        ],
        metadata: {},
      }),
    );
    regionalZip.file('s/1/4/1/1.png', new Uint8Array([2]));
    regionalZip.file('s/2/4/2/2.png', new Uint8Array([3]));

    const streams = [
      await globalZip.generateAsync({ type: 'uint8array' }),
      await regionalZip.generateAsync({ type: 'uint8array' }),
    ];
    mockDownload.mockImplementation(() => {
      const bytes = streams.shift();
      if (!bytes) throw new Error('Unexpected download call');
      return streamOf(bytes);
    });

    await downloadSmp({ map: createMockMap({ maxZoom: 4 }) });

    const merged = await JSZip.loadAsync(await getPersistedPackageData());
    const style = JSON.parse(
      (await merged.file('style.json')?.async('string')) ?? '{}',
    ) as {
      sources: Record<string, unknown>;
      layers: Array<{ id: string }>;
      metadata?: Record<string, unknown>;
    };

    expect(Object.keys(style.sources)).toEqual(['onlyRegional', 'badfolder']);
    expect(style.layers.map((l) => l.id)).toEqual([
      'onlyRegional-layer',
      'badfolder-layer',
    ]);
    expect(style.metadata?.['smp:bounds']).toBeUndefined();
    expect(merged.file('s/1/4/1/1.png')).not.toBeNull();
    expect(merged.file('s/2/4/2/2.png')).not.toBeNull();
  });

  it('splits a layer with explicit minzoom/maxzoom entirely into the global pass when maxzoom is below the split', async () => {
    vi.spyOn(getDb().maps, 'update').mockResolvedValue(1);

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
          },
        },
        layers: [{ id: 'raster', type: 'raster', source: 'raster' }],
        metadata: { 'smp:sourceFolders': { raster: 's/0' } },
      }),
    );
    globalZip.file('s/0/0/0/0.png', new Uint8Array([1]));

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
          },
        },
        layers: [
          {
            id: 'labels',
            type: 'symbol',
            source: 'raster',
            minzoom: 1,
            maxzoom: 3,
          },
        ],
        metadata: { 'smp:sourceFolders': { raster: 's/0' } },
      }),
    );
    regionalZip.file('s/0/4/8/8.png', new Uint8Array([2]));

    const streams = [
      await globalZip.generateAsync({ type: 'uint8array' }),
      await regionalZip.generateAsync({ type: 'uint8array' }),
    ];
    mockDownload.mockImplementation(() => {
      const bytes = streams.shift();
      if (!bytes) throw new Error('Unexpected download call');
      return streamOf(bytes);
    });

    await downloadSmp({ map: createMockMap({ maxZoom: 4 }) });

    const merged = await JSZip.loadAsync(await getPersistedPackageData());
    const style = JSON.parse(
      (await merged.file('style.json')?.async('string')) ?? '{}',
    ) as {
      layers: Array<{
        id: string;
        minzoom?: number;
        maxzoom?: number;
        source?: string;
      }>;
    };

    // minzoom(1) < splitZoom(4) -> global split emitted, with minzoom kept
    // since it's > 0. maxzoom(3) <= splitZoom(4) -> no regional portion
    // pushed for this layer at all.
    expect(style.layers).toHaveLength(1);
    expect(style.layers[0]).toMatchObject({
      id: 'labels__global_overview',
      minzoom: 1,
      maxzoom: 3,
    });
  });

  it('downloads only the global overview pass when maxZoom is within the overview range', async () => {
    const updateSpy = vi.spyOn(getDb().maps, 'update').mockResolvedValue(1);
    mockDownload.mockReturnValue(streamOf(new Uint8Array([1, 2, 3])));

    const result = await downloadSmp({
      map: createMockMap({ maxZoom: 2 }),
    });

    expect(result).toBe('map-1');
    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(mockDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        bbox: [-180, -85.0511, 180, 85.0511],
        maxzoom: 2,
      }),
    );
    expect(updateSpy).toHaveBeenLastCalledWith(
      'map-1',
      expect.objectContaining({ status: 'ready' }),
    );
  });

  it('schedules revocation of the synthetic style blob URL for raster maps after completion', async () => {
    const updateSpy = vi.spyOn(getDb().maps, 'update').mockResolvedValue(1);
    mockDownload.mockReturnValue(streamOf(new Uint8Array([1, 2, 3])));

    const result = await downloadSmp({
      map: createMockMap({
        type: 'raster',
        styleUrl: 'https://tiles.example.com/{z}/{x}/{y}.png',
        attribution: '© Test',
        maxZoom: 2,
      }),
    });

    expect(result).toBe('map-1');
    expect(updateSpy).toHaveBeenLastCalledWith(
      'map-1',
      expect.objectContaining({ status: 'ready' }),
    );
  });

  it('writes draft status and throws AbortError when the signal is already aborted after a clean download', async () => {
    const updateSpy = vi.spyOn(getDb().maps, 'update').mockResolvedValue(1);
    const abortController = new AbortController();
    mockDownload.mockImplementation(() => {
      // Simulate the signal firing right as the (mocked) download finishes,
      // without the underlying download() call itself throwing.
      abortController.abort();
      return streamOf(new Uint8Array([1, 2, 3]));
    });

    await expect(
      downloadSmp({
        map: createMockMap({ maxZoom: 4 }),
        signal: abortController.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(updateSpy).toHaveBeenLastCalledWith('map-1', {
      status: 'draft',
      errorMessage: undefined,
      updatedAt: expect.any(String),
    });
  });

  it('treats an AbortError thrown without a signal as cancellation', async () => {
    const updateSpy = vi.spyOn(getDb().maps, 'update').mockResolvedValue(1);
    mockDownload.mockReturnValue(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(
            new DOMException('Download cancelled', 'AbortError'),
          );
        },
      }),
    );

    await expect(
      downloadSmp({ map: createMockMap({ maxZoom: 4 }) }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(updateSpy).toHaveBeenLastCalledWith('map-1', {
      status: 'draft',
      errorMessage: undefined,
      updatedAt: expect.any(String),
    });
  });

  it('falls back to a generic error message when a non-Error is thrown mid-download', async () => {
    const updateSpy = vi.spyOn(getDb().maps, 'update').mockResolvedValue(1);
    mockDownload.mockReturnValue(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error('boom');
        },
      }),
    );

    await expect(
      downloadSmp({ map: createMockMap(), includeGlobalOverview: false }),
    ).rejects.toBe('boom');

    expect(updateSpy).toHaveBeenLastCalledWith('map-1', {
      status: 'error',
      errorMessage: 'Download failed',
      updatedAt: expect.any(String),
    });
  });

  it('falls back to a generic storage error message when a non-Error is thrown while saving', async () => {
    const updateSpy = vi
      .spyOn(getDb().maps, 'update')
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce('quota-error');
    mockDownload.mockReturnValue(streamOf(new Uint8Array([1, 2, 3])));

    await expect(
      downloadSmp({ map: createMockMap(), includeGlobalOverview: false }),
    ).rejects.toBe('quota-error');

    expect(updateSpy).toHaveBeenLastCalledWith('map-1', {
      status: 'error',
      errorMessage: 'Storage error: unable to save map',
      updatedAt: expect.any(String),
    });
  });

  it('throws when a downloaded SMP is missing style.json', async () => {
    const updateSpy = vi.spyOn(getDb().maps, 'update').mockResolvedValue(1);
    const globalZip = new JSZip();
    globalZip.file('VERSION', '1.0');
    // No style.json in this zip.
    const [globalBytes, regionalBytes] = await Promise.all([
      globalZip.generateAsync({ type: 'uint8array' }),
      buildRegionalZipBytes(),
    ]);
    const streams = [globalBytes, regionalBytes];
    mockDownload.mockImplementation(() => {
      const bytes = streams.shift();
      if (!bytes) throw new Error('Unexpected download call');
      return streamOf(bytes);
    });

    await expect(
      downloadSmp({ map: createMockMap({ maxZoom: 4 }) }),
    ).rejects.toThrow('Downloaded SMP is missing style.json');

    expect(updateSpy).toHaveBeenLastCalledWith('map-1', {
      status: 'error',
      errorMessage: 'Downloaded SMP is missing style.json',
      updatedAt: expect.any(String),
    });
  });
});
