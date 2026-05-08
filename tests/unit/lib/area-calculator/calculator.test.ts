import * as turf from '@turf/turf';
import { describe, expect, it } from 'vitest';

import {
  calculateAllMethods,
  extractPoints,
} from '@/lib/area-calculator/calculator';
import { DEFAULTS } from '@/lib/area-calculator/config';

const testPoints = [
  { lon: -74.006, lat: 40.7128 },
  { lon: -73.985, lat: 40.758 },
  { lon: -74.044, lat: 40.689 },
];

function makePointFeature(lon: number, lat: number) {
  return turf.point([lon, lat]);
}

function makePointFeatureCollection() {
  return turf.featureCollection(
    testPoints.map((p) => makePointFeature(p.lon, p.lat)),
  );
}

describe('extractPoints', () => {
  it('handles a FeatureCollection of Points', () => {
    const fc = makePointFeatureCollection();
    const result = extractPoints(fc);
    expect(result).toHaveLength(testPoints.length);
    for (const feature of result) {
      expect(feature.type).toBe('Feature');
      expect(feature.geometry.type).toBe('Point');
    }
  });

  it('handles a single Feature<Point>', () => {
    const feature = makePointFeature(-74.006, 40.7128);
    const result = extractPoints(feature);
    expect(result).toHaveLength(1);
    expect(result[0]!.geometry.type).toBe('Point');
  });

  it('handles a MultiPoint geometry wrapped in a Feature', () => {
    const multiPoint = turf.multiPoint([
      [-74.006, 40.7128],
      [-73.985, 40.758],
    ]);
    const result = extractPoints(multiPoint);
    expect(result).toHaveLength(2);
    for (const feature of result) {
      expect(feature.geometry.type).toBe('Point');
    }
  });

  it('returns empty array for empty FeatureCollection', () => {
    const empty = turf.featureCollection([]);
    const result = extractPoints(empty);
    expect(result).toHaveLength(0);
  });

  it('returns empty array for unknown input type', () => {
    const result = extractPoints({ type: 'Unknown' });
    expect(result).toHaveLength(0);
  });

  it('filters out features without geometry in FeatureCollection', () => {
    const fc = {
      type: 'FeatureCollection' as const,
      features: [
        makePointFeature(-74.006, 40.7128),
        { type: 'Feature', properties: {}, geometry: null },
      ],
    };
    const result = extractPoints(fc);
    expect(result).toHaveLength(1);
  });

  it('filters malformed, non-finite, and out-of-range coordinates', () => {
    const fc = {
      type: 'FeatureCollection' as const,
      features: [
        makePointFeature(-74.006, 40.7128),
        {
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'Point' as const, coordinates: [181, 40] },
        },
        {
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'Point' as const, coordinates: [-74, 91] },
        },
        {
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'Point' as const, coordinates: [Number.NaN, 40] },
        },
        {
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'Point' as const, coordinates: [-74] },
        },
        {
          type: 'Feature' as const,
          properties: {},
          geometry: {
            type: 'MultiPoint' as const,
            coordinates: [
              [-73.985, 40.758],
              [-200, 40],
              [-74, Number.POSITIVE_INFINITY],
            ],
          },
        },
      ],
    };

    const result = extractPoints(fc);

    expect(result).toHaveLength(2);
    expect(result.map((feature) => feature.geometry.coordinates)).toEqual([
      [-74.006, 40.7128],
      [-73.985, 40.758],
    ]);
  });
});

describe('calculateAllMethods', () => {
  it('returns 5 lazy method descriptors for valid points', () => {
    const fc = makePointFeatureCollection();
    const points = extractPoints(fc);
    const descriptors = calculateAllMethods(points, DEFAULTS);

    expect(descriptors).toHaveLength(5);
    for (const descriptor of descriptors) {
      expect(typeof descriptor.id).toBe('string');
      expect(typeof descriptor.progress).toBe('string');
      expect(typeof descriptor.run).toBe('function');
    }
  });

  it('each method result has areaM2 > 0', () => {
    const fc = makePointFeatureCollection();
    const points = extractPoints(fc);
    const results = calculateAllMethods(points, DEFAULTS).map((method) =>
      method.run(),
    );
    for (const result of results) {
      expect(result.areaM2).toBeGreaterThan(0);
    }
  });

  it('each method result has required fields', () => {
    const fc = makePointFeatureCollection();
    const points = extractPoints(fc);
    const results = calculateAllMethods(points, DEFAULTS).map((method) =>
      method.run(),
    );
    for (const result of results) {
      expect(typeof result.id).toBe('string');
      expect(typeof result.label).toBe('string');
      expect(typeof result.description).toBe('string');
      expect(result.featureCollection.type).toBe('FeatureCollection');
      expect(result.previewFeatureCollection.type).toBe('FeatureCollection');
      expect(typeof result.areaM2).toBe('number');
      expect(typeof result.metadata).toBe('object');
    }
  });

  it('does not execute method calculations eagerly', () => {
    expect(() => calculateAllMethods([], DEFAULTS)).not.toThrow();
  });

  it('returns descriptors for all 5 expected method ids', () => {
    const fc = makePointFeatureCollection();
    const points = extractPoints(fc);
    const descriptors = calculateAllMethods(points, DEFAULTS);
    const ids = descriptors.map((r) => r.id);
    expect(ids).toEqual([
      'observed',
      'connectivity10',
      'connectivity30',
      'clusterHull',
      'grid',
    ]);
  });

  it('does not throw for a single point input', () => {
    const points = extractPoints(makePointFeature(-74.006, 40.7128));
    expect(() =>
      calculateAllMethods(points, DEFAULTS).map((method) => method.run()),
    ).not.toThrow();
  });

  it('creates a full occupied grid cell for a single point', () => {
    const points = extractPoints(makePointFeature(-74.006, 40.7128));
    const grid = calculateAllMethods(points, DEFAULTS).find(
      (method) => method.id === 'grid',
    );

    expect(grid).toBeDefined();
    expect(grid!.run().areaM2).toBeGreaterThan(0);
  });
});
