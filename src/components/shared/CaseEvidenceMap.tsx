import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';

import { useMemo } from 'react';
import { Layer, Source } from 'react-map-gl/maplibre';

import { MapContainer } from '@/components/shared/MapContainer/MapContainer';
import {
  buildCaseEvidenceFeatureCollection,
  getCaseEvidenceInitialViewState,
} from '@/components/shared/case-evidence-map-geometry';
import type { Alert, Observation, Track } from '@/lib/data-layer';
import type { CaseEvidenceReference } from '@/lib/db';

interface CaseEvidenceMapProps {
  evidence: readonly CaseEvidenceReference[];
  observations: readonly Observation[];
  alerts: readonly Alert[];
  tracks: readonly Track[];
}

export function CaseEvidenceMap({
  evidence,
  observations,
  alerts,
  tracks,
}: CaseEvidenceMapProps) {
  const featureCollection = useMemo<
    FeatureCollection<Geometry, GeoJsonProperties>
  >(
    () =>
      buildCaseEvidenceFeatureCollection({
        evidence,
        observations,
        alerts,
        tracks,
      }),
    [alerts, evidence, observations, tracks],
  );

  const initialViewState = getCaseEvidenceInitialViewState(featureCollection);

  return (
    <div className="relative h-[360px] min-h-[280px] overflow-hidden rounded-card border border-border">
      <MapContainer
        initialViewState={initialViewState}
        className="h-full w-full"
        height="100%"
      >
        {featureCollection.features.length > 0 ? (
          <Source id="case-evidence" type="geojson" data={featureCollection}>
            <Layer
              id="case-evidence-polygons"
              type="fill"
              filter={['==', ['geometry-type'], 'Polygon']}
              paint={{
                'fill-color': '#A55C17',
                'fill-opacity': 0.2,
                'fill-outline-color': '#A55C17',
              }}
            />
            <Layer
              id="case-evidence-lines"
              type="line"
              filter={['==', ['geometry-type'], 'LineString']}
              paint={{
                'line-color': '#174C3C',
                'line-width': 4,
                'line-opacity': 0.9,
              }}
            />
            <Layer
              id="case-evidence-points"
              type="circle"
              filter={['==', ['geometry-type'], 'Point']}
              paint={{
                'circle-color': '#A55C17',
                'circle-radius': 7,
                'circle-stroke-color': '#FFFFFF',
                'circle-stroke-width': 2,
              }}
            />
          </Source>
        ) : null}
      </MapContainer>
    </div>
  );
}
