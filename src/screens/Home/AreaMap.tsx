import bbox from '@turf/bbox';
import type { FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import Map, { Layer, type MapRef, Source } from 'react-map-gl/maplibre';

import { useThemeTokens } from '@/hooks/useThemeTokens';

const EMPTY_FEATURE_COLLECTION: FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

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

export function AreaMap({
  featureCollection,
  layers,
  activeMethodId,
  children,
}: AreaMapProps) {
  const mapRef = useRef<MapRef>(null);
  const isMapLoadedRef = useRef(false);
  const { mapColors } = useThemeTokens();

  const LAYER_COLORS: Record<string, string> = {
    observed: mapColors.observed,
    connectivity10: mapColors.connectivity,
    connectivity30: mapColors.warning,
    clusterHull: mapColors.cluster,
    grid: mapColors.grid,
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
          color: LAYER_COLORS[layer.id] ?? mapColors.observed,
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
        color: mapColors.observed,
        legacy: true,
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMethodId, featureCollection, layers, mapColors]);

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
    <div className="relative h-[600px] w-full overflow-hidden rounded-card border border-border/15 shadow-card">
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
                'fill-outline-color': layer.legacy
                  ? mapColors.grid
                  : layer.color,
              }}
            />
            <Layer
              id={layer.outlineLayerId}
              type="line"
              paint={{
                'line-color': layer.legacy ? mapColors.grid : layer.color,
                'line-width': getOutlineWidth(layer),
                ...(layer.legacy
                  ? {}
                  : { 'line-opacity': layer.isActive ? 0.95 : 0.7 }),
              }}
            />
          </Source>
        ))}
      </Map>

      {/* Settings overlay menu */}
      <div className="absolute right-4 top-4 z-10 flex max-h-[calc(100%-2rem)] w-96 flex-col gap-4 overflow-y-auto pr-2 pb-4">
        {children}
      </div>
    </div>
  );
}
