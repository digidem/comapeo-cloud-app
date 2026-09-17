import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
} from 'geojson';

import type { Alert, Observation, Track } from '@/lib/data-layer';
import type { CaseEvidenceReference } from '@/lib/db';

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

export function buildCaseEvidenceFeatureCollection(input: {
  evidence: readonly CaseEvidenceReference[];
  observations: readonly Observation[];
  alerts: readonly Alert[];
  tracks: readonly Track[];
}): FeatureCollection<Geometry, GeoJsonProperties> {
  const observationById = new Map(
    input.observations.map((observation) => [observation.localId, observation]),
  );
  const alertById = new Map(
    input.alerts.map((alert) => [alert.localId, alert]),
  );
  const trackById = new Map(
    input.tracks.map((track) => [track.localId, track]),
  );
  const features: Feature[] = [];

  for (const reference of input.evidence) {
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
}

export function getCaseEvidenceInitialViewState(
  featureCollection: FeatureCollection<Geometry, GeoJsonProperties>,
) {
  for (const feature of featureCollection.features) {
    const coordinate = feature.geometry
      ? firstCoordinate(feature.geometry)
      : null;
    if (coordinate) {
      return { longitude: coordinate[0], latitude: coordinate[1], zoom: 10 };
    }
  }
  return { longitude: -60, latitude: -3, zoom: 4 };
}
