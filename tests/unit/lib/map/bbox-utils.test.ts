import { describe, expect, it } from 'vitest';

import {
  WEB_MERCATOR_LAT_LIMIT,
  clampBboxLatitude,
  clampLatitude,
  crossesAntimeridian,
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
