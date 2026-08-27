import { AUTHORED_VECTOR_LAYER_FIXTURE } from '@tests/fixtures/authored-layers';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { MAX_AUTHORED_LAYERS } from '@/lib/map/authored-layers';
import { savedMapSchema } from '@/lib/schemas/saved-map';

describe('savedMapSchema', () => {
  const validRaster = {
    id: 'map-001',
    projectLocalId: 'proj-1',
    name: 'Territory Basemap',
    type: 'raster' as const,
    styleUrl: 'https://example.com/tiles/{z}/{x}/{y}.png',
    bbox: [-73.0, -3.5, -70.0, -1.0],
    minZoom: 0,
    maxZoom: 14,
    attribution: '© OpenStreetMap',
    scheme: 'xyz' as const,
    status: 'draft' as const,
    errorMessage: undefined,
    createdAt: '2026-06-28T00:00:00Z',
    updatedAt: '2026-06-28T00:00:00Z',
  };

  it('validates a complete raster saved map', () => {
    const result = v.safeParse(savedMapSchema, validRaster);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.name).toBe('Territory Basemap');
      expect(result.output.type).toBe('raster');
    }
  });

  it('accepts canonical authored layers and preserves their order', () => {
    const result = v.safeParse(savedMapSchema, {
      ...validRaster,
      layers: [AUTHORED_VECTOR_LAYER_FIXTURE],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.layers).toEqual([AUTHORED_VECTOR_LAYER_FIXTURE]);
    }
  });

  it('rejects duplicate authored-layer IDs in a complete SavedMap collection', () => {
    const result = v.safeParse(savedMapSchema, {
      ...validRaster,
      layers: [AUTHORED_VECTOR_LAYER_FIXTURE, AUTHORED_VECTOR_LAYER_FIXTURE],
    });
    expect(result.success).toBe(false);
  });

  it('returns the canonicalized authored layer produced by the shared parser', () => {
    const candidate = structuredClone(AUTHORED_VECTOR_LAYER_FIXTURE);
    const firstFragment = candidate.render.layers[0]!;
    candidate.render.layers[0] = {
      ...firstFragment,
      layout: {},
    };
    const result = v.safeParse(savedMapSchema, {
      ...validRaster,
      layers: [candidate],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.layers?.[0]?.render.layers[0]).not.toHaveProperty(
        'layout',
      );
    }
  });

  it('rejects a non-canonical authored layer through the strict shared validator', () => {
    const invalidLayer = {
      ...AUTHORED_VECTOR_LAYER_FIXTURE,
      id: 'not-a-canonical-uuid',
    };
    expect(
      v.safeParse(savedMapSchema, { ...validRaster, layers: [invalidLayer] })
        .success,
    ).toBe(false);
  });

  it('rejects more authored layers than the packaging boundary allows', () => {
    const layers = Array.from(
      { length: MAX_AUTHORED_LAYERS + 1 },
      (_, index) => ({
        ...AUTHORED_VECTOR_LAYER_FIXTURE,
        id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      }),
    );
    expect(
      v.safeParse(savedMapSchema, { ...validRaster, layers }).success,
    ).toBe(false);
  });

  it('rejects an authored-layer collection above the aggregate packaging JSON cap', () => {
    const layers = Array.from({ length: MAX_AUTHORED_LAYERS }, (_, index) => ({
      ...AUTHORED_VECTOR_LAYER_FIXTURE,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      name: 'x'.repeat(170_000),
    }));
    expect(
      v.safeParse(savedMapSchema, { ...validRaster, layers }).success,
    ).toBe(false);
  });

  it('keeps legacy maps without layers valid', () => {
    const result = v.safeParse(savedMapSchema, validRaster);
    expect(result.success).toBe(true);
    if (result.success) expect(result.output.layers).toBeUndefined();
  });

  it('validates a complete style saved map', () => {
    const result = v.safeParse(savedMapSchema, {
      ...validRaster,
      type: 'style',
      scheme: undefined,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a map missing a required field (name)', () => {
    const { name: _name, ...rest } = validRaster;
    expect(v.safeParse(savedMapSchema, rest).success).toBe(false);
  });

  it('rejects an empty name', () => {
    expect(
      v.safeParse(savedMapSchema, { ...validRaster, name: '' }).success,
    ).toBe(false);
  });

  it('rejects an empty styleUrl for raster maps', () => {
    expect(
      v.safeParse(savedMapSchema, { ...validRaster, styleUrl: '' }).success,
    ).toBe(false);
  });

  it('allows an empty styleUrl only for ready imported-style records', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        type: 'style',
        scheme: undefined,
        origin: 'imported',
        styleUrl: '',
        status: 'ready',
      }).success,
    ).toBe(true);
  });

  it('rejects a ready empty styleUrl without explicit imported origin', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        type: 'style',
        scheme: undefined,
        styleUrl: '',
        status: 'ready',
      }).success,
    ).toBe(false);
  });

  it('rejects imported origin with a network styleUrl', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        type: 'style',
        scheme: undefined,
        origin: 'imported',
        styleUrl: 'https://example.com/style.json',
        status: 'ready',
      }).success,
    ).toBe(false);
  });

  it('rejects an empty styleUrl for non-ready style maps', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        type: 'style',
        scheme: undefined,
        styleUrl: '',
      }).success,
    ).toBe(false);
  });

  it('rejects a bbox with an extra entry (strictTuple)', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        bbox: [-73.0, -3.5, -70.0, -1.0, 0],
      }).success,
    ).toBe(false);
  });

  it('rejects a bbox with Infinity (v.finite)', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        bbox: [-73.0, -3.5, -70.0, Infinity],
      }).success,
    ).toBe(false);
  });

  it('rejects a bbox with -Infinity (v.finite)', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        bbox: [-Infinity, -3.5, -70.0, -1.0],
      }).success,
    ).toBe(false);
  });

  it('rejects a longitude outside [-180, 180] (west)', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        bbox: [-200.0, -3.5, -70.0, -1.0],
      }).success,
    ).toBe(false);
  });

  it('rejects a longitude outside [-180, 180] (east)', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        bbox: [-73.0, -3.5, 181.0, -1.0],
      }).success,
    ).toBe(false);
  });

  it('rejects a latitude outside [-90, 90]', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        bbox: [-73.0, -95.0, -70.0, -1.0],
      }).success,
    ).toBe(false);
  });

  it('rejects an inverted horizontal extent (west > east)', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        bbox: [-70.0, -3.5, -73.0, -1.0],
      }).success,
    ).toBe(false);
  });

  it('rejects an inverted vertical extent (south > north)', () => {
    // [-73, 10, -70, -10] is finite and in range and passes west <= east,
    // but south (10) > north (-10) — an inverted vertical extent that must
    // fail validation instead of misleading downstream map display.
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        bbox: [-73.0, 10.0, -70.0, -10.0],
      }).success,
    ).toBe(false);
  });

  it('rejects when minZoom > maxZoom', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        minZoom: 10,
        maxZoom: 5,
      }).success,
    ).toBe(false);
  });

  it('rejects an out-of-range zoom (maxZoom > 22)', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        maxZoom: 30,
      }).success,
    ).toBe(false);
  });

  it('rejects an invalid type', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        type: 'vector',
      }).success,
    ).toBe(false);
  });

  it('rejects an invalid status', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        status: 'unknown',
      }).success,
    ).toBe(false);
  });

  it('rejects an invalid scheme on a raster map', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        scheme: 'bogus',
      }).success,
    ).toBe(false);
  });

  it('ignores scheme when type is style (validated only for raster)', () => {
    // A style map with an out-of-range scheme still validates because scheme
    // is only validated for raster maps — it is stripped/ignored here.
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        type: 'style',
        scheme: 'bogus',
      }).success,
    ).toBe(true);
  });

  it('does not require scheme on a raster map', () => {
    expect(
      v.safeParse(savedMapSchema, { ...validRaster, scheme: undefined })
        .success,
    ).toBe(true);
  });
});
