import { useCallback, useEffect, useMemo, useRef } from 'react';
import { defineMessages, useIntl } from 'react-intl';
import {
  Layer,
  type MapLayerMouseEvent,
  type MapRef,
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
const INTERACTIVE_LAYER_IDS = ['alert-points', 'alert-lines', 'alert-polygons'];

export interface AlertsMapProps {
  alerts: Alert[];
  height?: string | number;
  showEmptyState?: boolean;
  basemapSwitcherPositionClassName?: string;
  onGeometryClick?: (alertId: string) => void;
}

export function AlertsMap({
  alerts,
  height = 'h-[min(70vh,560px)]',
  showEmptyState = true,
  basemapSwitcherPositionClassName,
  onGeometryClick,
}: AlertsMapProps) {
  const intl = useIntl();
  const navigate = useNavigate();
  const mapRef = useRef<MapRef>(null);
  const mapLoadedRef = useRef(false);
  const hasFitRef = useRef(false);
  const featureCollection = useMemo(
    () => alertsToFeatureCollection(alerts),
    [alerts],
  );
  const bounds = useMemo(
    () => getAlertGeometryBounds(featureCollection),
    [featureCollection],
  );

  const fitInitialBounds = useCallback(() => {
    if (
      !bounds ||
      !mapLoadedRef.current ||
      !mapRef.current ||
      hasFitRef.current
    ) {
      return;
    }
    hasFitRef.current = true;
    mapRef.current.fitBounds(bounds, {
      padding: 50,
      maxZoom: 14,
      duration: 800,
    });
  }, [bounds]);

  useEffect(() => {
    fitInitialBounds();
  }, [fitInitialBounds]);

  const handleGeometryClick = useCallback(
    (event: MapLayerMouseEvent) => {
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
    [navigate, onGeometryClick],
  );

  const isTailwindClass = typeof height === 'string' && /^h-/.test(height);

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
        onClick={handleGeometryClick}
        interactiveLayerIds={INTERACTIVE_LAYER_IDS}
        cursor={featureCollection.features.length > 0 ? 'pointer' : 'grab'}
        className="h-full w-full"
        basemapSwitcherPositionClassName={basemapSwitcherPositionClassName}
      >
        {featureCollection.features.length > 0 ? (
          <Source id="alerts" type="geojson" data={featureCollection}>
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
                'circle-color': ALERT_COLOR,
                'circle-radius': 7,
                'circle-stroke-color': '#FFFFFF',
                'circle-stroke-width': 2,
              }}
            />
          </Source>
        ) : null}
      </MapContainer>

      {showEmptyState && featureCollection.features.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-card/80 p-6 text-center backdrop-blur-sm">
          <p className="text-text-muted text-sm">
            {intl.formatMessage(messages.empty)}
          </p>
        </div>
      ) : null}
    </div>
  );
}
