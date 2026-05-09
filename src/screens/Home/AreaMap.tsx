import bbox from '@turf/bbox';
import type { FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Map, { Layer, type MapRef, Source } from 'react-map-gl/maplibre';

interface AreaMapProps {
  featureCollection?: FeatureCollection;
  children?: ReactNode;
}

export function AreaMap({ featureCollection, children }: AreaMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  const mapBounds = useMemo(() => {
    if (!featureCollection || featureCollection.features.length === 0) {
      return undefined;
    }
    try {
      const [minLng, minLat, maxLng, maxLat] = bbox(featureCollection);
      return [
        [minLng, minLat],
        [maxLng, maxLat],
      ] as [[number, number], [number, number]];
    } catch (e) {
      console.error('Failed to calculate bbox for featureCollection', e);
      return undefined;
    }
  }, [featureCollection]);

  useEffect(() => {
    if (isMapLoaded && mapBounds && mapRef.current) {
      mapRef.current.fitBounds(mapBounds, { padding: 50, duration: 1000 });
    }
  }, [mapBounds, isMapLoaded]);

  return (
    <div className="relative h-[600px] w-full overflow-hidden rounded-card border border-border/15 shadow-sm">
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: -60, // Fallback roughly Amazon
          latitude: -3,
          zoom: 4,
        }}
        mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        interactive={true}
        onLoad={() => setIsMapLoaded(true)}
      >
        {featureCollection && (
          <Source id="calculated-area" type="geojson" data={featureCollection}>
            <Layer
              id="area-fill"
              type="fill"
              source="calculated-area"
              paint={{
                'fill-color': '#1F6FFF',
                'fill-opacity': 0.3,
                'fill-outline-color': '#04145C',
              }}
            />
            <Layer
              id="area-outline"
              type="line"
              source="calculated-area"
              paint={{
                'line-color': '#04145C',
                'line-width': 2,
              }}
            />
          </Source>
        )}
      </Map>

      {/* Settings overlay menu */}
      <div className="absolute right-4 top-4 z-10 flex max-h-[calc(100%-2rem)] w-96 flex-col gap-4 overflow-y-auto pr-2 pb-4">
        {children}
      </div>
    </div>
  );
}
