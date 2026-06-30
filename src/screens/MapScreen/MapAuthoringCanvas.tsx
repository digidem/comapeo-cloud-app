import type { Feature, Polygon } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';

import { useMemo } from 'react';
import type { RefObject } from 'react';
import { useIntl } from 'react-intl';
import Map, { Layer, type MapRef, Source } from 'react-map-gl/maplibre';

import { basemapToMapStyle } from '@/lib/map/basemap-utils';
import type { ImageryBasemap } from '@/lib/schemas/imagery-source';

import { mapMessages } from './messages';

interface MapAuthoringCanvasProps {
  basemap: ImageryBasemap;
  bbox: [number, number, number, number];
  mapRef: RefObject<MapRef | null>;
}

const INITIAL_VIEW_STATE = {
  longitude: -60,
  latitude: -3,
  zoom: 4,
};

const MAP_STYLE = { width: '100%', height: '100%' };

const BBOX_FILL_PAINT = {
  'fill-color': '#1F6FFF',
  'fill-opacity': 0.18,
  'fill-outline-color': '#04145C',
};

const BBOX_OUTLINE_PAINT = {
  'line-color': '#04145C',
  'line-width': 2,
};

function bboxToFeature([west, south, east, north]: [
  number,
  number,
  number,
  number,
]): Feature<Polygon> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ],
      ],
    },
  };
}

export function MapAuthoringCanvas({
  basemap,
  bbox,
  mapRef,
}: MapAuthoringCanvasProps) {
  const intl = useIntl();
  const mapStyle = useMemo(() => basemapToMapStyle(basemap), [basemap]);
  const bboxFeature = useMemo(() => bboxToFeature(bbox), [bbox]);

  return (
    <section
      role="region"
      aria-label={intl.formatMessage(mapMessages.canvasAria)}
      data-testid="map-authoring-canvas"
      className="h-full min-h-0 overflow-hidden"
    >
      <Map
        ref={mapRef}
        initialViewState={INITIAL_VIEW_STATE}
        mapStyle={mapStyle}
        style={MAP_STYLE}
      >
        <Source id="authoring-bbox" type="geojson" data={bboxFeature}>
          <Layer id="authoring-bbox-fill" type="fill" paint={BBOX_FILL_PAINT} />
          <Layer
            id="authoring-bbox-outline"
            type="line"
            paint={BBOX_OUTLINE_PAINT}
          />
        </Source>
      </Map>
    </section>
  );
}

export type { MapAuthoringCanvasProps };
