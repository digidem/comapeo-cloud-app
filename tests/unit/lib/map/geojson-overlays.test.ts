import { describe, expect, it, vi } from 'vitest';

import {
  MAX_GEOJSON_OVERLAY_BYTES,
  normalizeGeoJson,
  readGeoJsonOverlayFile,
  splitGeoJsonByGeometryFamily,
} from '@/lib/map/geojson-overlays';

describe('GeoJSON reference overlays', () => {
  it('accepts FeatureCollection roots and splits mixed supported geometry families', () => {
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

    const families = splitGeoJsonByGeometryFamily(normalized);

    expect(families.points.features).toHaveLength(1);
    expect(families.lines.features).toHaveLength(1);
    expect(families.polygons.features).toHaveLength(1);
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

    const families = splitGeoJsonByGeometryFamily(normalized);
    expect(normalized.features).toHaveLength(2);
    expect(families.points.features).toHaveLength(1);
    expect(families.polygons.features).toHaveLength(1);
  });

  it('rejects non-GeoJSON roots and malformed coordinates', () => {
    expect(() => normalizeGeoJson({ hello: 'world' })).toThrow(
      /valid GeoJSON/i,
    );
    expect(() =>
      normalizeGeoJson({ type: 'Point', coordinates: ['not-a-number', -3] }),
    ).toThrow(/valid GeoJSON/i);
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
