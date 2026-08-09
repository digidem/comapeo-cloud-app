import { describe, expect, it } from 'vitest';

import {
  WEB_MERCATOR_LAT_LIMIT,
  clampBboxLatitude,
  clampLatitude,
  crossesAntimeridian,
  spansAntimeridian,
} from '@/lib/map/bbox-utils';

describe('clampLatitude', () => {
  it('passes values within range', () => {
    expect(clampLatitude(0)).toBe(0);
    expect(clampLatitude(45)).toBe(45);
    expect(clampLatitude(-45)).toBe(-45);
  });

  it('clamps beyond ±85.051129', () => {
    expect(clampLatitude(90)).toBe(WEB_MERCATOR_LAT_LIMIT);
    expect(clampLatitude(-90)).toBe(-WEB_MERCATOR_LAT_LIMIT);
  });

  it('clamps at boundary', () => {
    expect(clampLatitude(WEB_MERCATOR_LAT_LIMIT)).toBe(WEB_MERCATOR_LAT_LIMIT);
    expect(clampLatitude(WEB_MERCATOR_LAT_LIMIT + 0.001)).toBe(
      WEB_MERCATOR_LAT_LIMIT,
    );
  });
});

describe('crossesAntimeridian', () => {
  it('returns false for normal longitudes', () => {
    expect(crossesAntimeridian([-180, 180])).toBe(false);
    expect(crossesAntimeridian([-90, 90])).toBe(false);
    expect(crossesAntimeridian([0, 0])).toBe(false);
  });

  it('returns true for longitudes outside ±180', () => {
    expect(crossesAntimeridian([-200, 180])).toBe(true);
    expect(crossesAntimeridian([-180, 200])).toBe(true);
    expect(crossesAntimeridian([190, -190])).toBe(true);
  });
});

describe('clampBboxLatitude', () => {
  it('clamps south and north', () => {
    expect(clampBboxLatitude([-180, -90, 180, 90])).toEqual([
      -180,
      -WEB_MERCATOR_LAT_LIMIT,
      180,
      WEB_MERCATOR_LAT_LIMIT,
    ]);
  });
});

describe('spansAntimeridian', () => {
  it('returns true for tight clusters crossing the antimeridian', () => {
    // Points at 179 and -179 span the antimeridian with a small angular span (2°)
    expect(spansAntimeridian([179, -179])).toBe(true);
    expect(spansAntimeridian([175, -175])).toBe(true);
    // Multiple points crossing
    expect(spansAntimeridian([179, -179, 178])).toBe(true);
  });

  it('returns false for clusters that do not cross the antimeridian', () => {
    // Normal range
    expect(spansAntimeridian([-10, 10])).toBe(false);
    // Cluster entirely on one side
    expect(spansAntimeridian([-70, -50])).toBe(false);
    expect(spansAntimeridian([175, 178])).toBe(false);
    // Cluster crossing prime meridian but not antimeridian
    expect(spansAntimeridian([-10, 10, 20])).toBe(false);
    // Points spread around the world (not a tight cluster)
    expect(spansAntimeridian([-170, 0, 170])).toBe(false);
  });

  it('returns false for single points', () => {
    expect(spansAntimeridian([5])).toBe(false);
    expect(spansAntimeridian([179])).toBe(false);
    expect(spansAntimeridian([-179])).toBe(false);
  });

  it('uses strict comparison at ±180 boundary', () => {
    // A cluster exactly touching 180° on one side is NOT antimeridian-spanning
    expect(spansAntimeridian([179, 180])).toBe(false);
    expect(spansAntimeridian([-180, -179])).toBe(false);
    // But a cluster straddling 180° IS
    expect(spansAntimeridian([179.5, 180.5])).toBe(true);
  });
});
