import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { geometrySchema } from '@/lib/schemas/geometry';

describe('geometrySchema', () => {
  it('parses a valid Point', () => {
    const result = v.parse(geometrySchema, {
      type: 'Point',
      coordinates: [102.0, 0.5],
    });
    expect(result).toEqual({ type: 'Point', coordinates: [102.0, 0.5] });
  });

  it('parses a valid MultiPoint', () => {
    const result = v.parse(geometrySchema, {
      type: 'MultiPoint',
      coordinates: [
        [100.0, 0.0],
        [101.0, 1.0],
      ],
    });
    expect(result).toEqual({
      type: 'MultiPoint',
      coordinates: [
        [100.0, 0.0],
        [101.0, 1.0],
      ],
    });
  });

  it('parses a valid LineString', () => {
    const result = v.parse(geometrySchema, {
      type: 'LineString',
      coordinates: [
        [100.0, 0.0],
        [101.0, 1.0],
      ],
    });
    expect(result).toEqual({
      type: 'LineString',
      coordinates: [
        [100.0, 0.0],
        [101.0, 1.0],
      ],
    });
  });

  it('parses a valid MultiLineString', () => {
    const result = v.parse(geometrySchema, {
      type: 'MultiLineString',
      coordinates: [
        [
          [100.0, 0.0],
          [101.0, 1.0],
        ],
        [
          [102.0, 2.0],
          [103.0, 3.0],
        ],
      ],
    });
    expect(result.type).toBe('MultiLineString');
    expect(result.coordinates).toHaveLength(2);
  });

  it('parses a valid Polygon', () => {
    const result = v.parse(geometrySchema, {
      type: 'Polygon',
      coordinates: [
        [
          [100.0, 0.0],
          [101.0, 0.0],
          [101.0, 1.0],
          [100.0, 1.0],
          [100.0, 0.0],
        ],
      ],
    });
    expect(result.type).toBe('Polygon');
  });

  it('parses a valid MultiPolygon', () => {
    const result = v.parse(geometrySchema, {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [102.0, 2.0],
            [103.0, 2.0],
            [103.0, 3.0],
            [102.0, 3.0],
            [102.0, 2.0],
          ],
        ],
        [
          [
            [100.0, 0.0],
            [101.0, 0.0],
            [101.0, 1.0],
            [100.0, 1.0],
            [100.0, 0.0],
          ],
        ],
      ],
    });
    expect(result.type).toBe('MultiPolygon');
    expect(result.coordinates).toHaveLength(2);
  });

  it('parses a Point with 3D coordinates', () => {
    const result = v.parse(geometrySchema, {
      type: 'Point',
      coordinates: [102.0, 0.5, 100.0],
    });
    expect(result.coordinates).toHaveLength(3);
  });

  it('rejects an invalid geometry type', () => {
    expect(() =>
      v.parse(geometrySchema, {
        type: 'Circle',
        coordinates: [102.0, 0.5],
      }),
    ).toThrow();
  });

  it('rejects missing type', () => {
    expect(() =>
      v.parse(geometrySchema, {
        coordinates: [102.0, 0.5],
      }),
    ).toThrow();
  });

  it('rejects missing coordinates', () => {
    expect(() =>
      v.parse(geometrySchema, {
        type: 'Point',
      }),
    ).toThrow();
  });

  it('rejects non-object input', () => {
    expect(() => v.parse(geometrySchema, 'not an object')).toThrow();
    expect(() => v.parse(geometrySchema, null)).toThrow();
    expect(() => v.parse(geometrySchema, 42)).toThrow();
  });
});
