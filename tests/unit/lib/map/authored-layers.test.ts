import {
  AUTHORED_RASTER_LAYER_FIXTURE,
  AUTHORED_VECTOR_LAYER_FIXTURE,
} from '@tests/fixtures/authored-layers';
import { describe, expect, it } from 'vitest';

import {
  AUTHORED_LAYER_ID_PREFIX,
  AUTHORED_LAYER_SCHEMA_VERSION,
  type AuthoredLayerCommitContext,
  AuthoredLayerValidationThrown,
  MAX_AUTHORED_JSON_DEPTH,
  MAX_AUTHORED_JSON_NODES_PER_LAYER,
  MAX_AUTHORED_JSON_STRING_BYTES,
  MAX_AUTHORED_LAYERS,
  MAX_AUTHORED_LAYERS_JSON_BYTES,
  MAX_AUTHORED_LAYER_JSON_BYTES,
  MAX_AUTHORED_RENDER_FRAGMENTS,
  MAX_AUTHORED_RENDER_JSON_BYTES,
  MAX_AUTHORED_VECTOR_FEATURES,
  MAX_BASE_STYLE_JSON_BYTES_FOR_AUTHORED,
  SUPPORTED_AUTHORED_LAYER_RENDER_TYPES,
  SUPPORTED_AUTHORED_LAYER_SOURCE_TYPES,
  type SupportedAuthoredLayerRenderType,
  type SupportedAuthoredLayerSourceType,
  canonicalizeRasterTileTemplate,
  createGeoJsonAuthoredLayer,
  fragmentLayerIdForAuthoredLayer,
  measureCanonicalJsonUtf8Bounded,
  prepareAuthoredLayer,
  prepareAuthoredLayerBatch,
  sourceFolderForAuthoredLayer,
  sourceLayerIdForAuthoredLayer,
} from '@/lib/map/authored-layers';
import { parseAuthoredLayer } from '@/lib/schemas/authored-layer';

// ---------------------------------------------------------------------------
// Allowlists
// ---------------------------------------------------------------------------

describe('allowlists', () => {
  it('exports the canonical source type allowlist', () => {
    expect(SUPPORTED_AUTHORED_LAYER_SOURCE_TYPES).toEqual([
      'geojson',
      'raster-tiles',
    ]);
  });

  it('exports the canonical render type allowlist', () => {
    expect(SUPPORTED_AUTHORED_LAYER_RENDER_TYPES).toEqual([
      'fill',
      'line',
      'circle',
      'symbol',
      'raster',
    ]);
  });

  it('prevents adding entries without updating the source schema', () => {
    // The allowlists are `as const` tuples; adding a new entry requires a
    // schemaVersion bump. Tests enforce that these sets are the V1 contract.
    expect(SUPPORTED_AUTHORED_LAYER_SOURCE_TYPES).toHaveLength(2);
    expect(SUPPORTED_AUTHORED_LAYER_RENDER_TYPES).toHaveLength(5);
  });
});

describe('runtime ID helpers', () => {
  const LAYER_ID = '11111111-1111-4111-8111-111111111111';

  it('exports the reserved namespace prefix', () => {
    expect(AUTHORED_LAYER_ID_PREFIX).toBe('comapeo-authored:');
  });

  it('builds the canonical source ID', () => {
    expect(sourceLayerIdForAuthoredLayer(LAYER_ID)).toBe(
      'comapeo-authored:11111111-1111-4111-8111-111111111111:source',
    );
  });

  it('builds the deterministic source folder name (sha256 of layer ID)', async () => {
    const folder = await sourceFolderForAuthoredLayer(LAYER_ID);
    // The folder is comapeo-authored-<sha256> using the full lowercase 64-hex
    expect(folder).toMatch(/^comapeo-authored-[0-9a-f]{64}$/);
  });

  it('builds deterministic source folder names per layer ID', async () => {
    const a = await sourceFolderForAuthoredLayer(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    const b = await sourceFolderForAuthoredLayer(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    );
    expect(a).not.toBe(b);
  });

  it('builds fragment layer IDs by index', () => {
    expect(fragmentLayerIdForAuthoredLayer(LAYER_ID, 0)).toBe(
      'comapeo-authored:11111111-1111-4111-8111-111111111111:layer:0',
    );
    expect(fragmentLayerIdForAuthoredLayer(LAYER_ID, 3)).toBe(
      'comapeo-authored:11111111-1111-4111-8111-111111111111:layer:3',
    );
  });

  it('derived IDs cannot collide with basemap or global-overview IDs', async () => {
    const baseId = sourceLayerIdForAuthoredLayer(LAYER_ID);
    const basePath = await sourceFolderForAuthoredLayer(LAYER_ID);
    // No collision with __global_overview naming
    expect(baseId).not.toMatch(/__global_overview/);
    expect(basePath).not.toMatch(/__global_overview/);
  });
});

// ---------------------------------------------------------------------------
// Canonical fixtures
// ---------------------------------------------------------------------------

describe('canonical fixtures', () => {
  it('AUTHORED_VECTOR_LAYER_FIXTURE has schemaVersion 1', () => {
    expect(AUTHORED_VECTOR_LAYER_FIXTURE.schemaVersion).toBe(1);
  });

  it('AUTHORED_VECTOR_LAYER_FIXTURE has non-default outer visibility', () => {
    // Non-default = false (true is the default initial visibility)
    expect(AUTHORED_VECTOR_LAYER_FIXTURE.visible).toBe(false);
  });

  it('AUTHORED_VECTOR_LAYER_FIXTURE source is geojson', () => {
    expect(AUTHORED_VECTOR_LAYER_FIXTURE.source).toEqual({
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: expect.any(Array),
      },
    });
  });

  it('AUTHORED_VECTOR_LAYER_FIXTURE data is normalized (no GeometryCollection, no null geometry)', () => {
    if (AUTHORED_VECTOR_LAYER_FIXTURE.source.type !== 'geojson') return;
    const fc = AUTHORED_VECTOR_LAYER_FIXTURE.source.data;
    expect(fc.type).toBe('FeatureCollection');
    for (const feature of fc.features) {
      expect(feature.geometry).not.toBeNull();
      expect(feature.geometry?.type).not.toBe('GeometryCollection');
    }
  });

  it('AUTHORED_VECTOR_LAYER_FIXTURE has at least Polygon, LineString, and Point', () => {
    if (AUTHORED_VECTOR_LAYER_FIXTURE.source.type !== 'geojson') return;
    const fc = AUTHORED_VECTOR_LAYER_FIXTURE.source.data;
    const types = new Set(fc.features.map((f) => f.geometry.type));
    expect(types.has('Polygon')).toBe(true);
    expect(types.has('LineString')).toBe(true);
    expect(types.has('Point')).toBe(true);
  });

  it('AUTHORED_VECTOR_LAYER_FIXTURE has exactly four render layers in canonical order', () => {
    const layers = AUTHORED_VECTOR_LAYER_FIXTURE.render.layers;
    expect(layers).toHaveLength(4);
    expect(layers[0]?.type).toBe('fill');
    expect(layers[1]?.type).toBe('line');
    expect(layers[2]?.type).toBe('line');
    expect(layers[3]?.type).toBe('circle');
  });

  it('AUTHORED_VECTOR_LAYER_FIXTURE fragment 0 is polygon fill with correct filter', () => {
    const frag = AUTHORED_VECTOR_LAYER_FIXTURE.render.layers[0];
    expect(frag?.type).toBe('fill');
    expect(frag?.filter).toEqual(['in', '$type', 'Polygon']);
    expect('source' in (frag ?? {})).toBe(false);
    expect('id' in (frag ?? {})).toBe(false);
  });

  it('AUTHORED_VECTOR_LAYER_FIXTURE fragment 1 is polygon outline line with same filter', () => {
    const frag = AUTHORED_VECTOR_LAYER_FIXTURE.render.layers[1];
    expect(frag?.type).toBe('line');
    expect(frag?.filter).toEqual(['in', '$type', 'Polygon']);
  });

  it('AUTHORED_VECTOR_LAYER_FIXTURE fragment 2 is LineString line with correct filter', () => {
    const frag = AUTHORED_VECTOR_LAYER_FIXTURE.render.layers[2];
    expect(frag?.type).toBe('line');
    expect(frag?.filter).toEqual(['in', '$type', 'LineString']);
  });

  it('AUTHORED_VECTOR_LAYER_FIXTURE fragment 3 is Point circle with correct filter', () => {
    const frag = AUTHORED_VECTOR_LAYER_FIXTURE.render.layers[3];
    expect(frag?.type).toBe('circle');
    expect(frag?.filter).toEqual(['in', '$type', 'Point']);
  });

  it('AUTHORED_VECTOR_LAYER_FIXTURE line fragments share identical stroke paint', () => {
    const fillLine = AUTHORED_VECTOR_LAYER_FIXTURE.render.layers[1];
    const stringLine = AUTHORED_VECTOR_LAYER_FIXTURE.render.layers[2];
    // Both line fragments use the same stroke color/width/opacity
    const fillPaint = fillLine?.paint ?? {};
    const stringPaint = stringLine?.paint ?? {};
    expect(fillPaint['line-color']).toBe(stringPaint['line-color']);
    expect(fillPaint['line-width']).toBe(stringPaint['line-width']);
    expect(fillPaint['line-opacity']).toBe(stringPaint['line-opacity']);
  });

  it('AUTHORED_VECTOR_LAYER_FIXTURE has non-default outer visibility', () => {
    // visible: true is the default — fixture should be non-default to test
    // both paths. We set visible: false so the fixture exercises hidden behavior.
    expect(AUTHORED_VECTOR_LAYER_FIXTURE.visible).toBe(false);
  });

  it('AUTHORED_RASTER_LAYER_FIXTURE has schemaVersion 1', () => {
    expect(AUTHORED_RASTER_LAYER_FIXTURE.schemaVersion).toBe(1);
  });

  it('AUTHORED_RASTER_LAYER_FIXTURE is a raster-tiles layer', () => {
    expect(AUTHORED_RASTER_LAYER_FIXTURE.source.type).toBe('raster-tiles');
  });

  it('AUTHORED_RASTER_LAYER_FIXTURE has exactly one tile template', () => {
    if (AUTHORED_RASTER_LAYER_FIXTURE.source.type !== 'raster-tiles') return;
    expect(AUTHORED_RASTER_LAYER_FIXTURE.source.tiles).toHaveLength(1);
  });

  it('AUTHORED_RASTER_LAYER_FIXTURE uses standard HTTPS external template', () => {
    if (AUTHORED_RASTER_LAYER_FIXTURE.source.type !== 'raster-tiles') return;
    expect(AUTHORED_RASTER_LAYER_FIXTURE.source.tiles[0]).toBe(
      'https://tiles.example.com/{z}/{x}/{y}.png',
    );
  });

  it('AUTHORED_RASTER_LAYER_FIXTURE has non-default raster styling', () => {
    const rasterLayer = AUTHORED_RASTER_LAYER_FIXTURE.render.layers[0];
    expect(rasterLayer?.type).toBe('raster');
    const paint = rasterLayer?.paint ?? {};
    expect(paint['raster-opacity']).not.toBe(1);
  });

  it('AUTHORED_RASTER_LAYER_FIXTURE is hidden', () => {
    expect(AUTHORED_RASTER_LAYER_FIXTURE.visible).toBe(false);
  });

  it('AUTHORED_RASTER_LAYER_FIXTURE has tileSize 256', () => {
    if (AUTHORED_RASTER_LAYER_FIXTURE.source.type !== 'raster-tiles') return;
    expect(AUTHORED_RASTER_LAYER_FIXTURE.source.tileSize).toBe(256);
  });
});

// ---------------------------------------------------------------------------
// createGeoJsonAuthoredLayer
// ---------------------------------------------------------------------------

describe('createGeoJsonAuthoredLayer', () => {
  it('constructs a vector AuthoredLayer through the canonical prepare boundary', () => {
    const result = createGeoJsonAuthoredLayer(
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { name: 'point' },
            geometry: { type: 'Point', coordinates: [-60, -3] },
          },
        ],
      },
      { minZoom: 0, maxZoom: 14 },
      { name: 'My Layer' },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.layer.schemaVersion).toBe(AUTHORED_LAYER_SCHEMA_VERSION);
    expect(result.layer.name).toBe('My Layer');
    expect(result.layer.source.type).toBe('geojson');
    expect(result.layer.visible).toBe(true);
    expect(result.layer.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('strips RFC 7946 geometry bbox/foreign members into the canonical schema-v1 shape', () => {
    const result = createGeoJsonAuthoredLayer(
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { name: 'bounded point' },
            geometry: {
              type: 'Point',
              coordinates: [-60, -3],
              bbox: [-60, -3, -60, -3],
              foreignMember: 'allowed by RFC 7946 input',
            },
          },
        ],
      },
      { minZoom: 0, maxZoom: 14 },
    );

    expect(result.ok).toBe(true);
    if (!result.ok || result.layer.source.type !== 'geojson') return;
    expect(result.layer.source.data.features[0]?.geometry).toEqual({
      type: 'Point',
      coordinates: [-60, -3],
    });
  });

  it('assigns a fresh UUIDv4 for each new layer', () => {
    const input = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [-60, -3] },
        },
      ],
    };
    const context = { minZoom: 0, maxZoom: 14 };
    const a = createGeoJsonAuthoredLayer(input, context, { name: 'A' });
    const b = createGeoJsonAuthoredLayer(input, context, { name: 'B' });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.layer.id).not.toBe(b.layer.id);
    expect(a.layer.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(b.layer.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

// ---------------------------------------------------------------------------
// prepareAuthoredLayer
// ---------------------------------------------------------------------------

describe('prepareAuthoredLayer', () => {
  const ctx: AuthoredLayerCommitContext = { minZoom: 0, maxZoom: 14 };

  it('accepts the canonical vector fixture', () => {
    const result = prepareAuthoredLayer(AUTHORED_VECTOR_LAYER_FIXTURE, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.layer.schemaVersion).toBe(1);
      // Runtime IDs are derived only when composing a MapLibre style.
      expect('id' in (result.layer.render.layers[0] ?? {})).toBe(false);
      expect('source' in (result.layer.render.layers[0] ?? {})).toBe(false);
    }
  });

  it('accepts the canonical raster fixture', () => {
    const result = prepareAuthoredLayer(AUTHORED_RASTER_LAYER_FIXTURE, ctx);
    expect(result.ok).toBe(true);
  });

  it('rejects a non-record input', () => {
    const result = prepareAuthoredLayer(null, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('AUTHORED_LAYER_INVALID');
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('rejects a layer with missing schemaVersion', () => {
    const result = prepareAuthoredLayer(
      { ...AUTHORED_VECTOR_LAYER_FIXTURE, schemaVersion: undefined },
      ctx,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a layer with unsupported source type', () => {
    const result = prepareAuthoredLayer(
      {
        ...AUTHORED_VECTOR_LAYER_FIXTURE,
        source: { type: 'wms', url: 'https://example.com/wms' },
      },
      ctx,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a layer with unsupported render type', () => {
    const result = prepareAuthoredLayer(
      {
        ...AUTHORED_VECTOR_LAYER_FIXTURE,
        render: {
          layers: [{ type: 'heatmap', paint: {} }],
        },
      },
      ctx,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects an invalid UUID id', () => {
    const result = prepareAuthoredLayer(
      { ...AUTHORED_VECTOR_LAYER_FIXTURE, id: 'not-a-uuid' },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues.some((i) => i.path.includes('id'))).toBe(true);
    }
  });

  it('rejects an ID already in reservedIds (append collision)', () => {
    const result = prepareAuthoredLayer(AUTHORED_VECTOR_LAYER_FIXTURE, {
      ...ctx,
      reservedIds: new Set([AUTHORED_VECTOR_LAYER_FIXTURE.id]),
    });
    expect(result.ok).toBe(false);
  });

  it('preserves a non-colliding reserved ID from reservedIds', () => {
    // When reservedIds contains a different ID, the layer should pass
    const result = prepareAuthoredLayer(AUTHORED_VECTOR_LAYER_FIXTURE, {
      ...ctx,
      reservedIds: new Set(['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']),
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a raster template with non-HTTPS scheme', () => {
    const result = prepareAuthoredLayer(
      {
        ...AUTHORED_RASTER_LAYER_FIXTURE,
        source: {
          type: 'raster-tiles',
          tiles: ['http://tiles.example.com/{z}/{x}/{y}.png'],
          tileSize: 256,
          scheme: 'xyz',
        },
      },
      ctx,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a raster template with localhost hostname', () => {
    const result = prepareAuthoredLayer(
      {
        ...AUTHORED_RASTER_LAYER_FIXTURE,
        source: {
          type: 'raster-tiles',
          tiles: ['https://localhost/{z}/{x}/{y}.png'],
          tileSize: 256,
          scheme: 'xyz',
        },
      },
      ctx,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a raster template with multiple tile URLs', () => {
    const result = prepareAuthoredLayer(
      {
        ...AUTHORED_RASTER_LAYER_FIXTURE,
        source: {
          type: 'raster-tiles',
          tiles: [
            'https://a.tiles.example.com/{z}/{x}/{y}.png',
            'https://b.tiles.example.com/{z}/{x}/{y}.png',
          ],
          tileSize: 256,
          scheme: 'xyz',
        },
      },
      ctx,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a raster template with duplicate placeholders', () => {
    const result = prepareAuthoredLayer(
      {
        ...AUTHORED_RASTER_LAYER_FIXTURE,
        source: {
          type: 'raster-tiles',
          tiles: ['https://tiles.example.com/{z}/{x}/{z}.png'],
          tileSize: 256,
          scheme: 'xyz',
        },
      },
      ctx,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a raster template with placeholders in hostname', () => {
    const result = prepareAuthoredLayer(
      {
        ...AUTHORED_RASTER_LAYER_FIXTURE,
        source: {
          type: 'raster-tiles',
          tiles: ['https://{z}.tiles.example.com/{z}/{x}/{y}.png'],
          tileSize: 256,
          scheme: 'xyz',
        },
      },
      ctx,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a raster with invalid tileSize', () => {
    const result = prepareAuthoredLayer(
      {
        ...AUTHORED_RASTER_LAYER_FIXTURE,
        source: {
          ...AUTHORED_RASTER_LAYER_FIXTURE.source,
          tileSize: 128,
        },
      },
      ctx,
    );
    expect(result.ok).toBe(false);
  });

  it('accepts a raster with tileSize 512', () => {
    const result = prepareAuthoredLayer(
      {
        ...AUTHORED_RASTER_LAYER_FIXTURE,
        source: {
          ...AUTHORED_RASTER_LAYER_FIXTURE.source,
          tileSize: 512,
        },
      },
      ctx,
    );
    expect(result.ok).toBe(true);
  });

  it('rejects filters on raster render fragments', () => {
    const result = prepareAuthoredLayer(
      {
        ...AUTHORED_RASTER_LAYER_FIXTURE,
        render: {
          layers: [
            {
              ...AUTHORED_RASTER_LAYER_FIXTURE.render.layers[0],
              filter: ['==', 'kind', 'imagery'],
            },
          ],
        },
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'UNSUPPORTED_RENDER_FILTER',
            path: ['render', 'layers', 0, 'filter'],
          }),
        ]),
      );
    }
  });

  it('rejects a raster with inverted zoom range', () => {
    const result = prepareAuthoredLayer(
      {
        ...AUTHORED_RASTER_LAYER_FIXTURE,
        source: {
          ...AUTHORED_RASTER_LAYER_FIXTURE.source,
          minZoom: 10,
          maxZoom: 5,
        },
      },
      ctx,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a raster whose effective zoom range is empty', () => {
    const result = prepareAuthoredLayer(
      {
        ...AUTHORED_RASTER_LAYER_FIXTURE,
        source: {
          ...AUTHORED_RASTER_LAYER_FIXTURE.source,
          minZoom: 20,
          maxZoom: 22,
        },
      },
      { minZoom: 0, maxZoom: 14 },
    );
    expect(result.ok).toBe(false);
  });

  it('rejects vector layers with GeometryCollection in data (strict read)', () => {
    const result = prepareAuthoredLayer(
      {
        ...AUTHORED_VECTOR_LAYER_FIXTURE,
        source: {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'GeometryCollection',
                  geometries: [],
                },
              },
            ],
          },
        },
      },
      ctx,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects vector layers with null geometry (strict read)', () => {
    const result = prepareAuthoredLayer(
      {
        ...AUTHORED_VECTOR_LAYER_FIXTURE,
        source: {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {},
                geometry: null,
              },
            ],
          },
        },
      },
      ctx,
    );
    expect(result.ok).toBe(false);
  });

  it('keeps outer visibility as the sole persisted visibility field', () => {
    const result = prepareAuthoredLayer(AUTHORED_RASTER_LAYER_FIXTURE, ctx);
    if (result.ok) {
      for (const layer of result.layer.render.layers) {
        expect(layer.layout?.visibility).toBeUndefined();
      }
    }
  });

  it('does not materialize layout.visibility for visible layers', () => {
    const visibleLayer = {
      ...AUTHORED_VECTOR_LAYER_FIXTURE,
      visible: true,
    };
    const result = prepareAuthoredLayer(visibleLayer, ctx);
    if (result.ok) {
      for (const layer of result.layer.render.layers) {
        expect(layer.layout?.visibility).toBeUndefined();
      }
    }
  });

  it('removes contradictory fragment-level visibility (owned only by outer field)', () => {
    const result = prepareAuthoredLayer(
      {
        ...AUTHORED_VECTOR_LAYER_FIXTURE,
        visible: true,
        render: {
          layers: [
            {
              type: 'fill',
              filter: ['in', '$type', 'Polygon'],
              paint: { 'fill-color': '#1F6FFF' },
              layout: { visibility: 'none' }, // contradictory
            },
          ],
        },
      },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.layer.render.layers[0]?.layout?.visibility).toBeUndefined();
    }
  });

  it('rejects layers exceeding MAX_AUTHORED_VECTOR_FEATURES', () => {
    const features: Array<{
      type: 'Feature';
      properties: Record<string, unknown>;
      geometry: { type: 'Point'; coordinates: [number, number] };
    }> = [];
    for (let i = 0; i < MAX_AUTHORED_VECTOR_FEATURES + 1; i++) {
      features.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [-60, -3] },
      });
    }
    const result = prepareAuthoredLayer(
      {
        ...AUTHORED_VECTOR_LAYER_FIXTURE,
        source: {
          type: 'geojson',
          data: { type: 'FeatureCollection', features },
        },
      },
      ctx,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects too many render fragments', () => {
    const layers = [];
    for (let i = 0; i < MAX_AUTHORED_RENDER_FRAGMENTS + 1; i++) {
      layers.push({ type: 'fill' as const, paint: { 'fill-color': '#fff' } });
    }
    const result = prepareAuthoredLayer(
      {
        ...AUTHORED_VECTOR_LAYER_FIXTURE,
        render: { layers },
      },
      ctx,
    );
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// prepareAuthoredLayerBatch
// ---------------------------------------------------------------------------

describe('prepareAuthoredLayerBatch', () => {
  const ctx: AuthoredLayerCommitContext = { minZoom: 0, maxZoom: 14 };

  it('accepts a batch of valid layers', () => {
    const result = prepareAuthoredLayerBatch(
      [AUTHORED_VECTOR_LAYER_FIXTURE, AUTHORED_RASTER_LAYER_FIXTURE],
      ctx,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.layers).toHaveLength(2);
      expect(result.layers[0]?.id).toBe(AUTHORED_VECTOR_LAYER_FIXTURE.id);
      expect(result.layers[1]?.id).toBe(AUTHORED_RASTER_LAYER_FIXTURE.id);
    }
  });

  it('preserves input order exactly', () => {
    const result = prepareAuthoredLayerBatch(
      [AUTHORED_RASTER_LAYER_FIXTURE, AUTHORED_VECTOR_LAYER_FIXTURE],
      ctx,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.layers[0]?.id).toBe(AUTHORED_RASTER_LAYER_FIXTURE.id);
      expect(result.layers[1]?.id).toBe(AUTHORED_VECTOR_LAYER_FIXTURE.id);
    }
  });

  it('rejects more than MAX_AUTHORED_LAYERS candidates', () => {
    const candidates = [];
    for (let i = 0; i < MAX_AUTHORED_LAYERS + 1; i++) {
      candidates.push({
        ...AUTHORED_VECTOR_LAYER_FIXTURE,
        id: `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`,
      });
    }
    const result = prepareAuthoredLayerBatch(candidates, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]?.index).toBe(MAX_AUTHORED_LAYERS);
    }
  });

  it('rejects duplicate IDs within the batch even with empty reservedIds', () => {
    const result = prepareAuthoredLayerBatch(
      [AUTHORED_VECTOR_LAYER_FIXTURE, AUTHORED_VECTOR_LAYER_FIXTURE],
      ctx,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Second occurrence (index 1) should be the duplicate
      expect(result.errors[0]?.index).toBe(1);
    }
  });

  it('returns indexed structured errors with candidateId', () => {
    const result = prepareAuthoredLayerBatch(
      [
        { ...AUTHORED_VECTOR_LAYER_FIXTURE, id: 'bad-id' },
        AUTHORED_RASTER_LAYER_FIXTURE,
      ],
      ctx,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.index).toBe(0);
      expect(result.errors[0]?.candidateId).toBe('bad-id');
      expect(result.errors[0]?.error.code).toBe('AUTHORED_LAYER_INVALID');
    }
  });

  it('failed batch exposes no partial success array', () => {
    const result = prepareAuthoredLayerBatch(
      [
        { ...AUTHORED_VECTOR_LAYER_FIXTURE, id: 'bad-id' },
        AUTHORED_RASTER_LAYER_FIXTURE,
      ],
      ctx,
    );
    if (!result.ok) {
      // Must not contain a layers array
      expect('layers' in result).toBe(false);
    }
  });

  it('append/import path passes current draft IDs through reservedIds', () => {
    const newLayer = {
      ...AUTHORED_VECTOR_LAYER_FIXTURE,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    };
    const result = prepareAuthoredLayerBatch([newLayer], {
      ...ctx,
      reservedIds: new Set(['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']),
    });
    expect(result.ok).toBe(true);
  });

  it('append/import path rejects colliding draft ID via reservedIds', () => {
    const result = prepareAuthoredLayerBatch([AUTHORED_VECTOR_LAYER_FIXTURE], {
      ...ctx,
      reservedIds: new Set([AUTHORED_VECTOR_LAYER_FIXTURE.id]),
    });
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseAuthoredLayer (strict persisted read)
// ---------------------------------------------------------------------------

describe('parseAuthoredLayer', () => {
  it('parses the canonical vector fixture', () => {
    const layer = parseAuthoredLayer(AUTHORED_VECTOR_LAYER_FIXTURE);
    expect(layer.schemaVersion).toBe(1);
    expect(layer.id).toBe(AUTHORED_VECTOR_LAYER_FIXTURE.id);
  });

  it('parses the canonical raster fixture', () => {
    const layer = parseAuthoredLayer(AUTHORED_RASTER_LAYER_FIXTURE);
    expect(layer.source.type).toBe('raster-tiles');
  });

  it('throws AuthoredLayerValidationThrown on invalid input', () => {
    expect(() => parseAuthoredLayer({ bad: true })).toThrow(
      AuthoredLayerValidationThrown,
    );
  });

  it('throws with code AUTHORED_LAYER_INVALID', () => {
    try {
      parseAuthoredLayer({ bad: true });
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(AuthoredLayerValidationThrown);
      expect((e as AuthoredLayerValidationThrown).code).toBe(
        'AUTHORED_LAYER_INVALID',
      );
    }
  });

  it('does not normalize GeometryCollection on persisted read', () => {
    expect(() =>
      parseAuthoredLayer({
        ...AUTHORED_VECTOR_LAYER_FIXTURE,
        source: {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'GeometryCollection',
                  geometries: [],
                },
              },
            ],
          },
        },
      }),
    ).toThrow(AuthoredLayerValidationThrown);
  });

  it('does not normalize null geometry on persisted read', () => {
    expect(() =>
      parseAuthoredLayer({
        ...AUTHORED_VECTOR_LAYER_FIXTURE,
        source: {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {},
                geometry: null,
              },
            ],
          },
        },
      }),
    ).toThrow(AuthoredLayerValidationThrown);
  });

  it('produces deterministic issue ordering', () => {
    try {
      parseAuthoredLayer({ bad: true });
    } catch (e) {
      const error = e as AuthoredLayerValidationThrown;
      expect(error.issues).toHaveLength(1);
      expect(error.issues[0]?.code).toBeTruthy();
      expect(error.issues[0]?.path).toBeTruthy();
      expect(error.issues[0]?.message).toBeTruthy();
    }
  });

  it('has stable name and code on the thrown error', () => {
    try {
      parseAuthoredLayer(null);
    } catch (e) {
      const error = e as AuthoredLayerValidationThrown;
      expect(error.name).toBe('AuthoredLayerValidationThrown');
      expect(error.code).toBe('AUTHORED_LAYER_INVALID');
    }
  });
});

// ---------------------------------------------------------------------------
// Bounded JSON measurement
// ---------------------------------------------------------------------------

describe('bounded JSON measurement limits', () => {
  it('exports all V1 limit constants', () => {
    expect(MAX_AUTHORED_LAYERS).toBe(128);
    expect(MAX_AUTHORED_LAYER_JSON_BYTES).toBe(6 * 1024 * 1024);
    expect(MAX_AUTHORED_LAYERS_JSON_BYTES).toBe(20 * 1024 * 1024);
    expect(MAX_AUTHORED_RENDER_JSON_BYTES).toBe(256 * 1024);
    expect(MAX_AUTHORED_RENDER_FRAGMENTS).toBe(16);
    expect(MAX_AUTHORED_VECTOR_FEATURES).toBe(50_000);
    expect(MAX_AUTHORED_JSON_STRING_BYTES).toBe(256 * 1024);
    expect(MAX_AUTHORED_JSON_DEPTH).toBe(64);
    expect(MAX_AUTHORED_JSON_NODES_PER_LAYER).toBe(1_000_000);
    expect(MAX_BASE_STYLE_JSON_BYTES_FOR_AUTHORED).toBe(8 * 1024 * 1024);
  });

  it('matches JSON.stringify UTF-8 bytes for nested escaped Unicode data', () => {
    const value = {
      quote: 'a"b\\c\n',
      unicode: 'Açaí 🌳',
      nested: [true, null, -0, 1.25e6, { key: '雪' }],
    };
    const measured = measureCanonicalJsonUtf8Bounded(value, {
      maxBytes: 1024 * 1024,
    });
    expect(measured.ok).toBe(true);
    if (!measured.ok) return;
    const expected = new TextEncoder().encode(JSON.stringify(value)).byteLength;
    expect(measured.bytes).toBe(BigInt(expected));
  });

  it('allows repeated references that are not cycles', () => {
    const shared = { name: 'same' };
    const measured = measureCanonicalJsonUtf8Bounded({ a: shared, b: shared });
    expect(measured.ok).toBe(true);
  });

  it('rejects a cycle', () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    const measured = measureCanonicalJsonUtf8Bounded(value);
    expect(measured).toMatchObject({ ok: false, code: 'CYCLE' });
  });

  it('rejects a huge sparse array from declared length before scanning it', () => {
    const sparse: unknown[] = [];
    sparse.length = 1_000_001;
    const measured = measureCanonicalJsonUtf8Bounded(sparse, { maxNodes: 100 });
    expect(measured).toMatchObject({ ok: false, code: 'MAX_NODES' });
  });

  it('rejects sparse arrays inside the node budget as non-canonical JSON', () => {
    const sparse = new Array(3);
    sparse[2] = 'value';
    const measured = measureCanonicalJsonUtf8Bounded(sparse, { maxNodes: 20 });
    expect(measured).toMatchObject({ ok: false, code: 'UNSUPPORTED_VALUE' });
  });

  it('stops on object key/node budget without materializing a complete key list', () => {
    const value: Record<string, number> = {};
    for (let index = 0; index < 100; index += 1) value[`k${index}`] = index;
    const measured = measureCanonicalJsonUtf8Bounded(value, { maxNodes: 12 });
    expect(measured).toMatchObject({ ok: false, code: 'MAX_NODES' });
  });

  it('rejects depth, scalar-string, and total-byte overages independently', () => {
    const nested = { a: { b: { c: 1 } } };
    expect(
      measureCanonicalJsonUtf8Bounded(nested, { maxDepth: 1 }),
    ).toMatchObject({ ok: false, code: 'MAX_DEPTH' });
    expect(
      measureCanonicalJsonUtf8Bounded('abcdef', { maxStringBytes: 5 }),
    ).toMatchObject({ ok: false, code: 'MAX_STRING_BYTES' });
    expect(
      measureCanonicalJsonUtf8Bounded({ a: 'abcdef' }, { maxBytes: 5 }),
    ).toMatchObject({ ok: false, code: 'MAX_BYTES' });
  });

  it.each([
    undefined,
    () => undefined,
    Symbol('value'),
    1n,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    new Date(0),
  ])('rejects unsupported canonical JSON value %#', (value) => {
    const measured = measureCanonicalJsonUtf8Bounded(value);
    expect(measured).toMatchObject({ ok: false, code: 'UNSUPPORTED_VALUE' });
  });

  it('rejects objects with own symbols and dangerous prototype keys', () => {
    const withSymbol: Record<string | symbol, unknown> = { ok: true };
    withSymbol[Symbol('hidden')] = true;
    expect(measureCanonicalJsonUtf8Bounded(withSymbol)).toMatchObject({
      ok: false,
      code: 'UNSUPPORTED_VALUE',
    });

    const dangerous = JSON.parse('{"__proto__":{"polluted":true}}') as unknown;
    expect(measureCanonicalJsonUtf8Bounded(dangerous)).toMatchObject({
      ok: false,
      code: 'UNSUPPORTED_VALUE',
    });
  });
});

describe('raster tile template canonicalization', () => {
  it('normalizes host casing and default HTTPS port while keeping placeholders literal', () => {
    expect(
      canonicalizeRasterTileTemplate(
        'https://TILES.EXAMPLE.COM:443/a%20b/{z}/{x}/{y}.png',
      ),
    ).toBe('https://tiles.example.com/a%20b/{z}/{x}/{y}.png');
  });

  it.each([
    'https://{z}.example.com/{x}/{y}.png',
    'https://tiles.example.com/{z}/{x}/{y}.png?token={z}',
    'https://tiles.example.com/{z}/{x}/{y}.png#frag',
    'https://tiles.example.com/{z}/{x}/{y}/{s}.png',
    'https://tiles.example.com/{z}/{x}/{x}/{y}.png',
    'https://tiles.example.com/{z/{x}/{y}.png',
    'https://tiles.example.com/{z}/{x}/{y}}.png',
    'https://tiles.example.com/__COMAPEO_Z__/{z}/{x}/{y}.png',
  ])('rejects invalid raster template %s', (template) => {
    expect(() => canonicalizeRasterTileTemplate(template)).toThrow();
  });

  it.each([
    'http://tiles.example.com/{z}/{x}/{y}.png',
    'https://localhost/{z}/{x}/{y}.png',
    'https://host/{z}/{x}/{y}.png',
    'https://127.0.0.1/{z}/{x}/{y}.png',
    'https://[::1]/{z}/{x}/{y}.png',
    'https://tiles.local/{z}/{x}/{y}.png',
    'https://tiles.internal/{z}/{x}/{y}.png',
    'https://tiles.home.arpa/{z}/{x}/{y}.png',
    `https://${'user'}:${'pass'}@tiles.example.com/{z}/{x}/{y}.png`,
  ])('rejects non-anonymous/non-external source %s', (template) => {
    expect(() => canonicalizeRasterTileTemplate(template)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Type-level checks
// ---------------------------------------------------------------------------

describe('type contracts', () => {
  it('SupportedAuthoredLayerSourceType is geojson | raster-tiles', () => {
    const t: SupportedAuthoredLayerSourceType = 'geojson';
    const t2: SupportedAuthoredLayerSourceType = 'raster-tiles';
    expect(t).toBe('geojson');
    expect(t2).toBe('raster-tiles');
  });

  it('SupportedAuthoredLayerRenderType includes all allowlisted types', () => {
    const types: SupportedAuthoredLayerRenderType[] = [
      'fill',
      'line',
      'circle',
      'symbol',
      'raster',
    ];
    expect(types).toHaveLength(5);
  });

  it('AUTHORED_LAYER_SCHEMA_VERSION is 1', () => {
    expect(AUTHORED_LAYER_SCHEMA_VERSION).toBe(1);
  });
});
