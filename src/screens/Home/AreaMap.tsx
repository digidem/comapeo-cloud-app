import bbox from '@turf/bbox';
import type { FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { defineMessages, useIntl } from 'react-intl';
import Map, { Layer, type MapRef, Source } from 'react-map-gl/maplibre';

import { MapConfigSheet } from './MapConfigSheet';

const EMPTY_FEATURE_COLLECTION: FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

const messages = defineMessages({
  configMenu: {
    id: 'home.monitoredArea.configMenu',
    defaultMessage: 'Map settings',
  },
  configTitle: {
    id: 'home.monitoredArea.configTitle',
    defaultMessage: 'Monitored Area Settings',
  },
  closeConfig: {
    id: 'home.monitoredArea.closeConfig',
    defaultMessage: 'Close settings',
  },
});

interface AreaMapProps {
  featureCollection?: FeatureCollection;
  layers?: AreaMapLayer[];
  activeMethodId?: string;
  children?: ReactNode;
}

interface AreaMapLayer {
  id: string;
  featureCollection: FeatureCollection;
  isActive?: boolean;
}

interface RenderableAreaLayer {
  id: string;
  sourceId: string;
  fillLayerId: string;
  outlineLayerId: string;
  featureCollection: FeatureCollection;
  isActive: boolean;
  color: string;
  legacy: boolean;
}

function getFillOpacity(layer: RenderableAreaLayer): number {
  if (layer.legacy) return 0.3;
  return layer.isActive ? 0.38 : 0.18;
}

function getOutlineWidth(layer: RenderableAreaLayer): number {
  if (layer.legacy) return 2;
  return layer.isActive ? 3 : 2;
}

function getSourceKey(
  layer: RenderableAreaLayer,
  activeMethodId: string | undefined,
): string {
  if (layer.legacy) return activeMethodId ?? 'legacy';
  return `${layer.sourceId}-${layer.isActive ? 'active' : 'inactive'}`;
}

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(min-width: 1024px)').matches;
  });

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => {
      setIsDesktop(e.matches);
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isDesktop;
}

export function AreaMap({
  featureCollection,
  layers,
  activeMethodId,
  children,
}: AreaMapProps) {
  const mapRef = useRef<MapRef>(null);
  const isMapLoadedRef = useRef(false);
  const intl = useIntl();
  const isDesktop = useIsDesktop();
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  // On desktop the sheet is never shown — derive effective open state
  const isSheetOpen = isDesktop ? false : isConfigOpen;

  const hasChildren = Boolean(children);

  const LAYER_COLORS: Record<string, string> = {
    observed: '#1F6FFF',
    connectivity10: '#0F9D58',
    connectivity30: '#FF6B00',
    clusterHull: '#7C3AED',
    grid: '#04145C',
  };

  const mapLayers = useMemo<RenderableAreaLayer[]>(() => {
    if (layers && layers.length > 0) {
      const orderedLayers: AreaMapLayer[] = [];

      for (const layer of layers) {
        if (!layer.isActive) orderedLayers.push(layer);
      }

      for (const layer of layers) {
        if (layer.isActive) orderedLayers.push(layer);
      }

      const renderedLayers: RenderableAreaLayer[] = [];

      for (const layer of orderedLayers) {
        renderedLayers.push({
          id: layer.id,
          sourceId: `calculated-area-${layer.id}`,
          fillLayerId: `area-fill-${layer.id}`,
          outlineLayerId: `area-outline-${layer.id}`,
          featureCollection: layer.featureCollection,
          isActive: Boolean(layer.isActive),
          color: LAYER_COLORS[layer.id] ?? '#1F6FFF',
          legacy: false,
        });
      }

      return renderedLayers;
    }

    return [
      {
        id: activeMethodId ?? 'active',
        sourceId: 'calculated-area',
        fillLayerId: 'area-fill',
        outlineLayerId: 'area-outline',
        featureCollection: featureCollection ?? EMPTY_FEATURE_COLLECTION,
        isActive: true,
        color: '#1F6FFF',
        legacy: true,
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMethodId, featureCollection, layers]);

  const mapBounds = useMemo(() => {
    const features: FeatureCollection['features'] = [];

    for (const layer of mapLayers) {
      features.push(...layer.featureCollection.features);
    }

    if (features.length === 0) {
      return undefined;
    }

    try {
      const [minLng, minLat, maxLng, maxLat] = bbox({
        type: 'FeatureCollection',
        features,
      });

      return [
        [minLng, minLat],
        [maxLng, maxLat],
      ] as [[number, number], [number, number]];
    } catch (e) {
      console.error('Failed to calculate bbox for featureCollection', e);
      return undefined;
    }
  }, [mapLayers]);

  const fitMapToBounds = useCallback((bounds: typeof mapBounds) => {
    if (bounds && isMapLoadedRef.current && mapRef.current) {
      mapRef.current.fitBounds(bounds, { padding: 50, duration: 1000 });
    }
  }, []);

  useEffect(() => {
    fitMapToBounds(mapBounds);
  }, [fitMapToBounds, mapBounds]);

  return (
    <div
      data-testid="area-map-container"
      className="relative -mx-3 w-[calc(100%+1.5rem)] h-[min(60vh,500px)] overflow-hidden sm:-mx-4 sm:w-[calc(100%+2rem)] sm:h-[400px] lg:mx-0 lg:w-full lg:h-[600px] lg:flex lg:flex-row lg:overflow-visible lg:rounded-card lg:border lg:border-border/15 lg:shadow-card"
    >
      <div className="relative h-full min-h-0 flex-1 lg:min-w-0">
        <Map
          ref={mapRef}
          initialViewState={{
            longitude: -60, // Fallback roughly Amazon
            latitude: -3,
            zoom: 4,
          }}
          mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
          interactive={true}
          onLoad={() => {
            isMapLoadedRef.current = true;
            fitMapToBounds(mapBounds);
          }}
        >
          {mapLayers.map((layer) => (
            <Source
              key={getSourceKey(layer, activeMethodId)}
              id={layer.sourceId}
              type="geojson"
              data={layer.featureCollection}
            >
              <Layer
                id={layer.fillLayerId}
                type="fill"
                paint={{
                  'fill-color': layer.color,
                  'fill-opacity': getFillOpacity(layer),
                  'fill-outline-color': layer.legacy ? '#04145C' : layer.color,
                }}
              />
              <Layer
                id={layer.outlineLayerId}
                type="line"
                paint={{
                  'line-color': layer.legacy ? '#04145C' : layer.color,
                  'line-width': getOutlineWidth(layer),
                  ...(layer.legacy
                    ? {}
                    : { 'line-opacity': layer.isActive ? 0.95 : 0.7 }),
                }}
              />
            </Source>
          ))}
        </Map>

        {/* Three-dots config button — mobile only, inside map wrapper */}
        {hasChildren && !isDesktop && (
          <button
            type="button"
            className="absolute top-3 right-3 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface-card/90 text-text-muted backdrop-blur-sm shadow-card hover:bg-surface-card hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden"
            aria-label={intl.formatMessage(messages.configMenu)}
            onClick={() => setIsConfigOpen(true)}
            data-testid="config-menu-button"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        )}
      </div>

      {/* Desktop sidebar — always visible on lg+ */}
      {hasChildren && isDesktop && (
        <div className="absolute z-10 hidden flex-col gap-4 overflow-y-auto rounded-card border border-border/20 bg-surface-card/95 p-5 backdrop-blur-md shadow-elevated lg:static lg:flex lg:w-96 lg:shrink-0 lg:max-h-none lg:overflow-y-auto lg:border-l lg:border-border/20 lg:rounded-none lg:shadow-none">
          {children}
        </div>
      )}

      {/* Mobile bottom sheet */}
      {hasChildren && !isDesktop && (
        <MapConfigSheet
          open={isSheetOpen}
          onOpenChange={setIsConfigOpen}
          title={intl.formatMessage(messages.configTitle)}
          closeLabel={intl.formatMessage(messages.closeConfig)}
        >
          {children}
        </MapConfigSheet>
      )}
    </div>
  );
}
