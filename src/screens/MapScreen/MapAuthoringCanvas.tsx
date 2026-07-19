import type { Feature, Polygon } from 'geojson';
import type { MapMouseEvent, MapTouchEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useIntl } from 'react-intl';
import Map, {
  AttributionControl,
  Layer,
  type MapRef,
  Source,
} from 'react-map-gl/maplibre';

import { basemapToMapStyle } from '@/lib/map/basemap-utils';
import type { ImageryBasemap } from '@/lib/schemas/imagery-source';

import { mapMessages } from './messages';

interface MapAuthoringCanvasProps {
  basemap: ImageryBasemap;
  bbox: [number, number, number, number] | null;
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
  const bboxFeature = useMemo(
    () => (bbox ? bboxToFeature(bbox) : null),
    [bbox],
  );

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
  const dragStartRef = useRef<{ lng: number; lat: number } | null>(null);
  const dragEndRef = useRef<{ lng: number; lat: number } | null>(null);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const endPointRef = useRef<{ x: number; y: number } | null>(null);
  const MIN_DRAG_PX = 12;

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
  const handleDragStart = useCallback(
    (lng: number, lat: number, point: { x: number; y: number }) => {
      isDraggingRef.current = true;
      dragStartRef.current = { lng, lat };
      dragEndRef.current = { lng, lat };
      startPointRef.current = point;
      endPointRef.current = point;
      setDragStart({ lng, lat });
      setDragEnd({ lng, lat });
    },
    [],
  );

  const handleDragMove = useCallback(
    (lng: number, lat: number, point: { x: number; y: number }) => {
      if (!isDraggingRef.current) return;
      dragEndRef.current = { lng, lat };
      endPointRef.current = point;
      setDragEnd({ lng, lat });
    },
    [],
  );

  const handleDragEnd = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    const start = dragStartRef.current;
    const end = dragEndRef.current;
    const sp = startPointRef.current;
    const ep = endPointRef.current;
    dragStartRef.current = null;
    dragEndRef.current = null;
    startPointRef.current = null;
    endPointRef.current = null;
    setDragStart(null);
    setDragEnd(null);
    if (!start || !end || !sp || !ep) return;
    // Ignore taps and accidental micro-drags; stay in draw mode
    if (
      Math.abs(ep.x - sp.x) < MIN_DRAG_PX ||
      Math.abs(ep.y - sp.y) < MIN_DRAG_PX
    ) {
      return;
    }
    const result = cornersToBbox(start.lng, start.lat, end.lng, end.lat);
    if (isValidBbox(result)) {
      onDrawCreateRef.current?.(result);
      onDrawModeChangeRef.current?.('simple_select');
    }
  }, []);

  // Attach / detach map event listeners when draw mode changes
  // Also reset drag state when exiting draw mode
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !isDrawing) {
      // Reset drag state when not drawing
      isDraggingRef.current = false;
      dragStartRef.current = null;
      dragEndRef.current = null;
      startPointRef.current = null;
      endPointRef.current = null;
      setDragStart(null);
      setDragEnd(null);
      return;
    }

    const onMouseDown = (e: MapMouseEvent) =>
      handleDragStart(e.lngLat.lng, e.lngLat.lat, e.point);
    const onMouseMove = (e: MapMouseEvent) =>
      handleDragMove(e.lngLat.lng, e.lngLat.lat, e.point);
    const onMouseUp = () => handleDragEnd();
    const onTouchStart = (e: MapTouchEvent) => {
      if (e.originalEvent.touches.length > 1) {
        // Cancel draw on second finger; let pinch-zoom navigate
        isDraggingRef.current = false;
        setDragStart(null);
        setDragEnd(null);
        return;
      }
      handleDragStart(e.lngLat.lng, e.lngLat.lat, e.point);
    };
    const onTouchMove = (e: MapTouchEvent) => {
      if (e.originalEvent.touches.length > 1) {
        isDraggingRef.current = false;
        setDragStart(null);
        setDragEnd(null);
        return;
      }
      if (!isDraggingRef.current) {
        // Resume drawing when user drops back to one finger after a pinch
        handleDragStart(e.lngLat.lng, e.lngLat.lat, e.point);
        return;
      }
      handleDragMove(e.lngLat.lng, e.lngLat.lat, e.point);
    };
    const onTouchEnd = () => handleDragEnd();
    const onTouchCancel = () => {
      isDraggingRef.current = false;
      setDragStart(null);
      setDragEnd(null);
    };

    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);
    map.on('touchstart', onTouchStart);
    map.on('touchmove', onTouchMove);
    map.on('touchend', onTouchEnd);
    map.on('touchcancel', onTouchCancel);

    // Crosshair cursor while drawing; pin touch-action to prevent
    // browser from stealing one-finger drags as scroll/pan
    const canvas = map.getCanvas();
    const prevCursor = canvas.style.cursor;
    const prevTouchAction = canvas.style.touchAction;
    canvas.style.cursor = 'crosshair';
    canvas.style.touchAction = 'none';

    return () => {
      map.off('mousedown', onMouseDown);
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      map.off('touchstart', onTouchStart);
      map.off('touchmove', onTouchMove);
      map.off('touchend', onTouchEnd);
      map.off('touchcancel', onTouchCancel);
      canvas.style.cursor = prevCursor;
      canvas.style.touchAction = prevTouchAction;
    };
  }, [mapRef, isDrawing, handleDragStart, handleDragMove, handleDragEnd]);

  // Escape key cancels drawing
  useEffect(() => {
    if (!isDrawing) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onDrawModeChangeRef.current?.('simple_select');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawing]);

  // Disable default drag‑pan and scroll‑zoom while drawing
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    if (isDrawing) {
      map.dragPan.disable();
      map.scrollZoom.disable();
    } else {
      map.dragPan.enable();
      map.scrollZoom.enable();
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
        attributionControl={false}
      >
        <AttributionControl position="bottom-left" compact />
        {bboxFeature && (
          <Source id="authoring-bbox" type="geojson" data={bboxFeature}>
            <Layer
              id="authoring-bbox-fill"
              type="fill"
              paint={BBOX_FILL_PAINT}
            />
            <Layer
              id="authoring-bbox-outline"
              type="line"
              paint={BBOX_OUTLINE_PAINT}
            />
          </Source>
        )}

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
