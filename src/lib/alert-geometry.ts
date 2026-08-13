import type { Feature, FeatureCollection, Geometry, Position } from 'geojson';

import type { Alert } from '@/lib/data-layer';

export interface AlertFeatureProperties {
  alertId: string;
}

export type AlertFeature = Feature<Geometry, AlertFeatureProperties>;
export type AlertFeatureCollection = FeatureCollection<
  Geometry,
  AlertFeatureProperties
>;

function isPosition(value: unknown): value is Position {
  if (!Array.isArray(value) || value.length < 2) return false;
  const [longitude, latitude] = value;
  return (
    typeof longitude === 'number' &&
    typeof latitude === 'number' &&
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    latitude >= -90 &&
    latitude <= 90
  );
}

function isLine(value: unknown): value is Position[] {
  return Array.isArray(value) && value.length >= 2 && value.every(isPosition);
}

function positionsEqual(first: Position, last: Position): boolean {
  return first[0] === last[0] && first[1] === last[1];
}

function isLinearRing(value: unknown): value is Position[] {
  if (!Array.isArray(value) || value.length < 4 || !value.every(isPosition)) {
    return false;
  }
  return positionsEqual(value[0]!, value[value.length - 1]!);
}

function isPolygonCoordinates(value: unknown): value is Position[][] {
  return Array.isArray(value) && value.length > 0 && value.every(isLinearRing);
}

export function parseAlertGeometry(value: Alert['geometry']): Geometry | null {
  if (!value) return null;

  switch (value.type) {
    case 'Point':
      return isPosition(value.coordinates)
        ? { type: 'Point', coordinates: value.coordinates }
        : null;
    case 'MultiPoint':
      return Array.isArray(value.coordinates) &&
        value.coordinates.length > 0 &&
        value.coordinates.every(isPosition)
        ? { type: 'MultiPoint', coordinates: value.coordinates }
        : null;
    case 'LineString':
      return isLine(value.coordinates)
        ? { type: 'LineString', coordinates: value.coordinates }
        : null;
    case 'MultiLineString':
      return Array.isArray(value.coordinates) &&
        value.coordinates.length > 0 &&
        value.coordinates.every(isLine)
        ? { type: 'MultiLineString', coordinates: value.coordinates }
        : null;
    case 'Polygon':
      return isPolygonCoordinates(value.coordinates)
        ? { type: 'Polygon', coordinates: value.coordinates }
        : null;
    case 'MultiPolygon':
      return Array.isArray(value.coordinates) &&
        value.coordinates.length > 0 &&
        value.coordinates.every(isPolygonCoordinates)
        ? { type: 'MultiPolygon', coordinates: value.coordinates }
        : null;
    default:
      return null;
  }
}

export function alertsToFeatureCollection(
  alerts: Alert[],
): AlertFeatureCollection {
  const features: AlertFeature[] = [];
  for (const alert of alerts) {
    const geometry = parseAlertGeometry(alert.geometry);
    if (!geometry) continue;
    features.push({
      type: 'Feature',
      properties: { alertId: alert.localId },
      geometry,
    });
  }
  return { type: 'FeatureCollection', features };
}

function visitPositions(value: unknown, visit: (position: Position) => void) {
  if (isPosition(value)) {
    visit(value);
    return;
  }
  if (!Array.isArray(value)) return;
  for (const child of value) visitPositions(child, visit);
}

export function getAlertGeometryBounds(
  collection: AlertFeatureCollection,
): [[number, number], [number, number]] | undefined {
  let minLongitude = Infinity;
  let minLatitude = Infinity;
  let maxLongitude = -Infinity;
  let maxLatitude = -Infinity;

  for (const feature of collection.features) {
    if (feature.geometry.type === 'GeometryCollection') continue;
    visitPositions(feature.geometry.coordinates, ([longitude, latitude]) => {
      minLongitude = Math.min(minLongitude, longitude!);
      minLatitude = Math.min(minLatitude, latitude!);
      maxLongitude = Math.max(maxLongitude, longitude!);
      maxLatitude = Math.max(maxLatitude, latitude!);
    });
  }

  if (!Number.isFinite(minLongitude)) return undefined;
  return [
    [minLongitude, minLatitude],
    [maxLongitude, maxLatitude],
  ];
}
