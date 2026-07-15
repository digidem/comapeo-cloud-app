import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import type { Feature, Polygon } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';

import { useEffect, useMemo, useRef } from 'react';
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
  /** Draw control props */
  drawMode?: 'draw_rectangle' | 'simple_select' | null;
  onDrawCreate?: (bbox: [number, number, number, number]) => void;
  onDrawUpdate?: (bbox: [number, number, number, number]) => void;
  onDrawDelete?: () => void;
  onDrawModeChange?: (mode: string | null) => void;
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
  drawMode,
  onDrawCreate,
  onDrawUpdate,
  onDrawDelete,
  onDrawModeChange,
}: MapAuthoringCanvasProps) {
  const intl = useIntl();
  const mapStyle = useMemo(() => basemapToMapStyle(basemap), [basemap]);
  const bboxFeature = useMemo(() => bboxToFeature(bbox), [bbox]);
  const drawRef = useRef<MapboxDraw | null>(null);

  // Initialize Draw control
  useEffect(() => {
    if (!mapRef.current?.getMap()) return;

    const map = mapRef.current.getMap();

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {
        rectangle: true,
        trash: true,
      },
      defaultMode: drawMode || 'simple_select',
      styles: [
        // Rectangle drawing style
        {
          id: 'gl-draw-polygon-fill-inactive',
          type: 'fill',
          filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
          paint: {
            'fill-color': '#1F6FFF',
            'fill-opacity': 0.3,
          },
        },
        {
          id: 'gl-draw-polygon-stroke-inactive',
          type: 'line',
          filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
          paint: {
            'line-color': '#04145C',
            'line-width': 2,
          },
        },
        // Rectangle drawing (active)
        {
          id: 'gl-draw-polygon-fill-active',
          type: 'fill',
          filter: [
            'all',
            ['==', '$type', 'Polygon'],
            ['==', 'mode', 'draw_rectangle'],
          ],
          paint: {
            'fill-color': '#1F6FFF',
            'fill-opacity': 0.4,
          },
        },
        {
          id: 'gl-draw-polygon-stroke-active',
          type: 'line',
          filter: [
            'all',
            ['==', '$type', 'Polygon'],
            ['==', 'mode', 'draw_rectangle'],
          ],
          paint: {
            'line-color': '#04145C',
            'line-width': 3,
            'line-dasharray': [4, 4],
          },
        },
        // Vertex points
        {
          id: 'gl-draw-polygon-and-line-vertex-active',
          type: 'circle',
          filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'vertex']],
          paint: {
            'circle-radius': 6,
            'circle-color': '#1F6FFF',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#FFFFFF',
          },
        },
        // Selected rectangle
        {
          id: 'gl-draw-polygon-fill-selected',
          type: 'fill',
          filter: [
            'all',
            ['==', '$type', 'Polygon'],
            ['==', 'mode', 'simple_select'],
          ],
          paint: {
            'fill-color': '#0F9D58',
            'fill-opacity': 0.3,
          },
        },
        {
          id: 'gl-draw-polygon-stroke-selected',
          type: 'line',
          filter: [
            'all',
            ['==', '$type', 'Polygon'],
            ['==', 'mode', 'simple_select'],
          ],
          paint: {
            'line-color': '#0F9D58',
            'line-width': 3,
          },
        },
      ],
    });

    map.addControl(draw, 'top-left');
    drawRef.current = draw;

    // Event handlers
    const handleDrawCreate = (e: MapboxDraw.DrawCreateEvent) => {
      if (e.features.length > 0 && onDrawCreate) {
        const coords = (e.features[0].geometry as Polygon).coordinates[0];
        const west = Math.min(...coords.map((c) => c[0]));
        const south = Math.min(...coords.map((c) => c[1]));
        const east = Math.max(...coords.map((c) => c[0]));
        const north = Math.max(...coords.map((c) => c[1]));
        onDrawCreate([west, south, east, north]);
      }
      if (onDrawModeChange) onDrawModeChange('simple_select');
    };

    const handleDrawUpdate = (e: MapboxDraw.DrawUpdateEvent) => {
      if (e.features.length > 0 && onDrawUpdate) {
        const coords = (e.features[0].geometry as Polygon).coordinates[0];
        const west = Math.min(...coords.map((c) => c[0]));
        const south = Math.min(...coords.map((c) => c[1]));
        const east = Math.max(...coords.map((c) => c[0]));
        const north = Math.max(...coords.map((c) => c[1]));
        onDrawUpdate([west, south, east, north]);
      }
    };

    const handleDrawDelete = (_e: MapboxDraw.DrawDeleteEvent) => {
      if (onDrawDelete) onDrawDelete();
    };

    const handleDrawModeChange = (e: MapboxDraw.DrawModeChangeEvent) => {
      if (onDrawModeChange) onDrawModeChange(e.mode);
    };

    map.on('draw.create', handleDrawCreate);
    map.on('draw.update', handleDrawUpdate);
    map.on('draw.delete', handleDrawDelete);
    map.on('draw.modechange', handleDrawModeChange);

    // Sync draw mode from props
    if (drawMode) {
      draw.changeMode(drawMode);
    }

    return () => {
      map.off('draw.create', handleDrawCreate);
      map.off('draw.update', handleDrawUpdate);
      map.off('draw.delete', handleDrawDelete);
      map.off('draw.modechange', handleDrawModeChange);
      if (drawRef.current) {
        map.removeControl(drawRef.current);
        drawRef.current = null;
      }
    };
  }, [
    mapRef,
    drawMode,
    onDrawCreate,
    onDrawUpdate,
    onDrawDelete,
    onDrawModeChange,
  ]);

  // Update draw mode when prop changes
  useEffect(() => {
    if (drawRef.current && drawMode !== undefined) {
      drawRef.current.changeMode(drawMode);
    }
  }, [drawMode]);

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
