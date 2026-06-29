import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

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
