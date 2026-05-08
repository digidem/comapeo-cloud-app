import { describe, expect, it } from 'vitest';

import {
  BUILT_IN_PRESETS,
  DEFAULTS,
  PARAM_FIELDS,
} from '@/lib/area-calculator/config';

describe('DEFAULTS', () => {
  it('contains all required param keys', () => {
    const keys: (keyof typeof DEFAULTS)[] = [
      'observedBufferMeters',
      'connectivity10Km',
      'connectivity30Km',
      'clusterDistanceKm',
      'hullMaxEdgeKm',
      'hullFallbackBufferKm',
      'gridCellKm',
    ];
    for (const key of keys) {
      expect(DEFAULTS).toHaveProperty(key);
      expect(typeof DEFAULTS[key]).toBe('number');
    }
  });

  it('has valid positive number values', () => {
    for (const value of Object.values(DEFAULTS)) {
      expect(value).toBeGreaterThan(0);
    }
  });

  it('has expected default values', () => {
    expect(DEFAULTS.observedBufferMeters).toBe(100);
    expect(DEFAULTS.connectivity10Km).toBe(10);
    expect(DEFAULTS.connectivity30Km).toBe(30);
    expect(DEFAULTS.clusterDistanceKm).toBe(30);
    expect(DEFAULTS.hullMaxEdgeKm).toBe(30);
    expect(DEFAULTS.hullFallbackBufferKm).toBe(15);
    expect(DEFAULTS.gridCellKm).toBe(5);
  });
});

describe('PARAM_FIELDS', () => {
  it('is an array of strings', () => {
    expect(Array.isArray(PARAM_FIELDS)).toBe(true);
    for (const field of PARAM_FIELDS) {
      expect(typeof field).toBe('string');
    }
  });

  it('contains all DEFAULTS keys', () => {
    const defaultKeys = Object.keys(DEFAULTS);
    expect(PARAM_FIELDS).toHaveLength(defaultKeys.length);
    for (const key of defaultKeys) {
      expect(PARAM_FIELDS).toContain(key);
    }
  });
});

describe('BUILT_IN_PRESETS', () => {
  it('is an array with at least one preset', () => {
    expect(Array.isArray(BUILT_IN_PRESETS)).toBe(true);
    expect(BUILT_IN_PRESETS.length).toBeGreaterThan(0);
  });

  it('each preset has required string fields', () => {
    for (const preset of BUILT_IN_PRESETS) {
      expect(typeof preset.id).toBe('string');
      expect(preset.id.length).toBeGreaterThan(0);
      expect(typeof preset.label).toBe('string');
      expect(preset.label.length).toBeGreaterThan(0);
      expect(typeof preset.description).toBe('string');
      expect(preset.description.length).toBeGreaterThan(0);
    }
  });

  it('each preset has params with all required fields', () => {
    const requiredKeys = Object.keys(DEFAULTS);
    for (const preset of BUILT_IN_PRESETS) {
      expect(preset.params).toBeDefined();
      for (const key of requiredKeys) {
        expect(preset.params).toHaveProperty(key);
        expect(typeof preset.params[key as keyof typeof DEFAULTS]).toBe(
          'number',
        );
        expect(preset.params[key as keyof typeof DEFAULTS]).toBeGreaterThan(0);
      }
    }
  });

  it('each preset has a unique id', () => {
    const ids = BUILT_IN_PRESETS.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('includes a balanced preset', () => {
    const balanced = BUILT_IN_PRESETS.find((p) => p.id === 'balanced');
    expect(balanced).toBeDefined();
    expect(balanced!.params).toMatchObject(DEFAULTS);
  });
});
