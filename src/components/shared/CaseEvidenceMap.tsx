import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
} from 'geojson';

import { useMemo } from 'react';
import { Layer, Source } from 'react-map-gl/maplibre';

import { MapContainer } from '@/components/shared/MapContainer/MapContainer';
import type { Alert, Observation, Track } from '@/lib/data-layer';
import type { CaseEvidenceReference } from '@/lib/db';

interface CaseEvidenceMapProps {
  evidence: readonly CaseEvidenceReference[];
  observations: readonly Observation[];
  alerts: readonly Alert[];
  tracks: readonly Track[];
  evidenceCount?: number;
}

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function observationFeature(observation: Observation): Feature | null {
  if (
    !isFiniteCoordinate(observation.lon) ||
    !isFiniteCoordinate(observation.lat)
  ) {
    return null;
  }
  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [observation.lon, observation.lat],
    },
    properties: {
      sourceType: 'observation',
      sourceLocalId: observation.localId,
    },
  };
}

function alertFeature(alert: Alert): Feature | null {
  if (!alert.geometry) return null;
  return {
    type: 'Feature',
    geometry: alert.geometry as Geometry,
    properties: {
      sourceType: 'alert',
      sourceLocalId: alert.localId,
    },
  };
}

function trackFeature(track: Track): Feature | null {
  const coordinates: number[][] = [];
  for (const location of track.locations) {
    const { longitude, latitude } = location.coords;
    if (isFiniteCoordinate(longitude) && isFiniteCoordinate(latitude)) {
      coordinates.push([longitude, latitude]);
    }
  }
  if (coordinates.length < 2) return null;
  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates,
    },
    properties: {
      sourceType: 'track',
      sourceLocalId: track.localId,
    },
  };
}

function firstCoordinate(geometry: Geometry): [number, number] | null {
  switch (geometry.type) {
    case 'Point':
      return isFiniteCoordinate(geometry.coordinates[0]) &&
        isFiniteCoordinate(geometry.coordinates[1])
        ? [geometry.coordinates[0], geometry.coordinates[1]]
        : null;
    case 'MultiPoint':
    case 'LineString': {
      const coordinate = geometry.coordinates[0];
      return coordinate &&
        isFiniteCoordinate(coordinate[0]) &&
        isFiniteCoordinate(coordinate[1])
        ? [coordinate[0], coordinate[1]]
        : null;
    }
    case 'MultiLineString':
    case 'Polygon': {
      const coordinate = geometry.coordinates[0]?.[0];
      return coordinate &&
        isFiniteCoordinate(coordinate[0]) &&
        isFiniteCoordinate(coordinate[1])
        ? [coordinate[0], coordinate[1]]
        : null;
    }
    case 'MultiPolygon': {
      const coordinate = geometry.coordinates[0]?.[0]?.[0];
      return coordinate &&
        isFiniteCoordinate(coordinate[0]) &&
        isFiniteCoordinate(coordinate[1])
        ? [coordinate[0], coordinate[1]]
        : null;
    }
    case 'GeometryCollection':
      for (const child of geometry.geometries) {
        const coordinate = firstCoordinate(child);
        if (coordinate) return coordinate;
      }
      return null;
  }
}

export function CaseEvidenceMap({
  evidence,
  observations,
  alerts,
  tracks,
}: CaseEvidenceMapProps) {
  const featureCollection = useMemo<
    FeatureCollection<Geometry, GeoJsonProperties>
  >(() => {
    const observationById = new Map(
      observations.map((observation) => [observation.localId, observation]),
    );
    const alertById = new Map(alerts.map((alert) => [alert.localId, alert]));
    const trackById = new Map(tracks.map((track) => [track.localId, track]));
    const features: Feature[] = [];

    for (const reference of evidence) {
      const feature = (() => {
        if (reference.sourceType === 'observation') {
          const observation = observationById.get(reference.sourceLocalId);
          return observation ? observationFeature(observation) : null;
        }
        if (reference.sourceType === 'alert') {
          const alert = alertById.get(reference.sourceLocalId);
          return alert ? alertFeature(alert) : null;
        }
        const track = trackById.get(reference.sourceLocalId);
        return track ? trackFeature(track) : null;
      })();
      if (feature) features.push(feature);
    }

    return { type: 'FeatureCollection', features };
  }, [alerts, evidence, observations, tracks]);

  const initialViewState = (() => {
    for (const feature of featureCollection.features) {
      const coordinate = feature.geometry
        ? firstCoordinate(feature.geometry)
        : null;
      if (coordinate) {
        return { longitude: coordinate[0], latitude: coordinate[1], zoom: 10 };
      }
    }
    return { longitude: -60, latitude: -3, zoom: 4 };
  })();

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
