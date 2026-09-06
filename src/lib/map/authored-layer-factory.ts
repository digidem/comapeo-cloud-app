import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';

import {
  type AuthoredLayer,
  type AuthoredLayerCommitContext,
  type AuthoredRenderLayer,
  type CreateGeoJsonAuthoredLayerOptions,
  type PrepareAuthoredLayerResult,
  createGeoJsonAuthoredLayer,
  prepareAuthoredLayer,
} from '@/lib/map/authored-layers';

const REFERENCE_FILL_PAINT = {
  'fill-color': '#E45D2A',
  'fill-opacity': 0.16,
} as const;
const REFERENCE_LINE_PAINT = {
  'line-color': '#E45D2A',
  'line-width': 3,
  'line-opacity': 0.9,
} as const;
const REFERENCE_CIRCLE_PAINT = {
  'circle-color': '#E45D2A',
  'circle-radius': 5,
  'circle-stroke-color': '#FFFFFF',
  'circle-stroke-width': 1.5,
} as const;

function normalizeReferencePaint(
  layer: AuthoredRenderLayer,
): AuthoredRenderLayer {
  switch (layer.type) {
    case 'fill':
      return { ...layer, paint: { ...layer.paint, ...REFERENCE_FILL_PAINT } };
    case 'line':
      return { ...layer, paint: { ...layer.paint, ...REFERENCE_LINE_PAINT } };
    case 'circle':
      return { ...layer, paint: { ...layer.paint, ...REFERENCE_CIRCLE_PAINT } };
    default:
      return layer;
  }
}

/**
 * Convert the already-normalized #222 GeoJSON overlay value into the canonical
 * #279 authored-layer model while retaining the reference-overlay visual style.
 */
export function createAuthoredLayerFromGeoJsonOverlay(
  normalizedInput: FeatureCollection<Geometry, GeoJsonProperties>,
  context: AuthoredLayerCommitContext,
  options: CreateGeoJsonAuthoredLayerOptions = {},
): PrepareAuthoredLayerResult {
  const created = createGeoJsonAuthoredLayer(normalizedInput, context, options);
  if (!created.ok) return created;

  const cloned: AuthoredLayer = {
    ...structuredClone(created.layer),
    render: {
      layers: created.layer.render.layers.map((layer) =>
        normalizeReferencePaint(structuredClone(layer)),
      ),
    },
  };

  return prepareAuthoredLayer(cloned, context);
}
