import { describe, expect, it, vi } from 'vitest';

import {
  MAX_GEOJSON_OVERLAY_BYTES,
  normalizeGeoJson,
  readGeoJsonOverlayFile,
} from '@/lib/map/geojson-overlays';

describe('GeoJSON reference overlays', () => {
  it('accepts FeatureCollection roots with mixed supported geometry families', () => {
    const normalized = normalizeGeoJson({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'checkpoint' },
          geometry: { type: 'Point', coordinates: [-60, -3] },
        },
        {
          type: 'Feature',
          properties: { name: 'route' },
          geometry: {
            type: 'MultiLineString',
            coordinates: [
              [
                [-60, -3],
                [-59, -2],
              ],
            ],
          },
        },
        {
          type: 'Feature',
          properties: { name: 'territory' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-61, -4],
                [-59, -4],
                [-59, -2],
                [-61, -4],
              ],
            ],
          },
        },
      ],
    });

    expect(normalized.features.map((feature) => feature.geometry.type)).toEqual(
      ['Point', 'MultiLineString', 'Polygon'],
    );
  });

  it('accepts Feature and Geometry roots', () => {
    const featureRoot = normalizeGeoJson({
      type: 'Feature',
      properties: { name: 'one point' },
      geometry: { type: 'Point', coordinates: [-60, -3] },
    });
    const geometryRoot = normalizeGeoJson({
      type: 'LineString',
      coordinates: [
        [-60, -3],
        [-59, -2],
      ],
    });

    expect(featureRoot.features).toHaveLength(1);
    expect(featureRoot.features[0]?.properties).toEqual({ name: 'one point' });
    expect(geometryRoot.features).toHaveLength(1);
    expect(geometryRoot.features[0]?.geometry.type).toBe('LineString');
  });

  it('flattens GeometryCollection members so supported families can render independently', () => {
    const normalized = normalizeGeoJson({
      type: 'GeometryCollection',
      geometries: [
        { type: 'Point', coordinates: [-60, -3] },
        {
          type: 'MultiPolygon',
          coordinates: [
            [
              [
                [-61, -4],
                [-59, -4],
                [-59, -2],
                [-61, -4],
              ],
            ],
          ],
        },
      ],
    });

    expect(normalized.features.map((feature) => feature.geometry.type)).toEqual(
      ['Point', 'MultiPolygon'],
    );
  });

  it('rejects non-GeoJSON roots and malformed coordinates', () => {
    expect(() => normalizeGeoJson({ hello: 'world' })).toThrow(
      /valid GeoJSON/i,
    );
    expect(() =>
      normalizeGeoJson({ type: 'Point', coordinates: ['not-a-number', -3] }),
    ).toThrow(/valid GeoJSON/i);
  });

  it('reports malformed polygon rings distinctly from generic GeoJSON errors', () => {
    expect(() =>
      normalizeGeoJson({
        type: 'Polygon',
        coordinates: [
          [
            [-61, -4],
            [-59, -4],
            [-59, -2],
            [-61, -3],
          ],
        ],
      }),
    ).toThrow(/polygon ring/i);
  });

  it('keeps structurally invalid polygon coordinates on the generic invalid path', () => {
    expect(() =>
      normalizeGeoJson({ type: 'Polygon', coordinates: 'not-an-array' }),
    ).toThrow('This file is not valid GeoJSON.');
    expect(() =>
      normalizeGeoJson({ type: 'Polygon', coordinates: [] }),
    ).toThrow('This file is not valid GeoJSON.');
    expect(() =>
      normalizeGeoJson({ type: 'Polygon', coordinates: [42] }),
    ).toThrow('This file is not valid GeoJSON.');
    expect(() =>
      normalizeGeoJson({
        type: 'Polygon',
        coordinates: [[['not-a-number', -3]]],
      }),
    ).toThrow('This file is not valid GeoJSON.');
  });

  it('derives unique child ids when flattening a GeometryCollection feature', () => {
    const normalized = normalizeGeoJson({
      type: 'Feature',
      id: 'group',
      properties: { source: 'field' },
      geometry: {
        type: 'GeometryCollection',
        geometries: [
          { type: 'Point', coordinates: [-60, -3] },
          {
            type: 'LineString',
            coordinates: [
              [-60, -3],
              [-59, -2],
            ],
          },
        ],
      },
    });

    expect(normalized.features.map((feature) => feature.id)).toEqual([
      'group:0',
      'group:1',
    ]);
  });

  it('rejects an empty FeatureCollection as unsupported', () => {
    expect(() =>
      normalizeGeoJson({ type: 'FeatureCollection', features: [] }),
    ).toThrow(/no supported geometry/i);
  });

  it('rejects excessively nested GeometryCollections with a controlled validation error', () => {
    let geometry: unknown = { type: 'Point', coordinates: [-60, -3] };
    for (let depth = 0; depth < 80; depth += 1) {
      geometry = { type: 'GeometryCollection', geometries: [geometry] };
    }

    expect(() => normalizeGeoJson(geometry)).toThrow(/valid GeoJSON/i);
  });

  it('rejects an oversized file before reading or parsing it', async () => {
    const text = vi.fn(async () => '{"type":"Point","coordinates":[0,0]}');
    const file = {
      name: 'too-large.geojson',
      size: MAX_GEOJSON_OVERLAY_BYTES + 1,
      text,
    } as unknown as File;

    await expect(readGeoJsonOverlayFile(file)).rejects.toMatchObject({
      code: 'too-large',
    });
    expect(text).not.toHaveBeenCalled();
  });

  it('rejects clearly unsupported file types before reading or parsing them', async () => {
    const text = vi.fn(async () => '{"type":"Point","coordinates":[0,0]}');
    const file = {
      name: 'reference.jpg',
      size: 64,
      type: 'image/jpeg',
      text,
    } as unknown as File;

    await expect(readGeoJsonOverlayFile(file)).rejects.toMatchObject({
      code: 'unsupported-file',
    });
    expect(text).not.toHaveBeenCalled();
  });

  it('reports file read failures separately from invalid JSON', async () => {
    const file = {
      name: 'unreadable.geojson',
      size: 64,
      type: 'application/geo+json',
      text: vi.fn(async () => {
        throw new Error('read failed');
      }),
    } as unknown as File;

    await expect(readGeoJsonOverlayFile(file)).rejects.toMatchObject({
      code: 'read',
    });
  });

  it('parses a valid file and reports invalid JSON as an invalid overlay', async () => {
    const validFile = {
      name: 'territory.geojson',
      size: 64,
      text: vi.fn(async () => '{"type":"Point","coordinates":[-60,-3]}'),
    } as unknown as File;
    const invalidFile = {
      name: 'broken.geojson',
      size: 64,
      text: vi.fn(async () => '{broken'),
    } as unknown as File;

    await expect(readGeoJsonOverlayFile(validFile)).resolves.toMatchObject({
      type: 'FeatureCollection',
    });
    await expect(readGeoJsonOverlayFile(invalidFile)).rejects.toMatchObject({
      code: 'invalid',
    });
  });
});
