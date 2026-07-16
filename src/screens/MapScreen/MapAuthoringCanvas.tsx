import type { Feature, Polygon } from 'geojson';
import type { MapMouseEvent, MapTouchEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  /** Draw mode state */
  drawMode?: 'draw_rectangle' | 'simple_select' | null;
  /** Called when a rectangle is drawn via map drag */
  onDrawCreate?: (bbox: [number, number, number, number]) => void;
  onDrawModeChange?: (mode: 'draw_rectangle' | 'simple_select' | null) => void;
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

/** Paint for the drag‑to‑draw preview rectangle */
const DRAW_FILL_PAINT = {
  'fill-color': '#1F6FFF',
  'fill-opacity': 0.3,
};

const DRAW_OUTLINE_PAINT = {
  'line-color': '#04145C',
  'line-width': 2,
  'line-dasharray': [4, 4] as number[],
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

/** Convert two corners to a normalised bbox */
function cornersToBbox(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number,
): [number, number, number, number] {
  return [
    Math.min(lng1, lng2),
    Math.min(lat1, lat2),
    Math.max(lng1, lng2),
    Math.max(lat1, lat2),
  ];
}

/** Reject zero‑area bboxes */
function isValidBbox(b: [number, number, number, number]): boolean {
  return b[0] !== b[2] && b[1] !== b[3];
}

const EMPTY_FEATURE: Feature<Polygon> = {
  type: 'Feature',
  properties: {},
  geometry: { type: 'Polygon', coordinates: [[]] },
};

export function MapAuthoringCanvas({
  basemap,
  bbox,
  mapRef,
  drawMode,
  onDrawCreate,
  onDrawModeChange,
}: MapAuthoringCanvasProps) {
  const intl = useIntl();
  const mapStyle = useMemo(() => basemapToMapStyle(basemap), [basemap]);
  const bboxFeature = useMemo(() => bboxToFeature(bbox), [bbox]);

  // Drag‑to‑draw state
  const [dragStart, setDragStart] = useState<{
    lng: number;
    lat: number;
  } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ lng: number; lat: number } | null>(
    null,
  );
  const isDrawing = drawMode === 'draw_rectangle';
  const isDraggingRef = useRef(false);

  // Keep latest callback refs to avoid re‑binding the effect
  const onDrawCreateRef = useRef(onDrawCreate);
  const onDrawModeChangeRef = useRef(onDrawModeChange);
  useEffect(() => {
    onDrawCreateRef.current = onDrawCreate;
    onDrawModeChangeRef.current = onDrawModeChange;
  }, [onDrawCreate, onDrawModeChange]);

  /** Preview polygon from current drag state */
  const previewFeature = useMemo<Feature<Polygon>>(() => {
    if (!dragStart || !dragEnd) return EMPTY_FEATURE;
    return bboxToFeature(
      cornersToBbox(dragStart.lng, dragStart.lat, dragEnd.lng, dragEnd.lat),
    );
  }, [dragStart, dragEnd]);

  // ---------- Mouse & touch event handlers ----------
  const handleDragStart = useCallback((lng: number, lat: number) => {
    isDraggingRef.current = true;
    setDragStart({ lng, lat });
    setDragEnd({ lng, lat });
  }, []);

  const handleDragMove = useCallback((lng: number, lat: number) => {
    if (!isDraggingRef.current) return;
    setDragEnd({ lng, lat });
  }, []);

  const handleDragEnd = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    setDragStart((prevStart) => {
      setDragEnd((prevEnd) => {
        if (!prevStart || !prevEnd) return null;

        const result = cornersToBbox(
          prevStart.lng,
          prevStart.lat,
          prevEnd.lng,
          prevEnd.lat,
        );

        if (isValidBbox(result)) {
          onDrawCreateRef.current?.(result);
          onDrawModeChangeRef.current?.('simple_select');
        }
        return null;
      });
      return null;
    });
  }, []);

  // Attach / detach map event listeners when draw mode changes
  // Also reset drag state when exiting draw mode
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !isDrawing) {
      // Reset drag state when not drawing
      setDragStart(null);
      setDragEnd(null);
      return;
    }

    const onMouseDown = (e: MapMouseEvent) =>
      handleDragStart(e.lngLat.lng, e.lngLat.lat);
    const onMouseMove = (e: MapMouseEvent) =>
      handleDragMove(e.lngLat.lng, e.lngLat.lat);
    const onMouseUp = () => handleDragEnd();
    const onTouchStart = (e: MapTouchEvent) =>
      handleDragStart(e.lngLat.lng, e.lngLat.lat);
    const onTouchMove = (e: MapTouchEvent) =>
      handleDragMove(e.lngLat.lng, e.lngLat.lat);
    const onTouchEnd = () => handleDragEnd();

    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);
    map.on('touchstart', onTouchStart);
    map.on('touchmove', onTouchMove);
    map.on('touchend', onTouchEnd);

    // Crosshair cursor while drawing
    const canvas = map.getCanvas();
    const prevCursor = canvas.style.cursor;
    canvas.style.cursor = 'crosshair';

    return () => {
      map.off('mousedown', onMouseDown);
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      map.off('touchstart', onTouchStart);
      map.off('touchmove', onTouchMove);
      map.off('touchend', onTouchEnd);
      canvas.style.cursor = prevCursor;
    };
  }, [mapRef, isDrawing, handleDragStart, handleDragMove, handleDragEnd]);

  // Reset drag state when exiting draw mode — inline with the main effect
  // to avoid calling setState in its own effect body.

  // Disable default drag‑pan while drawing
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    if (isDrawing) {
      map.dragPan.disable();
    } else {
      map.dragPan.enable();
    }
  }, [mapRef, isDrawing]);

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

        {isDrawing && dragStart && dragEnd && (
          <Source id="draw-preview" type="geojson" data={previewFeature}>
            <Layer id="draw-preview-fill" type="fill" paint={DRAW_FILL_PAINT} />
            <Layer
              id="draw-preview-outline"
              type="line"
              paint={DRAW_OUTLINE_PAINT}
            />
          </Source>
        )}
      </Map>
    </section>
  );
}

export type { MapAuthoringCanvasProps };
