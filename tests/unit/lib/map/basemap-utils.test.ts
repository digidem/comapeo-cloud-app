import { describe, expect, it } from 'vitest';

import { basemapToMapStyle, normalizeTileUrl } from '@/lib/map/basemap-utils';
import { BASEMAP_CATALOG, findBasemap } from '@/lib/map/basemaps';

describe('normalizeTileUrl', () => {
  it('replaces {zoom} with {z}', () => {
    const result = normalizeTileUrl(
      'https://tile.example.com/{zoom}/{x}/{y}.png',
    );
    expect(result).toEqual(['https://tile.example.com/{z}/{x}/{y}.png']);
  });

  it('leaves {z} unchanged', () => {
    const result = normalizeTileUrl('https://tile.example.com/{z}/{x}/{y}.png');
    expect(result).toEqual(['https://tile.example.com/{z}/{x}/{y}.png']);
  });

  it('expands {switch:a,b,c} into multiple URLs', () => {
    const result = normalizeTileUrl(
      'https://{switch:a,b,c}.tile.example.com/{zoom}/{x}/{y}.png',
    );
    expect(result).toEqual([
      'https://a.tile.example.com/{z}/{x}/{y}.png',
      'https://b.tile.example.com/{z}/{x}/{y}.png',
      'https://c.tile.example.com/{z}/{x}/{y}.png',
    ]);
  });

  it('handles single switch variant', () => {
    const result = normalizeTileUrl(
      'https://{switch:services}.example.com/{z}/{x}/{y}.png',
    );
    expect(result).toEqual(['https://services.example.com/{z}/{x}/{y}.png']);
  });

  it('replaces {-y} with {y} for TMS tiles', () => {
    const result = normalizeTileUrl(
      'https://tile.example.com/{z}/{x}/{-y}.png',
    );
    expect(result).toEqual(['https://tile.example.com/{z}/{x}/{y}.png']);
  });

  it('handles {-y} combined with {zoom}', () => {
    const result = normalizeTileUrl(
      'https://tile.example.com/{zoom}/{x}/{-y}.png',
    );
    expect(result).toEqual(['https://tile.example.com/{z}/{x}/{y}.png']);
  });

  it('handles {-y} combined with {switch:a,b,c}', () => {
    const result = normalizeTileUrl(
      'https://{switch:a,b,c}.tile.example.com/{zoom}/{x}/{-y}.png',
    );
    expect(result).toEqual([
      'https://a.tile.example.com/{z}/{x}/{y}.png',
      'https://b.tile.example.com/{z}/{x}/{y}.png',
      'https://c.tile.example.com/{z}/{x}/{y}.png',
    ]);
  });
});

describe('basemapToMapStyle', () => {
  it('returns URL string for style-type basemap', () => {
    const basemap = findBasemap('carto-positron');
    const result = basemapToMapStyle(basemap);
    expect(typeof result).toBe('string');
    expect(result).toContain('cartocdn.com');
  });

  it('returns StyleSpecification for raster-type basemap', () => {
    const basemap = findBasemap('osm-standard');
    const result = basemapToMapStyle(basemap);
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('version', 8);
    expect(result).toHaveProperty('sources');
    expect(result).toHaveProperty('layers');
  });

  it('raster style has correct source and layer', () => {
    const basemap = findBasemap('osm-standard');
    const result = basemapToMapStyle(basemap);
    const style = result as Exclude<typeof result, string>;

    expect(style.sources['osm-standard']).toBeDefined();
    const source = style.sources['osm-standard'] as { type: string };
    expect(source.type).toBe('raster');

    const layer = style.layers[0] as { source: string; type: string };
    expect(layer.source).toBe('osm-standard');
    expect(layer.type).toBe('raster');
  });

  it('raster style includes attribution', () => {
    const basemap = findBasemap('osm-standard');
    const result = basemapToMapStyle(basemap);
    const style = result as Exclude<typeof result, string>;
    const source = style.sources['osm-standard'] as { attribution: string };
    expect(source.attribution).toContain('OpenStreetMap');
  });

  it('raster style does not set layer maxzoom to allow overscaling', () => {
    const basemap = findBasemap('osm-standard');
    const result = basemapToMapStyle(basemap);
    const style = result as Exclude<typeof result, string>;
    const layer = style.layers[0] as Record<string, unknown>;
    expect(layer).not.toHaveProperty('maxzoom');
    expect(layer).not.toHaveProperty('minzoom');
  });

  it('sets scheme to tms when URL contains {-y}', () => {
    const tmsBasemap = {
      id: 'test-tms',
      name: 'Test TMS',
      category: 'street' as const,
      type: 'raster' as const,
      url: 'https://tile.example.com/{z}/{x}/{-y}.png',
      attribution: 'Test',
    };
    const result = basemapToMapStyle(tmsBasemap);
    const style = result as Exclude<typeof result, string>;
    const source = style.sources['test-tms'] as {
      scheme: string;
      tiles: string[];
    };
    expect(source.scheme).toBe('tms');
    // {-y} should be replaced with {y} in tiles
    expect(source.tiles).toEqual(['https://tile.example.com/{z}/{x}/{y}.png']);
  });

  it('does not set scheme for standard XYZ tiles', () => {
    const basemap = findBasemap('osm-standard');
    const result = basemapToMapStyle(basemap);
    const style = result as Exclude<typeof result, string>;
    const source = style.sources['osm-standard'] as Record<string, unknown>;
    expect(source).not.toHaveProperty('scheme');
  });

  it('respects explicit scheme=tms on basemap entry', () => {
    const explicitTms = {
      id: 'explicit-tms',
      name: 'Explicit TMS',
      category: 'street' as const,
      type: 'raster' as const,
      url: 'https://tile.example.com/{z}/{x}/{y}.png',
      scheme: 'tms' as const,
      attribution: 'Test',
    };
    const result = basemapToMapStyle(explicitTms);
    const style = result as Exclude<typeof result, string>;
    const source = style.sources['explicit-tms'] as { scheme: string };
    expect(source.scheme).toBe('tms');
  });

  it('handles every basemap in the catalog without error', () => {
    for (const basemap of BASEMAP_CATALOG) {
      const result = basemapToMapStyle(basemap);
      if (basemap.type === 'style') {
        expect(typeof result).toBe('string');
      } else {
        expect(typeof result).toBe('object');
        const style = result as Exclude<typeof result, string>;
        expect(style.version).toBe(8);
      }
    }
  });
});
