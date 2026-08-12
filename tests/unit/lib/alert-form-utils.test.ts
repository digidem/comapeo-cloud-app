import { describe, expect, it } from 'vitest';

import {
  geometryFromVertices,
  metadataRowsToRecord,
  validateGeometryDraft,
} from '@/lib/alert-form-utils';

describe('alert form utilities', () => {
  it('builds and validates Point, LineString, and Polygon geometries', () => {
    expect(geometryFromVertices('Point', [[10, 20]])).toEqual({
      type: 'Point',
      coordinates: [10, 20],
    });
    expect(validateGeometryDraft('LineString', [[0, 0]])).toBe('linePoints');
    expect(
      geometryFromVertices('LineString', [
        [0, 0],
        [1, 1],
      ]),
    ).toEqual({
      type: 'LineString',
      coordinates: [
        [0, 0],
        [1, 1],
      ],
    });
    expect(
      validateGeometryDraft('Polygon', [
        [0, 0],
        [1, 0],
      ]),
    ).toBe('polygonPoints');
    expect(
      geometryFromVertices('Polygon', [
        [0, 0],
        [1, 0],
        [0, 1],
      ]),
    ).toEqual({
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [0, 1],
          [0, 0],
        ],
      ],
    });
  });

  it('returns a specific error for invalid longitude/latitude', () => {
    expect(validateGeometryDraft('Point', [[181, 20]])).toBe('coordinates');
    expect(validateGeometryDraft('Point', [[10, 91]])).toBe('coordinates');
  });

  it('returns an empty metadata object when no rows are configured', () => {
    expect(metadataRowsToRecord([])).toEqual({ value: {}, errors: {} });
  });

  it('serializes typed metadata rows into a record', () => {
    const result = metadataRowsToRecord([
      { id: 'a', key: 'label', value: 'fire', type: 'text' },
      { id: 'b', key: 'confidence', value: '0.75', type: 'number' },
      { id: 'c', key: 'verified', value: 'true', type: 'boolean' },
      { id: 'd', key: 'observed', value: '2026-08-10', type: 'date' },
    ]);
    expect(result.errors).toEqual({});
    expect(result.value).toEqual({
      label: 'fire',
      confidence: 0.75,
      verified: true,
      observed: '2026-08-10',
    });
  });

  it('validates metadata row names and typed values', () => {
    const result = metadataRowsToRecord([
      { id: 'a', key: '', value: 'x', type: 'text' },
      { id: 'b', key: 'count', value: 'nope', type: 'number' },
      { id: 'c', key: 'duplicate', value: '1', type: 'text' },
      { id: 'd', key: 'duplicate', value: '2', type: 'text' },
    ]);
    expect(result.errors).toEqual({
      a: 'keyRequired',
      b: 'invalidNumber',
      d: 'duplicateKey',
    });
  });
});
