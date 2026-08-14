import { useCallback, useEffect, useMemo, useRef } from 'react';
import { defineMessages, useIntl } from 'react-intl';
import {
  Layer,
  type MapLayerMouseEvent,
  type MapRef,
  Marker,
  Source,
} from 'react-map-gl/maplibre';

import { useNavigate } from '@tanstack/react-router';

import { MapContainer } from '@/components/shared/MapContainer';
import {
  alertsToFeatureCollection,
  getAlertGeometryBounds,
} from '@/lib/alert-geometry';
import type { Alert } from '@/lib/data-layer';

const messages = defineMessages({
  empty: {
    id: 'alertsMap.empty',
    defaultMessage: 'No alerts with location to show on the map',
  },
});

const ALERT_COLOR = '#52627A';
const ALERT_POINT_COLOR = '#DC2626';
const INTERACTIVE_LAYER_IDS = ['alert-points', 'alert-lines', 'alert-polygons'];

export interface AlertsMapProps {
  alerts: Alert[];
  height?: string | number;
  showEmptyState?: boolean;
  basemapSwitcherPositionClassName?: string;
  onGeometryClick?: (alertId: string) => void;
  interactionMode?: 'browse' | 'create-point';
  onMapPointSelect?: (point: [number, number]) => void;
  draftPoint?: [number, number];
}

export function AlertsMap({
  alerts,
  height = 'h-[min(70vh,560px)]',
  showEmptyState = true,
  basemapSwitcherPositionClassName,
  onGeometryClick,
  interactionMode = 'browse',
  onMapPointSelect,
  draftPoint,
}: AlertsMapProps) {
  const intl = useIntl();
  const navigate = useNavigate();
  const mapRef = useRef<MapRef>(null);
  const mapLoadedRef = useRef(false);
  const lastFittedBoundsKeyRef = useRef<string | null>(null);
  const featureCollection = useMemo(
    () => alertsToFeatureCollection(alerts),
    [alerts],
  );
  const bounds = useMemo(
    () => getAlertGeometryBounds(featureCollection),
    [featureCollection],
  );
  const boundsKey = bounds?.flat().join(',') ?? null;

  const fitInitialBounds = useCallback(() => {
    if (
      !bounds ||
      !boundsKey ||
      !mapLoadedRef.current ||
      !mapRef.current ||
      lastFittedBoundsKeyRef.current === boundsKey
    ) {
      return;
    }
    lastFittedBoundsKeyRef.current = boundsKey;
    mapRef.current.fitBounds(bounds, {
      padding: 50,
      maxZoom: 14,
      duration: 800,
    });
  }, [bounds, boundsKey]);

  useEffect(() => {
    fitInitialBounds();
  }, [fitInitialBounds]);

  const handleMapClick = useCallback(
    (event: MapLayerMouseEvent) => {
      if (interactionMode === 'create-point') {
        onMapPointSelect?.([event.lngLat.lng, event.lngLat.lat]);
        return;
      }
      const alertId = event.features?.[0]?.properties?.alertId;
      if (typeof alertId !== 'string') return;
      if (onGeometryClick) {
        onGeometryClick(alertId);
        return;
      }
      navigate({
        to: '/alerts/$alertId',
        params: { alertId },
      });
    },
    [interactionMode, navigate, onGeometryClick, onMapPointSelect],
  );

  const isTailwindClass = typeof height === 'string' && /^h-/.test(height);
  let mapCursor = 'grab';
  if (interactionMode === 'create-point') mapCursor = 'crosshair';
  else if (featureCollection.features.length > 0) mapCursor = 'pointer';

  return (
    <div
      className={
        isTailwindClass
          ? `relative overflow-hidden rounded-card ${height}`
          : 'relative overflow-hidden rounded-card'
      }
      style={
        isTailwindClass
          ? undefined
          : { height: typeof height === 'number' ? `${height}px` : height }
      }
    >
      <MapContainer
        mapRef={mapRef}
        initialViewState={{ longitude: -60, latitude: -3, zoom: 4 }}
        onLoad={() => {
          mapLoadedRef.current = true;
          fitInitialBounds();
        }}
        onClick={handleMapClick}
        interactiveLayerIds={
          interactionMode === 'browse' ? INTERACTIVE_LAYER_IDS : undefined
        }
        cursor={mapCursor}
        className="h-full w-full"
        basemapSwitcherPositionClassName={basemapSwitcherPositionClassName}
      >
        {featureCollection.features.length > 0 ? (
          <Source id="alerts" type="geojson" data={featureCollection}>
            {/* MapLibre's geometry-type expression returns the simple family
                for Multi* geometries, so these three layers cover all six
                supported GeoJSON geometry types. */}
            <Layer
              id="alert-polygons"
              type="fill"
              filter={['==', ['geometry-type'], 'Polygon']}
              paint={{
                'fill-color': ALERT_COLOR,
                'fill-opacity': 0.24,
                'fill-outline-color': ALERT_COLOR,
              }}
            />
            <Layer
              id="alert-lines"
              type="line"
              filter={['==', ['geometry-type'], 'LineString']}
              paint={{
                'line-color': ALERT_COLOR,
                'line-width': 3,
                'line-opacity': 0.9,
              }}
            />
            <Layer
              id="alert-points"
              type="circle"
              filter={['==', ['geometry-type'], 'Point']}
              paint={{
                'circle-color': ALERT_POINT_COLOR,
                'circle-radius': 7,
                'circle-stroke-color': '#FFFFFF',
                'circle-stroke-width': 2,
              }}
            />
          </Source>
        ) : null}
        {draftPoint ? (
          <Marker longitude={draftPoint[0]} latitude={draftPoint[1]}>
            <div
              data-testid="alert-draft-point"
              aria-hidden="true"
              className="h-4 w-4 rounded-full border-2 border-surface-card bg-error shadow"
            />
          </Marker>
        ) : null}
      </MapContainer>

      {showEmptyState &&
      interactionMode === 'browse' &&
      featureCollection.features.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-card/80 p-6 text-center backdrop-blur-sm">
          <p className="text-text-muted text-sm">
            {intl.formatMessage(messages.empty)}
          </p>
        </div>
      ) : null}
    </div>
  );
}
