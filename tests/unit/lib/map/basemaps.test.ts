// Test for issue #153: default basemap should be Esri World Imagery
import { describe, expect, it } from 'vitest';

import {
  BASEMAP_CATALOG,
  DEFAULT_BASEMAP_ID,
  findBasemap,
} from '@/lib/map/basemaps';

describe('basemaps - default basemap', () => {
  it('DEFAULT_BASEMAP_ID should be esri-world-imagery', () => {
    expect(DEFAULT_BASEMAP_ID).toBe('esri-world-imagery');
  });

  it('esri-world-imagery should exist in the catalog', () => {
    const esri = BASEMAP_CATALOG.find((b) => b.id === 'esri-world-imagery');
    expect(esri).toBeDefined();
    expect(esri?.type).toBe('raster');
    expect(esri?.category).toBe('satellite');
  });

  it('findBasemap should return Esri World Imagery when given esri-world-imagery', () => {
    const basemap = findBasemap('esri-world-imagery');
    expect(basemap.id).toBe('esri-world-imagery');
    expect(basemap.name).toBe('Esri World Imagery');
  });

  it('findBasemap with undefined should fall back to DEFAULT_BASEMAP_ID', () => {
    const basemap = findBasemap(undefined);
    expect(basemap.id).toBe(DEFAULT_BASEMAP_ID);
  });
});
