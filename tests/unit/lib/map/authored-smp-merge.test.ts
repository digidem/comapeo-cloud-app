import {
  AUTHORED_RASTER_LAYER_FIXTURE,
  AUTHORED_VECTOR_LAYER_FIXTURE,
} from '@tests/fixtures/authored-layers';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';

import {
  sourceFolderForAuthoredLayer,
  sourceLayerIdForAuthoredLayer,
} from '@/lib/map/authored-layers';
import { enumerateAuthoredRasterLayers } from '@/lib/map/authored-raster';
import {
  assertActualMergedSmpSize,
  assertSmpMergedOutputBound,
  mergeSmpWithAuthoredLayers,
} from '@/lib/map/authored-smp-merge';
import { createAuthoredOnlyStyle } from '@/lib/map/authored-style';
import { buildAuthoredWriterSmp } from '@/lib/map/authored-writer';
import {
  GLOBAL_OVERVIEW_BBOX_FOR_MERGE,
  applyAuthoredWriterSources,
  mergeGlobalOverviewStyle,
} from '@/lib/map/smp-merge-plan';
import { MAX_SMP_MERGED_OUTPUT_BYTES } from '@/lib/map/smp-zip';

const MAP = {
  bbox: [-1, -1, 1, 1] as [number, number, number, number],
  minZoom: 0,
  maxZoom: 0,
};

async function makeRegionalZip(
  options: {
    collisionFolder?: string;
    unexpected?: boolean;
    omitMetadata?: boolean;
    omitBounds?: boolean;
    reverseTiles?: boolean;
  } = {},
): Promise<Blob> {
  const zip = new JSZip();
  zip.file('VERSION', '1.0');
  zip.file(
    'style.json',
    JSON.stringify({
      version: 8,
      sources: {
        basemap: {
          type: 'raster',
          tiles: ['smp://maps.v1/s/0/{z}/{x}/{y}.png'],
          minzoom: 0,
          maxzoom: 5,
        },
        ...(options.collisionFolder
          ? {
              collision: {
                type: 'raster',
                tiles: [
                  `smp://maps.v1/s/${options.collisionFolder}/{z}/{x}/{y}.png`,
                ],
              },
            }
          : {}),
      },
      layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
      ...(options.omitMetadata
        ? {}
        : {
            metadata: {
              ...(options.omitBounds ? {} : { 'smp:bounds': MAP.bbox }),
              'smp:maxzoom': 5,
              'smp:sourceFolders': {
                basemap: 's/0',
                ...(options.collisionFolder
                  ? { collision: `s/${options.collisionFolder}` }
                  : {}),
              },
            },
          }),
    }),
  );
  const regionalTiles = [
    ['s/0/0/0/0.png', new Uint8Array([9])],
    ['s/0/4/8/8.png', new Uint8Array([10])],
  ] as const;
  for (const [name, bytes] of options.reverseTiles
    ? [...regionalTiles].reverse()
    : regionalTiles) {
    zip.file(name, bytes);
  }
  if (options.collisionFolder) {
    zip.file(`s/${options.collisionFolder}/0/0/0.png`, new Uint8Array([8]));
  }
  if (options.unexpected) zip.file('unexpected.bin', new Uint8Array([7]));
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

async function makeGlobalZip(): Promise<Blob> {
  const zip = new JSZip();
  zip.file('VERSION', '1.0');
  zip.file(
    'style.json',
    JSON.stringify({
      version: 8,
      sources: {
        basemap: {
          type: 'raster',
          tiles: ['smp://maps.v1/s/0/{z}/{x}/{y}.png'],
          minzoom: 0,
          maxzoom: 3,
        },
      },
      layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
      metadata: {
        'smp:bounds': [-180, -85.0511, 180, 85.0511],
        'smp:maxzoom': 3,
        'smp:sourceFolders': { basemap: 's/0' },
      },
    }),
  );
  zip.file('s/0/0/0/0.png', new Uint8Array([1]));
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

async function makeAuthoredRasterSmp(): Promise<Blob> {
  const authored = createAuthoredOnlyStyle({
    authoredLayers: [AUTHORED_RASTER_LAYER_FIXTURE],
    map: MAP,
  });
  const raster = enumerateAuthoredRasterLayers(MAP, [
    {
      layerId: AUTHORED_RASTER_LAYER_FIXTURE.id,
      sourceId: sourceLayerIdForAuthoredLayer(AUTHORED_RASTER_LAYER_FIXTURE.id),
      source:
        AUTHORED_RASTER_LAYER_FIXTURE.source.type === 'raster-tiles'
          ? AUTHORED_RASTER_LAYER_FIXTURE.source
          : (() => {
              throw new Error('raster fixture');
            })(),
    },
  ]);
  const blob = await buildAuthoredWriterSmp({
    authoredStyle: authored.style,
    rasterLayers: raster,
    fetchTile: vi.fn(async () => ({
      body: new Uint8Array([1, 2, 3]),
      format: 'png' as const,
      bytesReceived: 3n,
    })),
  });
  if (!blob) throw new Error('expected authored raster SMP');
  return blob;
}

describe('mergeSmpWithAuthoredLayers', () => {
  it('uses bounded input parsing, renames Writer folder deterministically, and emits one final style', async () => {
    const regionalBlob = await makeRegionalZip();
    const authoredBlob = await makeAuthoredRasterSmp();
    const loadSpy = vi.spyOn(JSZip, 'loadAsync');
    const finalBlob = await mergeSmpWithAuthoredLayers({
      regionalBlob,
      authoredBlob,
      authoredLayers: [
        AUTHORED_VECTOR_LAYER_FIXTURE,
        AUTHORED_RASTER_LAYER_FIXTURE,
      ],
      map: MAP,
    });
    expect(loadSpy).not.toHaveBeenCalled();
    loadSpy.mockRestore();

    const finalZip = await JSZip.loadAsync(await finalBlob.arrayBuffer());
    const finalStyle = JSON.parse(
      await finalZip.file('style.json')!.async('string'),
    ) as {
      sources: Record<string, { tiles?: string[]; data?: unknown }>;
      layers: Array<{
        id: string;
        source?: string;
        layout?: { visibility?: string };
      }>;
      metadata?: { 'smp:sourceFolders'?: Record<string, string> };
    };
    const rasterSourceId = sourceLayerIdForAuthoredLayer(
      AUTHORED_RASTER_LAYER_FIXTURE.id,
    );
    const vectorSourceId = sourceLayerIdForAuthoredLayer(
      AUTHORED_VECTOR_LAYER_FIXTURE.id,
    );
    const targetFolder = await sourceFolderForAuthoredLayer(
      AUTHORED_RASTER_LAYER_FIXTURE.id,
    );
    expect(finalStyle.sources[rasterSourceId]?.tiles?.[0]).toBe(
      `smp://maps.v1/s/${targetFolder}/{z}/{x}/{y}.png`,
    );
    expect(finalStyle.metadata?.['smp:sourceFolders']?.[rasterSourceId]).toBe(
      `s/${targetFolder}`,
    );
    expect(finalStyle.sources[vectorSourceId]?.data).toEqual(
      AUTHORED_VECTOR_LAYER_FIXTURE.source.type === 'geojson'
        ? AUTHORED_VECTOR_LAYER_FIXTURE.source.data
        : undefined,
    );
    expect(finalZip.file(`s/${targetFolder}/0/0/0.png`)).not.toBeNull();
    expect(finalZip.file('s/0/0/0/0.png')).not.toBeNull();
    const authoredFragments = finalStyle.layers.filter((layer) =>
      layer.id.startsWith('comapeo-authored:'),
    );
    expect(authoredFragments).toHaveLength(5);
    for (const fragment of authoredFragments) {
      expect(fragment.layout?.visibility).toBe('none');
    }
    expect(JSON.stringify(finalStyle)).not.toContain(
      'https://tiles.example.com',
    );
    expect(JSON.stringify(finalStyle)).not.toContain('blob:');
  });

  it('rejects a MapLibre-invalid final style introduced by Writer source rewriting', async () => {
    const authoredBlob = await makeAuthoredRasterSmp();
    const writerZip = await JSZip.loadAsync(await authoredBlob.arrayBuffer());
    const writerStyleFile = writerZip.file('style.json');
    expect(writerStyleFile).not.toBeNull();
    const writerStyle = JSON.parse(await writerStyleFile!.async('string')) as {
      sources: Record<string, Record<string, unknown>>;
    };
    const sourceId = sourceLayerIdForAuthoredLayer(
      AUTHORED_RASTER_LAYER_FIXTURE.id,
    );
    writerStyle.sources[sourceId] = {
      ...writerStyle.sources[sourceId],
      type: 'not-a-maplibre-source',
    };
    writerZip.file('style.json', JSON.stringify(writerStyle));
    const malformedWriterBlob = await writerZip.generateAsync({
      type: 'blob',
      compression: 'STORE',
    });

    await expect(
      mergeSmpWithAuthoredLayers({
        regionalBlob: await makeRegionalZip(),
        authoredBlob: malformedWriterBlob,
        authoredLayers: [AUTHORED_RASTER_LAYER_FIXTURE],
        map: MAP,
      }),
    ).rejects.toThrow(/MapLibre|style/i);
  });

  it('supports vector-only authored merge when the regional style has no metadata', async () => {
    const regionalBlob = await makeRegionalZip({ omitMetadata: true });
    const finalBlob = await mergeSmpWithAuthoredLayers({
      regionalBlob,
      authoredLayers: [AUTHORED_VECTOR_LAYER_FIXTURE],
      map: MAP,
    });
    const finalZip = await JSZip.loadAsync(await finalBlob.arrayBuffer());
    const finalStyle = JSON.parse(
      await finalZip.file('style.json')!.async('string'),
    ) as {
      sources: Record<string, unknown>;
      metadata?: unknown;
    };
    expect(
      finalStyle.sources[
        sourceLayerIdForAuthoredLayer(AUTHORED_VECTOR_LAYER_FIXTURE.id)
      ],
    ).toBeDefined();
    expect(Object.hasOwn(finalStyle, 'metadata')).toBe(false);
  });

  it('merges the global overview before authored layers and remaps bounded resources', async () => {
    const regionalBlob = await makeRegionalZip();
    const globalBlob = await makeGlobalZip();
    const finalBlob = await mergeSmpWithAuthoredLayers({
      regionalBlob,
      globalBlob,
      authoredLayers: [AUTHORED_VECTOR_LAYER_FIXTURE],
      map: MAP,
    });
    const finalZip = await JSZip.loadAsync(await finalBlob.arrayBuffer());
    const finalStyle = JSON.parse(
      await finalZip.file('style.json')!.async('string'),
    ) as {
      sources: Record<string, { tiles?: string[] }>;
      layers: Array<{
        id: string;
        source?: string;
        minzoom?: number;
        maxzoom?: number;
      }>;
      metadata?: Record<string, unknown>;
    };

    expect(finalStyle.sources.basemap__global_overview?.tiles?.[0]).toBe(
      'smp://maps.v1/s/g0/{z}/{x}/{y}.png',
    );
    expect(finalStyle.metadata?.['smp:sourceFolders']).toMatchObject({
      basemap: 's/0',
      basemap__global_overview: 's/g0',
    });
    expect(finalStyle.metadata?.['smp:regionalBounds']).toEqual(MAP.bbox);
    expect(finalStyle.metadata?.['smp:bounds']).toEqual([
      -180, -85.0511, 180, 85.0511,
    ]);
    expect(finalZip.file('s/g0/0/0/0.png')).not.toBeNull();
    expect(finalZip.file('s/0/0/0/0.png')).toBeNull();
    expect(finalZip.file('s/0/4/8/8.png')).not.toBeNull();
    expect(finalStyle.layers[0]).toMatchObject({
      id: 'basemap__global_overview',
      source: 'basemap__global_overview',
      maxzoom: 4,
    });
    expect(finalStyle.layers[1]).toMatchObject({
      id: 'basemap',
      source: 'basemap',
      minzoom: 4,
    });
    expect(
      finalStyle.layers
        .slice(2)
        .every((layer) => layer.id.startsWith('comapeo-authored:')),
    ).toBe(true);
  });

  it('does not inject undefined regional bounds when base metadata omits smp:bounds', async () => {
    const finalBlob = await mergeSmpWithAuthoredLayers({
      regionalBlob: await makeRegionalZip({ omitBounds: true }),
      globalBlob: await makeGlobalZip(),
      authoredLayers: [AUTHORED_VECTOR_LAYER_FIXTURE],
      map: MAP,
    });
    const finalZip = await JSZip.loadAsync(await finalBlob.arrayBuffer());
    const finalStyle = JSON.parse(
      await finalZip.file('style.json')!.async('string'),
    ) as { metadata?: Record<string, unknown> };
    expect(finalStyle.metadata).not.toHaveProperty('smp:regionalBounds');
  });

  it('does not mutate nested source-folder metadata on the caller style', () => {
    const regionalStyle = {
      version: 8 as const,
      sources: {
        basemap: {
          type: 'raster',
          tiles: ['smp://maps.v1/s/0/{z}/{x}/{y}.png'],
        },
      },
      layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
      metadata: {
        'smp:bounds': MAP.bbox,
        'smp:sourceFolders': { basemap: 's/0' },
      },
    };
    const globalStyle = {
      version: 8 as const,
      sources: {
        basemap: {
          type: 'raster',
          tiles: ['smp://maps.v1/s/0/{z}/{x}/{y}.png'],
        },
      },
      layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
    };
    const originalFolders = { ...regionalStyle.metadata['smp:sourceFolders'] };

    const { style } = mergeGlobalOverviewStyle(regionalStyle, globalStyle);

    expect(regionalStyle.metadata['smp:sourceFolders']).toEqual(
      originalFolders,
    );
    expect(style.metadata?.['smp:bounds']).toEqual(
      GLOBAL_OVERVIEW_BBOX_FOR_MERGE,
    );
    expect(style.metadata?.['smp:bounds']).not.toBe(
      GLOBAL_OVERVIEW_BBOX_FOR_MERGE,
    );
  });

  it.each([
    ['source ID', 'source'],
    ['layer ID', 'layer'],
    ['folder', 'folder'],
  ] as const)(
    'fails closed on deterministic global-overview %s collisions',
    (_label, kind) => {
      const regionalStyle = {
        version: 8 as const,
        sources: {
          basemap: {
            type: 'raster',
            tiles: ['smp://maps.v1/s/0/{z}/{x}/{y}.png'],
          },
          ...(kind === 'source'
            ? {
                basemap__global_overview: {
                  type: 'raster',
                  tiles: ['smp://maps.v1/s/9/{z}/{x}/{y}.png'],
                },
              }
            : {}),
          ...(kind === 'folder'
            ? {
                collision: {
                  type: 'raster',
                  tiles: ['smp://maps.v1/s/g0/{z}/{x}/{y}.png'],
                },
              }
            : {}),
        },
        layers: [
          { id: 'basemap', type: 'raster', source: 'basemap' },
          ...(kind === 'layer'
            ? [
                {
                  id: 'basemap__global_overview',
                  type: 'raster' as const,
                  source: 'basemap',
                },
              ]
            : []),
        ],
        metadata: {
          'smp:sourceFolders': {
            basemap: 's/0',
            ...(kind === 'source' ? { basemap__global_overview: 's/9' } : {}),
            ...(kind === 'folder' ? { collision: 's/g0' } : {}),
          },
        },
      };
      const globalStyle = {
        version: 8 as const,
        sources: {
          basemap: {
            type: 'raster',
            tiles: ['smp://maps.v1/s/0/{z}/{x}/{y}.png'],
          },
        },
        layers: [{ id: 'basemap', type: 'raster' as const, source: 'basemap' }],
      };

      expect(() =>
        mergeGlobalOverviewStyle(regionalStyle, globalStyle),
      ).toThrow(/collision/i);
    },
  );

  it('preserves the composed effective raster zoom range when replacing a Writer source', async () => {
    const sourceId = sourceLayerIdForAuthoredLayer(
      AUTHORED_RASTER_LAYER_FIXTURE.id,
    );
    const finalStyle = {
      version: 8 as const,
      sources: {
        [sourceId]: {
          type: 'raster',
          tiles: ['https://tiles.example.com/{z}/{x}/{y}.png'],
          minzoom: 3,
          maxzoom: 6,
        },
      },
      layers: [],
    };
    const writerStyle = {
      version: 8 as const,
      sources: {
        [sourceId]: {
          type: 'raster',
          tiles: ['smp://maps.v1/s/0/{z}/{x}/{y}.png'],
          minzoom: 0,
          maxzoom: 6,
        },
      },
      layers: [],
      metadata: { 'smp:sourceFolders': { [sourceId]: 's/0' } },
    };

    await applyAuthoredWriterSources(finalStyle, writerStyle, [
      AUTHORED_RASTER_LAYER_FIXTURE,
    ]);

    expect(finalStyle.sources[sourceId]).toMatchObject({
      minzoom: 3,
      maxzoom: 6,
    });
  });

  it('fails closed when a deterministic authored target folder collides with the base package', async () => {
    const targetFolder = await sourceFolderForAuthoredLayer(
      AUTHORED_RASTER_LAYER_FIXTURE.id,
    );
    const regionalBlob = await makeRegionalZip({
      collisionFolder: targetFolder,
    });
    const authoredBlob = await makeAuthoredRasterSmp();
    await expect(
      mergeSmpWithAuthoredLayers({
        regionalBlob,
        authoredBlob,
        authoredLayers: [AUTHORED_RASTER_LAYER_FIXTURE],
        map: MAP,
      }),
    ).rejects.toThrow(/collision/i);
  });

  it('rejects unexpected files outside recognized SMP structures', async () => {
    const regionalBlob = await makeRegionalZip({ unexpected: true });
    await expect(
      mergeSmpWithAuthoredLayers({
        regionalBlob,
        authoredLayers: [AUTHORED_VECTOR_LAYER_FIXTURE],
        map: MAP,
      }),
    ).rejects.toThrow(/unexpected/i);
  });

  it('emits byte-identical output across wall-clock time', async () => {
    const regionalBlob = await makeRegionalZip();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const first = await mergeSmpWithAuthoredLayers({
        regionalBlob,
        authoredLayers: [AUTHORED_VECTOR_LAYER_FIXTURE],
        map: MAP,
      });
      vi.setSystemTime(new Date('2030-06-01T12:34:56Z'));
      const second = await mergeSmpWithAuthoredLayers({
        regionalBlob,
        authoredLayers: [AUTHORED_VECTOR_LAYER_FIXTURE],
        map: MAP,
      });
      expect(new Uint8Array(await second.arrayBuffer())).toEqual(
        new Uint8Array(await first.arrayBuffer()),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('emits byte-identical output for equivalent input ZIP entry orderings', async () => {
    const first = await mergeSmpWithAuthoredLayers({
      regionalBlob: await makeRegionalZip(),
      authoredLayers: [AUTHORED_VECTOR_LAYER_FIXTURE],
      map: MAP,
    });
    const second = await mergeSmpWithAuthoredLayers({
      regionalBlob: await makeRegionalZip({ reverseTiles: true }),
      authoredLayers: [AUTHORED_VECTOR_LAYER_FIXTURE],
      map: MAP,
    });
    expect(new Uint8Array(await second.arrayBuffer())).toEqual(
      new Uint8Array(await first.arrayBuffer()),
    );
  });

  it('aborts promptly while final ZIP generation is still pending', async () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const pause = vi.fn();
    const fakeStream = {
      on(event: string, handler: (...args: unknown[]) => void) {
        handlers.set(event, handler);
        return this;
      },
      resume() {
        return this;
      },
      pause,
      accumulate() {
        return new Promise<never>(() => undefined);
      },
    };
    const regionalBlob = await makeRegionalZip();
    const generateSpy = vi
      .spyOn(JSZip.prototype, 'generateInternalStream')
      .mockReturnValue(fakeStream as never);
    const controller = new AbortController();
    const reason = new Error('cancel-final-generation');
    const pending = mergeSmpWithAuthoredLayers({
      regionalBlob,
      authoredLayers: [AUTHORED_VECTOR_LAYER_FIXTURE],
      map: MAP,
      signal: controller.signal,
    });
    for (
      let attempt = 0;
      attempt < 100 && !generateSpy.mock.calls.length;
      attempt += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(generateSpy).toHaveBeenCalled();
    controller.abort(reason);
    const outcome = await Promise.race([
      pending.then(
        () => 'resolved' as const,
        (error: unknown) => error,
      ),
      new Promise<'timed-out'>((resolve) =>
        setTimeout(() => resolve('timed-out'), 100),
      ),
    ]);
    expect(outcome).toBe(reason);
    expect(pause).toHaveBeenCalled();
  });

  it('enforces the conservative and actual 256 MiB output limits arithmetically', () => {
    const entryCount = 10;
    const overhead = BigInt(entryCount * 4096 + 2 * 1024 * 1024);
    const allowedPayload = BigInt(MAX_SMP_MERGED_OUTPUT_BYTES) - overhead;
    expect(() =>
      assertSmpMergedOutputBound(allowedPayload, entryCount),
    ).not.toThrow();
    expect(() =>
      assertSmpMergedOutputBound(allowedPayload + 1n, entryCount),
    ).toThrow(/256 MiB/);
    expect(() =>
      assertActualMergedSmpSize(MAX_SMP_MERGED_OUTPUT_BYTES),
    ).not.toThrow();
    expect(() =>
      assertActualMergedSmpSize(MAX_SMP_MERGED_OUTPUT_BYTES + 1),
    ).toThrow(/256 MiB/);
  });
});
