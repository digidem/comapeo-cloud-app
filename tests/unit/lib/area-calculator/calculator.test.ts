import * as turf from '@turf/turf';
import { describe, expect, it, vi } from 'vitest';

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
});

describe('calculateAllMethods', () => {
  it('returns 5 method results for valid points', () => {
    const fc = makePointFeatureCollection();
    const points = extractPoints(fc);
    const onProgress = vi.fn();
    const results = calculateAllMethods(points, DEFAULTS, onProgress);
    expect(results).toHaveLength(5);
  });

  it('each method result has areaM2 > 0', () => {
    const fc = makePointFeatureCollection();
    const points = extractPoints(fc);
    const onProgress = vi.fn();
    const results = calculateAllMethods(points, DEFAULTS, onProgress);
    for (const result of results) {
      expect(result.areaM2).toBeGreaterThan(0);
    }
  });

  it('each method result has required fields', () => {
    const fc = makePointFeatureCollection();
    const points = extractPoints(fc);
    const onProgress = vi.fn();
    const results = calculateAllMethods(points, DEFAULTS, onProgress);
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

  it('calls onProgress at least once per method', () => {
    const fc = makePointFeatureCollection();
    const points = extractPoints(fc);
    const onProgress = vi.fn();
    const results = calculateAllMethods(points, DEFAULTS, onProgress);
    expect(onProgress).toHaveBeenCalledTimes(results.length);
  });

  it('returns results for all 5 expected method ids', () => {
    const fc = makePointFeatureCollection();
    const points = extractPoints(fc);
    const results = calculateAllMethods(points, DEFAULTS, () => {});
    const ids = results.map((r) => r.id);
    expect(ids).toContain('observed');
    expect(ids).toContain('connectA');
    expect(ids).toContain('connectB');
    expect(ids).toContain('clusterHull');
    expect(ids).toContain('grid');
  });

  it('does not throw for a single point input', () => {
    const points = extractPoints(makePointFeature(-74.006, 40.7128));
    expect(() => calculateAllMethods(points, DEFAULTS, () => {})).not.toThrow();
  });
});
