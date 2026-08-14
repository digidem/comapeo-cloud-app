import { describe, expect, it } from 'vitest';

import type { GeoJsonOverlayError } from '@/lib/map/geojson-overlay';
import {
  MAX_OVERLAY_FILE_SIZE,
  parseGeoJsonOverlay,
} from '@/lib/map/geojson-overlay';

function makeFile(
  content: string | object,
  name = 'test.geojson',
  type = 'application/geo+json',
): File {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  return new File([text], name, { type });
}

function makeOversizedFile(): File {
  // Create a File whose .size exceeds the threshold without allocating a huge string.
  const size = MAX_OVERLAY_FILE_SIZE + 1;
  const blob = new Blob([new Uint8Array(size)]);
  return new File([blob], 'huge.geojson', { type: 'application/geo+json' });
}

describe('parseGeoJsonOverlay', () => {
  describe('size limit', () => {
    it('rejects files exceeding the size threshold before parsing', async () => {
      const file = makeOversizedFile();
      await expect(parseGeoJsonOverlay(file)).rejects.toMatchObject({
        kind: 'too-large',
      });
    });

    it('reports the threshold in bytes as a constant', () => {
      expect(MAX_OVERLAY_FILE_SIZE).toBeGreaterThan(0);
      expect(typeof MAX_OVERLAY_FILE_SIZE).toBe('number');
    });
  });

  describe('invalid JSON', () => {
    it('rejects malformed JSON', async () => {
      const file = makeFile('{ not valid json');
      await expect(parseGeoJsonOverlay(file)).rejects.toMatchObject({
        kind: 'invalid-json',
      });
    });

    it('rejects JSON that is not an object', async () => {
      const file = makeFile('[1, 2, 3]');
      await expect(parseGeoJsonOverlay(file)).rejects.toMatchObject({
        kind: 'invalid-geojson',
      });
    });
  });

  describe('top-level type validation', () => {
    it('rejects objects without a recognised GeoJSON type', async () => {
      const file = makeFile({ foo: 'bar' });
      await expect(parseGeoJsonOverlay(file)).rejects.toMatchObject({
        kind: 'invalid-geojson',
      });
    });

    it('rejects unsupported type strings', async () => {
      const file = makeFile({ type: 'GeometryCollection' });
      await expect(parseGeoJsonOverlay(file)).rejects.toMatchObject({
        kind: 'invalid-geojson',
      });
    });

    it('accepts a FeatureCollection', async () => {
      const data = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: [0, 0] },
          },
        ],
      };
      const result = await parseGeoJsonOverlay(makeFile(data));
      expect(result.type).toBe('FeatureCollection');
      expect(result.features).toHaveLength(1);
    });

    it('accepts a bare Feature', async () => {
      const data = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [0, 0] },
      };
      const result = await parseGeoJsonOverlay(makeFile(data));
      expect(result.type).toBe('FeatureCollection');
      expect(result.features).toHaveLength(1);
    });

    it('accepts a bare Point geometry', async () => {
      const data = { type: 'Point', coordinates: [10, 20] };
      const result = await parseGeoJsonOverlay(makeFile(data));
      expect(result.type).toBe('FeatureCollection');
      expect(result.features).toHaveLength(1);
      expect(result.features[0]?.geometry?.type).toBe('Point');
    });

    it('accepts a bare LineString geometry', async () => {
      const data = {
        type: 'LineString',
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      };
      const result = await parseGeoJsonOverlay(makeFile(data));
      expect(result.features[0]?.geometry?.type).toBe('LineString');
    });

    it('accepts a bare Polygon geometry', async () => {
      const data = {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      };
      const result = await parseGeoJsonOverlay(makeFile(data));
      expect(result.features[0]?.geometry?.type).toBe('Polygon');
    });

    it('accepts a MultiPoint geometry', async () => {
      const data = {
        type: 'MultiPoint',
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      };
      const result = await parseGeoJsonOverlay(makeFile(data));
      expect(result.features[0]?.geometry?.type).toBe('MultiPoint');
    });

    it('accepts a MultiLineString geometry', async () => {
      const data = {
        type: 'MultiLineString',
        coordinates: [
          [
            [0, 0],
            [1, 1],
          ],
        ],
      };
      const result = await parseGeoJsonOverlay(makeFile(data));
      expect(result.features[0]?.geometry?.type).toBe('MultiLineString');
    });

    it('accepts a MultiPolygon geometry', async () => {
      const data = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
        ],
      };
      const result = await parseGeoJsonOverlay(makeFile(data));
      expect(result.features[0]?.geometry?.type).toBe('MultiPolygon');
    });
  });

  describe('mixed geometry FeatureCollections', () => {
    it('normalises a FeatureCollection with mixed geometry types', async () => {
      const data = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: [0, 0] },
          },
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [
                [0, 0],
                [1, 1],
              ],
            },
          },
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                  [0, 1],
                  [0, 0],
                ],
              ],
            },
          },
        ],
      };
      const result = await parseGeoJsonOverlay(makeFile(data));
      expect(result.features).toHaveLength(3);
      expect(result.features.map((f) => f.geometry?.type)).toEqual([
        'Point',
        'LineString',
        'Polygon',
      ]);
    });

    it('skips features with null geometry', async () => {
      const data = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: null,
          },
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: [0, 0] },
          },
        ],
      };
      const result = await parseGeoJsonOverlay(makeFile(data));
      expect(result.features).toHaveLength(1);
    });
  });

  describe('error type', () => {
    it('exposes a discriminated union error kind', async () => {
      const file = makeFile('{ bad');
      try {
        await parseGeoJsonOverlay(file);
        throw new Error('should have thrown');
      } catch (e) {
        const err = e as GeoJsonOverlayError;
        expect(err.kind).toBe('invalid-json');
        expect(typeof err.message).toBe('string');
      }
    });
  });
});
