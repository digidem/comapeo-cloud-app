import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import {
  AUTHORED_RASTER_LAYER_FIXTURE,
  AUTHORED_VECTOR_LAYER_FIXTURE,
} from '@tests/fixtures/authored-layers';
import { render, waitFor } from '@tests/mocks/test-utils';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createElement } from 'react';

import { MapContainer } from '@/components/shared/MapContainer/MapContainer';
import type { SavedMap } from '@/lib/db';
import {
  fragmentLayerIdForAuthoredLayer,
  sourceFolderForAuthoredLayer,
  sourceLayerIdForAuthoredLayer,
} from '@/lib/map/authored-layers';
import { buildSmpBlob } from '@/lib/map/smp-download';
import {
  closeAllSmpReaders,
  getSmpReader,
  resolveSmpStyle,
} from '@/lib/map/smp-serve';
import { useMapStore } from '@/stores/map-store';
import { useProjectStore } from '@/stores/project-store';

const { mockDownload, mockDbGet, mapProps } = vi.hoisted(() => ({
  mockDownload: vi.fn(),
  mockDbGet: vi.fn(),
  mapProps: [] as Array<Record<string, unknown>>,
}));

vi.mock('styled-map-package-api/download', () => ({ download: mockDownload }));
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    getDb: () => ({ maps: { get: mockDbGet } }),
  };
});
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));
vi.mock('maplibre-gl', () => ({
  default: { addProtocol: vi.fn() },
}));
vi.mock('react-map-gl/maplibre', () => ({
  default: (props: Record<string, unknown>) => {
    mapProps.push(props);
    return createElement('div', { 'data-testid': 'active-map-container' });
  },
  AttributionControl: () =>
    createElement('div', { 'data-testid': 'attribution-control' }),
}));

const TRANSPARENT_1X1_PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    'base64',
  ),
);

const MAP_CONFIG = {
  type: 'raster' as const,
  styleUrl: 'https://basemap.example.com/{z}/{x}/{y}.png',
  bbox: [-1, -1, 1, 1] as [number, number, number, number],
  minZoom: 0,
  maxZoom: 0,
  attribution: 'Basemap',
  scheme: 'xyz' as const,
};

function responseWithUrl(
  body: BodyInit | null,
  init: ResponseInit,
  url: string,
): Response {
  const response = new Response(body, init);
  Object.defineProperty(response, 'url', { configurable: true, value: url });
  return response;
}

async function regionalBytes(): Promise<Uint8Array> {
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
          maxzoom: 0,
        },
      },
      layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
      metadata: {
        'smp:bounds': MAP_CONFIG.bbox,
        'smp:maxzoom': 0,
        'smp:sourceFolders': { basemap: 's/0' },
      },
    }),
  );
  zip.file('s/0/0/0/0.png', new Uint8Array([9, 9, 9]));
  return zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
}

function mapLibreGeometryFamily(
  type: string,
): 'Point' | 'LineString' | 'Polygon' {
  if (type === 'Point' || type === 'MultiPoint') return 'Point';
  if (type === 'LineString' || type === 'MultiLineString') return 'LineString';
  if (type === 'Polygon' || type === 'MultiPolygon') return 'Polygon';
  throw new Error(`Unexpected canonical geometry type: ${type}`);
}

function fragmentFamily(filter: unknown): string | undefined {
  if (
    Array.isArray(filter) &&
    filter.length === 3 &&
    filter[0] === 'in' &&
    filter[1] === '$type' &&
    typeof filter[2] === 'string'
  ) {
    return filter[2];
  }
  return undefined;
}

function downloadStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function buildCanonicalBlob() {
  const bytes = await regionalBytes();
  mockDownload.mockReturnValue(downloadStream(bytes));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const href = String(input);
      if (
        init?.method === 'GET' &&
        href === 'https://tiles.example.com/0/0/0.png'
      ) {
        return responseWithUrl(
          TRANSPARENT_1X1_PNG,
          {
            status: 200,
            headers: {
              'Content-Type': 'image/png',
              'Content-Length': String(TRANSPARENT_1X1_PNG.byteLength),
            },
          },
          href,
        );
      }
      throw new Error(`Unexpected authored network request: ${href}`);
    }),
  );
  return buildSmpBlob({
    map: MAP_CONFIG,
    authoredLayers: [
      AUTHORED_VECTOR_LAYER_FIXTURE,
      AUTHORED_RASTER_LAYER_FIXTURE,
    ],
    includeGlobalOverview: false,
  });
}

beforeEach(() => {
  mapProps.length = 0;
  mockDownload.mockReset();
  mockDbGet.mockReset();
  useMapStore.setState({
    basemapId: 'carto-positron',
    activeMapId: null,
    activeProjectLocalId: null,
  });
  useProjectStore.setState({ selectedProjectId: null, selectedServerId: null });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await closeAllSmpReaders();
});

describe('canonical authored-layer SMP round trip', () => {
  it('round-trips vector and raster fixtures through the existing SMP reader with network disabled', async () => {
    const built = await buildCanonicalBlob();
    const networkAfterGeneration = vi.fn(async () => {
      throw new Error('network disabled after SMP generation');
    });
    vi.stubGlobal('fetch', networkAfterGeneration);

    const reader = await getSmpReader('authored-roundtrip', built.blob);
    const style = await resolveSmpStyle(reader, 'authored-roundtrip');
    expect(style).not.toBeNull();
    if (!style) return;
    expect(validateStyleMin(style)).toEqual([]);

    expect(networkAfterGeneration).not.toHaveBeenCalled();
    const vectorSourceId = sourceLayerIdForAuthoredLayer(
      AUTHORED_VECTOR_LAYER_FIXTURE.id,
    );
    const rasterSourceId = sourceLayerIdForAuthoredLayer(
      AUTHORED_RASTER_LAYER_FIXTURE.id,
    );
    expect(style.sources[vectorSourceId]).toMatchObject({
      type: 'geojson',
      data:
        AUTHORED_VECTOR_LAYER_FIXTURE.source.type === 'geojson'
          ? AUTHORED_VECTOR_LAYER_FIXTURE.source.data
          : undefined,
    });
    const rasterSource = style.sources[rasterSourceId] as { tiles?: string[] };
    const rasterFolder = await sourceFolderForAuthoredLayer(
      AUTHORED_RASTER_LAYER_FIXTURE.id,
    );
    // Reader rewrites package-internal maps.v1 URLs to the active reader ID.
    expect(rasterSource.tiles?.[0]).toBe(
      `smp:///authored-roundtrip/s/${rasterFolder}/{z}/{x}/{y}.png`,
    );
    const rasterResource = await reader.getResource(
      `s/${rasterFolder}/0/0/0.png`,
    );
    expect(rasterResource.contentType).toBe('image/png');
    expect(rasterResource.contentLength).toBe(TRANSPARENT_1X1_PNG.byteLength);
    const packagedRasterBytes = new Uint8Array(
      await new Response(rasterResource.stream).arrayBuffer(),
    );
    expect(packagedRasterBytes).toEqual(TRANSPARENT_1X1_PNG);

    const authoredFragments = style.layers.filter((layer) =>
      layer.id.startsWith('comapeo-authored:'),
    );
    expect(authoredFragments.map((layer) => layer.id)).toEqual([
      ...AUTHORED_VECTOR_LAYER_FIXTURE.render.layers.map((_fragment, index) =>
        fragmentLayerIdForAuthoredLayer(
          AUTHORED_VECTOR_LAYER_FIXTURE.id,
          index,
        ),
      ),
      fragmentLayerIdForAuthoredLayer(AUTHORED_RASTER_LAYER_FIXTURE.id, 0),
    ]);
    expect(
      authoredFragments
        .slice(0, 4)
        .map((layer) => (layer as { filter?: unknown }).filter),
    ).toEqual([
      ['in', '$type', 'Polygon'],
      ['in', '$type', 'Polygon'],
      ['in', '$type', 'LineString'],
      ['in', '$type', 'Point'],
    ]);
    const vectorLinePaint = authoredFragments[1]?.paint;
    expect(authoredFragments[2]?.paint).toEqual(vectorLinePaint);
    for (const fragment of authoredFragments) {
      expect(fragment.layout?.visibility).toBe('none');
    }

    if (AUTHORED_VECTOR_LAYER_FIXTURE.source.type !== 'geojson') {
      throw new Error('canonical vector fixture must be GeoJSON');
    }
    const vectorFragments = authoredFragments.slice(0, 4);
    const routedFragmentTypes =
      AUTHORED_VECTOR_LAYER_FIXTURE.source.data.features.map((feature) => {
        const family = mapLibreGeometryFamily(feature.geometry.type);
        return vectorFragments
          .filter(
            (fragment) =>
              fragmentFamily((fragment as { filter?: unknown }).filter) ===
              family,
          )
          .map((fragment) => fragment.type);
      });
    expect(routedFragmentTypes).toEqual([
      ['fill', 'line'],
      ['line'],
      ['circle'],
    ]);
  });

  it('feeds the same offline SMP style into the active MapContainer without network access', async () => {
    const built = await buildCanonicalBlob();
    const readyMap: SavedMap = {
      id: 'roundtrip-map',
      projectLocalId: 'project-1',
      name: 'Offline authored map',
      origin: 'authored',
      ...MAP_CONFIG,
      layers: [AUTHORED_VECTOR_LAYER_FIXTURE, AUTHORED_RASTER_LAYER_FIXTURE],
      status: 'ready',
      smpBlob: built.blob,
      smpSize: built.smpSize,
      createdAt: '2026-08-19T00:00:00.000Z',
      updatedAt: '2026-08-19T00:00:00.000Z',
    };
    mockDbGet.mockResolvedValue(readyMap);
    const networkAfterGeneration = vi.fn(async () => {
      throw new Error('network disabled after SMP generation');
    });
    vi.stubGlobal('fetch', networkAfterGeneration);
    useMapStore.setState({
      activeMapId: readyMap.id,
      activeProjectLocalId: readyMap.projectLocalId,
    });
    useProjectStore.setState({ selectedProjectId: readyMap.projectLocalId });

    render(createElement(MapContainer, { showBasemapSwitcher: false }));
    await waitFor(() => {
      const latest = mapProps.at(-1);
      expect(latest?.mapStyle).toMatchObject({ version: 8 });
      const style = latest?.mapStyle as {
        sources: Record<string, unknown>;
        layers: Array<{ id: string; layout?: { visibility?: string } }>;
      };
      expect(
        Object.keys(style.sources).filter((sourceId) =>
          sourceId.startsWith('comapeo-authored:'),
        ),
      ).toHaveLength(2);
      expect(
        style.layers.filter((layer) =>
          layer.id.startsWith('comapeo-authored:'),
        ),
      ).toHaveLength(5);
    });
    expect(networkAfterGeneration).not.toHaveBeenCalled();

    // The packaged hidden state can be toggled locally by MapLibre without any
    // source/data fetch because every committed payload is already in the SMP.
    const latest = mapProps.at(-1)!;
    const style = structuredClone(latest.mapStyle) as {
      layers: Array<{ id: string; layout?: { visibility?: string } }>;
    };
    for (const layer of style.layers) {
      if (layer.id.startsWith('comapeo-authored:')) {
        layer.layout = { ...(layer.layout ?? {}), visibility: 'visible' };
      }
    }
    expect(
      style.layers
        .filter((layer) => layer.id.startsWith('comapeo-authored:'))
        .every((layer) => layer.layout?.visibility === 'visible'),
    ).toBe(true);
    expect(networkAfterGeneration).not.toHaveBeenCalled();
  });
});
