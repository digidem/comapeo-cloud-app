import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import {
  BASEMAP_CATALOG,
  DEFAULT_BASEMAP_ID,
  findBasemap,
} from '@/lib/map/basemaps';
import { imageryBasemapSchema } from '@/lib/schemas/imagery-source';

describe('BASEMAP_CATALOG', () => {
  it('every entry validates against imageryBasemapSchema', () => {
    const result = v.parse(v.array(imageryBasemapSchema), BASEMAP_CATALOG);
    expect(result.length).toBeGreaterThan(0);
  });

  it('has unique ids', () => {
    const ids = BASEMAP_CATALOG.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes the default basemap', () => {
    expect(BASEMAP_CATALOG.some((b) => b.id === DEFAULT_BASEMAP_ID)).toBe(true);
  });

  it('has at least one basemap per category', () => {
    const categories = new Set(BASEMAP_CATALOG.map((b) => b.category));
    expect(categories.has('street')).toBe(true);
    expect(categories.has('satellite')).toBe(true);
    expect(categories.has('topographic')).toBe(true);
    expect(categories.has('dark')).toBe(true);
  });
});

describe('findBasemap', () => {
  it('returns the matching basemap by id', () => {
    const result = findBasemap('osm-standard');
    expect(result.id).toBe('osm-standard');
  });

  it('returns the default basemap when id is undefined', () => {
    const result = findBasemap(undefined);
    expect(result.id).toBe(DEFAULT_BASEMAP_ID);
  });

  it('returns the default basemap when id is not found', () => {
    const result = findBasemap('nonexistent');
    expect(result.id).toBe(DEFAULT_BASEMAP_ID);
  });

  it('uses a custom catalog when provided', () => {
    const customCatalog = [
      {
        id: 'custom',
        name: 'Custom Map',
        category: 'street' as const,
        type: 'raster' as const,
        url: 'https://example.com/{z}/{x}/{y}.png',
      },
    ];
    const result = findBasemap('custom', customCatalog);
    expect(result.id).toBe('custom');
  });

  it('falls back to first entry when custom catalog omits the default', () => {
    const customCatalog = [
      {
        id: 'custom-a',
        name: 'Custom A',
        category: 'satellite' as const,
        type: 'raster' as const,
        url: 'https://example.com/a/{z}/{x}/{y}.png',
      },
      {
        id: 'custom-b',
        name: 'Custom B',
        category: 'street' as const,
        type: 'raster' as const,
        url: 'https://example.com/b/{z}/{x}/{y}.png',
      },
    ];
    const result = findBasemap(undefined, customCatalog);
    expect(result.id).toBe('custom-a');
  });

  it('throws when catalog is empty', () => {
    expect(() => findBasemap(undefined, [])).toThrow(
      'Basemap catalog is empty',
    );
  });
});
