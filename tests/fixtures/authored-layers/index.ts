import type { AuthoredLayer } from '@/lib/map/authored-layers';

/**
 * Canonical vector fixture: a normalized mixed-geometry GeoJSON layer.
 *
 * Contains non-overlapping Polygon, LineString, and Point features whose
 * extents do not overlap, with exactly four non-default render fragments in
 * canonical order:
 *   0. polygon `fill` with `filter: ['in', '$type', 'Polygon']`
 *   1. polygon `line` outline with the same Polygon filter
 *   2. LineString `line` with `filter: ['in', '$type', 'LineString']`
 *   3. Point `circle` with `filter: ['in', '$type', 'Point']`
 *
 * The two line fragments (1 and 2) use identical stroke color/width/opacity
 * values so the bundle can round-trip through one logical GIS stroke style.
 *
 * Outer visibility is `false` (non-default) so the hidden-layer package/toggle
 * regression uses the same canonical fixture rather than an ad-hoc variant.
 */
export const AUTHORED_VECTOR_LAYER_FIXTURE: AuthoredLayer = {
  schemaVersion: 1,
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Territory boundary',
  visible: false,
  source: {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'polygon-area' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-61, -4],
                [-59, -4],
                [-59, -2],
                [-61, -2],
                [-61, -4],
              ],
            ],
          },
        },
        {
          type: 'Feature',
          properties: { name: 'line-feature' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [-58, -1],
              [-56, -1],
            ],
          },
        },
        {
          type: 'Feature',
          properties: { name: 'point-feature' },
          geometry: {
            type: 'Point',
            coordinates: [-55, 0],
          },
        },
      ],
    },
  },
  render: {
    layers: [
      {
        type: 'fill',
        filter: ['in', '$type', 'Polygon'],
        paint: {
          'fill-color': '#1F6FFF',
          'fill-opacity': 0.35,
        },
      },
      {
        type: 'line',
        filter: ['in', '$type', 'Polygon'],
        paint: {
          'line-color': '#04145C',
          'line-width': 2.5,
          'line-opacity': 0.95,
        },
      },
      {
        type: 'line',
        filter: ['in', '$type', 'LineString'],
        paint: {
          'line-color': '#04145C',
          'line-width': 2.5,
          'line-opacity': 0.95,
        },
      },
      {
        type: 'circle',
        filter: ['in', '$type', 'Point'],
        paint: {
          'circle-color': '#E45D2A',
          'circle-radius': 5,
        },
      },
    ],
  },
};

/**
 * Canonical raster fixture: a standard MapLibre-compatible raster-tile layer.
 *
 * - Single HTTPS tile template with exactly one {z}/{x}/{y} placeholder set
 * - tileSize 256
 * - scheme 'xyz'
 * - Non-default raster styling (raster-opacity 0.7, raster-saturation 0)
 * - visible: false (non-default hidden layer for package/toggle regression)
 */
export const AUTHORED_RASTER_LAYER_FIXTURE: AuthoredLayer = {
  schemaVersion: 1,
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Imagery overlay',
  visible: false,
  source: {
    type: 'raster-tiles',
    tiles: ['https://tiles.example.com/{z}/{x}/{y}.png'],
    tileSize: 256,
    scheme: 'xyz',
  },
  render: {
    layers: [
      {
        type: 'raster',
        paint: {
          'raster-opacity': 0.7,
          'raster-saturation': 0,
        },
      },
    ],
  },
};
