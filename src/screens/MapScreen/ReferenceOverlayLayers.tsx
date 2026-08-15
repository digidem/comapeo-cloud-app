import { Layer, Source } from 'react-map-gl/maplibre';

import type { GeoJsonOverlay } from '@/lib/map/geojson-overlays';

const REFERENCE_POINT_PAINT = {
  'circle-color': '#E45D2A',
  'circle-radius': 5,
  'circle-stroke-color': '#FFFFFF',
  'circle-stroke-width': 1.5,
} as const;

const REFERENCE_LINE_PAINT = {
  'line-color': '#E45D2A',
  'line-width': 3,
  'line-opacity': 0.9,
} as const;

const REFERENCE_FILL_PAINT = {
  'fill-color': '#E45D2A',
  'fill-opacity': 0.16,
} as const;

const REFERENCE_OUTLINE_PAINT = {
  'line-color': '#E45D2A',
  'line-width': 2.5,
  'line-opacity': 0.95,
} as const;

interface ReferenceOverlayLayersProps {
  overlay: GeoJsonOverlay;
}

/**
 * Keep one MapLibre source mounted per reference file. Geometry-family filters
 * let mixed FeatureCollections render correctly while layer visibility toggles
 * avoid re-uploading the parsed GeoJSON when the user hides an overlay.
 */
export function ReferenceOverlayLayers({
  overlay,
}: ReferenceOverlayLayersProps) {
  const sourceId = `reference-overlay-${overlay.id}`;
  const layout = {
    visibility: overlay.visible ? ('visible' as const) : ('none' as const),
  };

  return (
    <Source id={sourceId} type="geojson" data={overlay.data}>
      <Layer
        id={`${sourceId}-polygons-fill`}
        type="fill"
        paint={REFERENCE_FILL_PAINT}
        layout={layout}
        filter={['in', '$type', 'Polygon']}
      />
      <Layer
        id={`${sourceId}-polygons-outline`}
        type="line"
        paint={REFERENCE_OUTLINE_PAINT}
        layout={layout}
        filter={['in', '$type', 'Polygon']}
      />
      <Layer
        id={`${sourceId}-lines-line`}
        type="line"
        paint={REFERENCE_LINE_PAINT}
        layout={layout}
        filter={['in', '$type', 'LineString']}
      />
      <Layer
        id={`${sourceId}-points-circle`}
        type="circle"
        paint={REFERENCE_POINT_PAINT}
        layout={layout}
        filter={['in', '$type', 'Point']}
      />
    </Source>
  );
}

export type { ReferenceOverlayLayersProps };
