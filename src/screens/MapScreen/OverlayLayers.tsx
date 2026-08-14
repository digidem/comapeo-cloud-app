import type { FeatureCollection } from 'geojson';

import { useMemo } from 'react';
import { Layer, Source } from 'react-map-gl/maplibre';

/**
 * A single GeoJSON reference overlay loaded during map authoring.
 * Overlays are transient — they are never persisted into `SavedMap`.
 */
export interface GeoJsonOverlay {
  /** Stable unique id for this overlay instance. */
  id: string;
  /** Original file name shown in the overlay list. */
  fileName: string;
  /** Normalised FeatureCollection ready for MapLibre ingestion. */
  data: FeatureCollection;
  /** Whether the overlay is currently visible on the map. */
  visible: boolean;
}

/**
 * Paint properties for each geometry family.
 * Uses the design-system palette: navy outline (#04145C) with a
 * low-opacity blue fill (#1F6FFF) and a warm accent for points/lines.
 */

const POINT_PAINT = {
  'circle-radius': 5,
  'circle-color': '#F59E0B',
  'circle-stroke-color': '#04145C',
  'circle-stroke-width': 1.5,
} as const;

const LINE_PAINT = {
  'line-color': '#F59E0B',
  'line-width': 2,
} as const;

const POLYGON_FILL_PAINT = {
  'fill-color': '#1F6FFF',
  'fill-opacity': 0.15,
} as const;

const POLYGON_OUTLINE_PAINT = {
  'line-color': '#04145C',
  'line-width': 1.5,
} as const;

interface OverlayLayersProps {
  overlay: GeoJsonOverlay;
}

/**
 * Renders a single GeoJSON overlay on the map using three filter-based
 * layer families: points (circle), lines (line), and polygons (fill + outline).
 *
 * A single GeoJSON source feeds all layers; each layer uses a filter
 * expression to select only the relevant geometry types so that mixed
 * FeatureCollections render every supported family.
 */
export function OverlayLayers({ overlay }: OverlayLayersProps) {
  const sourceId = `overlay-src-${overlay.id}`;
  const data = useMemo(
    () => overlay.data,
    // The data object is stable per overlay; only re-serialize when identity changes.
    [overlay.data],
  );

  return (
    <Source id={sourceId} type="geojson" data={data}>
      <Layer
        id={`${overlay.id}-points`}
        type="circle"
        source={sourceId}
        paint={POINT_PAINT}
        layout={
          overlay.visible ? { visibility: 'visible' } : { visibility: 'none' }
        }
        filter={['in', '$type', 'Point']}
      />
      <Layer
        id={`${overlay.id}-lines`}
        type="line"
        source={sourceId}
        paint={LINE_PAINT}
        layout={
          overlay.visible ? { visibility: 'visible' } : { visibility: 'none' }
        }
        filter={['in', '$type', 'LineString']}
      />
      <Layer
        id={`${overlay.id}-polygon-fill`}
        type="fill"
        source={sourceId}
        paint={POLYGON_FILL_PAINT}
        layout={
          overlay.visible ? { visibility: 'visible' } : { visibility: 'none' }
        }
        filter={['in', '$type', 'Polygon']}
      />
      <Layer
        id={`${overlay.id}-polygon-outline`}
        type="line"
        source={sourceId}
        paint={POLYGON_OUTLINE_PAINT}
        layout={
          overlay.visible ? { visibility: 'visible' } : { visibility: 'none' }
        }
        filter={['in', '$type', 'Polygon']}
      />
    </Source>
  );
}
