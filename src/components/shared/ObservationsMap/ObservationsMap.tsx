import bbox from '@turf/bbox';
import type { FeatureCollection, Point } from 'geojson';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { defineMessages, useIntl } from 'react-intl';
import { type MapRef, Marker } from 'react-map-gl/maplibre';

import { useNavigate } from '@tanstack/react-router';

import { MapContainer } from '@/components/shared/MapContainer';
import { ObservationCategoryIcon } from '@/components/shared/ObservationCategoryIcon';
import type { ObservationCategory } from '@/lib/category-utils';
import type { Observation } from '@/lib/data-layer';

const messages = defineMessages({
  empty: {
    id: 'observationsMap.empty',
    defaultMessage: 'No observations with location to show on the map',
  },
  markerLabel: {
    id: 'observationsMap.markerLabel',
    defaultMessage: 'View observation',
  },
});

function isValidCoord(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

export interface ObservationsMapProps {
  /** Full observation list (geo + non-geo); component filters internally. */
  observations: Observation[];
  categoryByObservationId?: Map<string, ObservationCategory>;
  /** Optional height override; defaults to responsive mobile-friendly value. */
  height?: string | number;
  /** Test/storybook seam: override navigation. Defaults to TanStack useNavigate. */
  onMarkerClick?: (observationId: string) => void;
}

export function ObservationsMap({
  observations,
  categoryByObservationId,
  height = 'h-[min(70vh,560px)]',
  onMarkerClick,
}: ObservationsMapProps) {
  const intl = useIntl();
  const navigate = useNavigate();
  const mapRef = useRef<MapRef>(null);
  const isMapLoadedRef = useRef(false);

  // Filter to geo-tagged observations with valid coords
  const geoObservations = useMemo(
    () =>
      observations.filter(
        (o) =>
          o.lat !== null &&
          o.lat !== undefined &&
          o.lon !== null &&
          o.lon !== undefined &&
          isValidCoord(o.lat, o.lon),
      ),
    [observations],
  );

  // Calculate bounds from geo observations
  const mapBounds = useMemo(() => {
    if (geoObservations.length === 0) return undefined;

    try {
      const fc: FeatureCollection<Point> = {
        type: 'FeatureCollection',
        features: geoObservations.map((o) => ({
          type: 'Feature' as const,
          properties: { localId: o.localId },
          geometry: {
            type: 'Point' as const,
            coordinates: [o.lon!, o.lat!],
          },
        })),
      };
      const [minLng, minLat, maxLng, maxLat] = bbox(fc);
      return [
        [minLng, minLat],
        [maxLng, maxLat],
      ] as [[number, number], [number, number]];
    } catch (e) {
      console.error('Failed to calculate bbox for observations', e);
      return undefined;
    }
  }, [geoObservations]);

  const fitMapToBounds = useCallback((bounds: typeof mapBounds) => {
    if (bounds && isMapLoadedRef.current && mapRef.current) {
      mapRef.current.fitBounds(bounds, {
        padding: 50,
        maxZoom: 14,
        duration: 800,
      });
    }
  }, []);

  useEffect(() => {
    fitMapToBounds(mapBounds);
  }, [fitMapToBounds, mapBounds]);

  // Detect Tailwind height classes via h- prefix (e.g. 'h-[300px]', 'h-64', 'h-screen')
  // Plain values like '300px' or 500 are passed as inline styles instead.
  const isTailwindClass = typeof height === 'string' && /^h-/.test(height);

  return (
    <div
      className={
        isTailwindClass
          ? `relative overflow-hidden rounded-card ${height}`
          : undefined
      }
      style={
        isTailwindClass
          ? undefined
          : { height: typeof height === 'number' ? `${height}px` : height }
      }
    >
      <MapContainer
        mapRef={mapRef}
        initialViewState={{
          longitude: -60,
          latitude: -3,
          zoom: 4,
        }}
        onLoad={() => {
          isMapLoadedRef.current = true;
          fitMapToBounds(mapBounds);
        }}
        className="h-full w-full"
      >
        {geoObservations.map((o) => (
          <Marker
            key={o.localId}
            longitude={o.lon!}
            latitude={o.lat!}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              if (onMarkerClick) {
                onMarkerClick(o.localId);
              } else {
                navigate({
                  to: '/data/observations/$observationId',
                  params: { observationId: o.localId },
                });
              }
            }}
          >
            <button
              type="button"
              className="flex items-center justify-center min-h-[44px] min-w-[44px] cursor-pointer"
              aria-label={intl.formatMessage(messages.markerLabel)}
            >
              {categoryByObservationId?.get(o.localId) ? (
                <div className="rounded-full border-2 border-white bg-surface-card shadow-md">
                  <ObservationCategoryIcon
                    category={categoryByObservationId.get(o.localId)!}
                    className="h-7 w-7"
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="h-3 w-3 rounded-full bg-danger border-2 border-white shadow-md" />
                  <div className="h-2.5 w-0.5 rounded-full bg-danger/60" />
                </div>
              )}
            </button>
          </Marker>
        ))}
      </MapContainer>

      {geoObservations.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-card/80 backdrop-blur-sm">
          <p className="text-text-muted text-sm">
            {intl.formatMessage(messages.empty)}
          </p>
        </div>
      )}
    </div>
  );
}
