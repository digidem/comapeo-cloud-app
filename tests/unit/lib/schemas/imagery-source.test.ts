import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import {
  basemapCategorySchema,
  imageryBasemapSchema,
} from '@/lib/schemas/imagery-source';

describe('imageryBasemapSchema', () => {
  it('accepts a valid raster basemap', () => {
    const result = v.parse(imageryBasemapSchema, {
      id: 'osm-standard',
      name: 'OpenStreetMap',
      category: 'street',
      type: 'raster',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    });
    expect(result.id).toBe('osm-standard');
    expect(result.type).toBe('raster');
  });

  it('accepts a valid style basemap', () => {
    const result = v.parse(imageryBasemapSchema, {
      id: 'carto-positron',
      name: 'CartoDB Positron',
      category: 'street',
      type: 'style',
      url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    });
    expect(result.type).toBe('style');
  });

  it('rejects tile-template URLs for style basemaps', () => {
    expect(() =>
      v.parse(imageryBasemapSchema, {
        id: 'bad-style',
        name: 'Bad Style URL',
        category: 'street',
        type: 'style',
        url: 'https://tile.example.com/{z}/{x}/{y}.png',
      }),
    ).toThrow();
  });

  it('accepts basemap with all optional fields', () => {
    const result = v.parse(imageryBasemapSchema, {
      id: 'esri-imagery',
      name: 'Esri World Imagery',
      category: 'satellite',
      type: 'raster',
      url: 'https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Esri',
      maxZoom: 22,
      minZoom: 0,
      tileSize: 256,
      bounds: [-180, -85, 180, 85],
    });
    expect(result.tileSize).toBe(256);
    expect(result.bounds).toEqual([-180, -85, 180, 85]);
  });

  it('accepts ELI {switch:a,b,c} template URLs', () => {
    const result = v.parse(imageryBasemapSchema, {
      id: 'eli-switch',
      name: 'ELI Switch Tiles',
      category: 'street',
      type: 'raster',
      url: 'https://{switch:a,b,c}.tile.example.com/{zoom}/{x}/{y}.png',
    });
    expect(result.id).toBe('eli-switch');
  });

  it('accepts ELI {-y} TMS inverted Y URLs', () => {
    const result = v.parse(imageryBasemapSchema, {
      id: 'tms-inverted',
      name: 'TMS Inverted Y',
      category: 'street',
      type: 'raster',
      url: 'https://tile.example.com/{z}/{x}/{-y}.png',
    });
    expect(result.id).toBe('tms-inverted');
  });

  it('accepts scheme: "tms" for explicit TMS declaration', () => {
    const result = v.parse(imageryBasemapSchema, {
      id: 'explicit-tms',
      name: 'Explicit TMS',
      category: 'street',
      type: 'raster',
      url: 'https://tile.example.com/{z}/{x}/{y}.png',
      scheme: 'tms',
    });
    expect(result.type).toBe('raster');
    if (result.type !== 'raster') throw new Error('Expected raster basemap');
    expect(result.scheme).toBe('tms');
  });

  it('accepts scheme: "xyz" for explicit XYZ declaration', () => {
    const result = v.parse(imageryBasemapSchema, {
      id: 'explicit-xyz',
      name: 'Explicit XYZ',
      category: 'street',
      type: 'raster',
      url: 'https://tile.example.com/{z}/{x}/{y}.png',
      scheme: 'xyz',
    });
    expect(result.type).toBe('raster');
    if (result.type !== 'raster') throw new Error('Expected raster basemap');
    expect(result.scheme).toBe('xyz');
  });

  it('omits scheme when not provided', () => {
    const result = v.parse(imageryBasemapSchema, {
      id: 'no-scheme',
      name: 'No Scheme',
      category: 'street',
      type: 'raster',
      url: 'https://tile.example.com/{z}/{x}/{y}.png',
    });
    expect(result.type).toBe('raster');
    if (result.type !== 'raster') throw new Error('Expected raster basemap');
    expect(result.scheme).toBeUndefined();
  });

  it('rejects invalid scheme value', () => {
    expect(() =>
      v.parse(imageryBasemapSchema, {
        id: 'bad-scheme',
        name: 'Bad Scheme',
        category: 'street',
        type: 'raster',
        url: 'https://tile.example.com/{z}/{x}/{y}.png',
        scheme: 'wms',
      }),
    ).toThrow();
  });

  it('rejects missing required fields', () => {
    expect(() =>
      v.parse(imageryBasemapSchema, {
        name: 'Missing id',
        category: 'street',
        type: 'raster',
        url: 'https://example.com/{z}/{x}/{y}.png',
      }),
    ).toThrow();
  });

  it('rejects URL without http/https scheme', () => {
    expect(() =>
      v.parse(imageryBasemapSchema, {
        id: 'bad',
        name: 'Bad URL',
        category: 'street',
        type: 'raster',
        url: 'not-a-url',
      }),
    ).toThrow();
  });

  it('rejects empty URL', () => {
    expect(() =>
      v.parse(imageryBasemapSchema, {
        id: 'bad',
        name: 'Empty URL',
        category: 'street',
        type: 'raster',
        url: '',
      }),
    ).toThrow();
  });

  it('rejects invalid category', () => {
    expect(() =>
      v.parse(imageryBasemapSchema, {
        id: 'bad',
        name: 'Bad Category',
        category: 'underwater',
        type: 'raster',
        url: 'https://example.com/{z}/{x}/{y}.png',
      }),
    ).toThrow();
  });

  it('rejects invalid type', () => {
    expect(() =>
      v.parse(imageryBasemapSchema, {
        id: 'bad',
        name: 'Bad Type',
        category: 'street',
        type: 'vector',
        url: 'https://example.com/{z}/{x}/{y}.png',
      }),
    ).toThrow();
  });

  it('rejects invalid tileSize', () => {
    expect(() =>
      v.parse(imageryBasemapSchema, {
        id: 'bad',
        name: 'Bad TileSize',
        category: 'street',
        type: 'raster',
        url: 'https://example.com/{z}/{x}/{y}.png',
        tileSize: 1024,
      }),
    ).toThrow();
  });
});

describe('basemapCategorySchema', () => {
  it.each(['street', 'satellite', 'topographic', 'dark'] as const)(
    'accepts "%s" category',
    (category) => {
      expect(v.parse(basemapCategorySchema, category)).toBe(category);
    },
  );

  it('rejects unknown category', () => {
    expect(() => v.parse(basemapCategorySchema, 'hybrid')).toThrow();
  });
});
