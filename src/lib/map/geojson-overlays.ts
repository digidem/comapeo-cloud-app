import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
  Position,
} from 'geojson';

/**
 * Keep main-thread JSON parsing bounded on mobile-class browsers. Five MiB is
 * large enough for territory/reference layers while avoiding arbitrarily large
 * synchronous JSON.parse() work and the much larger in-memory object graph it
 * creates.
 */
export const MAX_GEOJSON_OVERLAY_BYTES = 5 * 1024 * 1024;

export type GeoJsonOverlayErrorCode = 'invalid' | 'too-large' | 'unsupported';

export class GeoJsonOverlayError extends Error {
  readonly code: GeoJsonOverlayErrorCode;

  constructor(code: GeoJsonOverlayErrorCode, message: string) {
    super(message);
    this.name = 'GeoJsonOverlayError';
    this.code = code;
  }
}

export interface GeoJsonOverlay {
  id: string;
  name: string;
  data: FeatureCollection<Geometry, GeoJsonProperties>;
  visible: boolean;
}

export interface GeoJsonGeometryFamilies {
  points: FeatureCollection<Geometry, GeoJsonProperties>;
  lines: FeatureCollection<Geometry, GeoJsonProperties>;
  polygons: FeatureCollection<Geometry, GeoJsonProperties>;
}

type JsonRecord = Record<string, unknown>;

function invalidGeoJson(): never {
  throw new GeoJsonOverlayError('invalid', 'This file is not valid GeoJSON.');
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPosition(value: unknown): value is Position {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.every((coordinate) =>
      typeof coordinate === 'number' ? Number.isFinite(coordinate) : false,
    )
  );
}

function isLineCoordinates(value: unknown): value is Position[] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.every((position) => isPosition(position))
  );
}

function positionsEqual(a: Position, b: Position): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function isLinearRing(value: unknown): value is Position[] {
  if (!Array.isArray(value) || value.length < 4) return false;
  if (!value.every((position) => isPosition(position))) return false;
  const first = value[0];
  const last = value.at(-1);
  return Boolean(first && last && positionsEqual(first, last));
}

function isPolygonCoordinates(value: unknown): value is Position[][] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((ring) => isLinearRing(ring))
  );
}

function validateGeometry(value: unknown): Geometry {
  if (!isRecord(value) || typeof value.type !== 'string') invalidGeoJson();

  switch (value.type) {
    case 'Point':
      if (!isPosition(value.coordinates)) invalidGeoJson();
      return value as unknown as Geometry;
    case 'MultiPoint':
      if (
        !Array.isArray(value.coordinates) ||
        value.coordinates.length === 0 ||
        !value.coordinates.every((position) => isPosition(position))
      ) {
        invalidGeoJson();
      }
      return value as unknown as Geometry;
    case 'LineString':
      if (!isLineCoordinates(value.coordinates)) invalidGeoJson();
      return value as unknown as Geometry;
    case 'MultiLineString':
      if (
        !Array.isArray(value.coordinates) ||
        value.coordinates.length === 0 ||
        !value.coordinates.every((line) => isLineCoordinates(line))
      ) {
        invalidGeoJson();
      }
      return value as unknown as Geometry;
    case 'Polygon':
      if (!isPolygonCoordinates(value.coordinates)) invalidGeoJson();
      return value as unknown as Geometry;
    case 'MultiPolygon':
      if (
        !Array.isArray(value.coordinates) ||
        value.coordinates.length === 0 ||
        !value.coordinates.every((polygon) => isPolygonCoordinates(polygon))
      ) {
        invalidGeoJson();
      }
      return value as unknown as Geometry;
    case 'GeometryCollection':
      if (!Array.isArray(value.geometries)) invalidGeoJson();
      value.geometries.forEach((geometry) => validateGeometry(geometry));
      return value as unknown as Geometry;
    default:
      invalidGeoJson();
  }
}

function normalizeGeometry(
  geometry: Geometry,
  properties: GeoJsonProperties,
  id?: string | number,
): Array<Feature<Geometry, GeoJsonProperties>> {
  if (geometry.type === 'GeometryCollection') {
    return geometry.geometries.flatMap((member) =>
      normalizeGeometry(member, properties, id),
    );
  }

  return [
    {
      type: 'Feature',
      properties,
      geometry,
      ...(id === undefined ? {} : { id }),
    },
  ];
}

function normalizeFeature(
  value: unknown,
): Array<Feature<Geometry, GeoJsonProperties>> {
  if (!isRecord(value) || value.type !== 'Feature') invalidGeoJson();

  const properties = value.properties;
  if (
    properties !== undefined &&
    properties !== null &&
    !isRecord(properties)
  ) {
    invalidGeoJson();
  }

  const id = value.id;
  if (id !== undefined && typeof id !== 'string' && typeof id !== 'number') {
    invalidGeoJson();
  }

  if (value.geometry === null) return [];
  if (value.geometry === undefined) invalidGeoJson();

  const geometry = validateGeometry(value.geometry);
  return normalizeGeometry(
    geometry,
    (properties ?? null) as GeoJsonProperties,
    id,
  );
}

export function normalizeGeoJson(
  value: unknown,
): FeatureCollection<Geometry, GeoJsonProperties> {
  if (!isRecord(value) || typeof value.type !== 'string') invalidGeoJson();

  let features: Array<Feature<Geometry, GeoJsonProperties>>;

  if (value.type === 'FeatureCollection') {
    if (!Array.isArray(value.features)) invalidGeoJson();
    features = value.features.flatMap((feature) => normalizeFeature(feature));
  } else if (value.type === 'Feature') {
    features = normalizeFeature(value);
  } else {
    const geometry = validateGeometry(value);
    features = normalizeGeometry(geometry, null);
  }

  if (features.length === 0) {
    throw new GeoJsonOverlayError(
      'unsupported',
      'This GeoJSON has no supported geometry to display.',
    );
  }

  return { type: 'FeatureCollection', features };
}

export async function readGeoJsonOverlayFile(
  file: File,
): Promise<FeatureCollection<Geometry, GeoJsonProperties>> {
  if (file.size > MAX_GEOJSON_OVERLAY_BYTES) {
    throw new GeoJsonOverlayError(
      'too-large',
      'GeoJSON reference files must be 5 MB or smaller.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text()) as unknown;
  } catch {
    throw new GeoJsonOverlayError('invalid', 'This file is not valid GeoJSON.');
  }

  return normalizeGeoJson(parsed);
}

function featureCollection(
  features: Array<Feature<Geometry, GeoJsonProperties>>,
): FeatureCollection<Geometry, GeoJsonProperties> {
  return { type: 'FeatureCollection', features };
}

export function splitGeoJsonByGeometryFamily(
  data: FeatureCollection<Geometry, GeoJsonProperties>,
): GeoJsonGeometryFamilies {
  const points: Array<Feature<Geometry, GeoJsonProperties>> = [];
  const lines: Array<Feature<Geometry, GeoJsonProperties>> = [];
  const polygons: Array<Feature<Geometry, GeoJsonProperties>> = [];

  for (const feature of data.features) {
    switch (feature.geometry.type) {
      case 'Point':
      case 'MultiPoint':
        points.push(feature);
        break;
      case 'LineString':
      case 'MultiLineString':
        lines.push(feature);
        break;
      case 'Polygon':
      case 'MultiPolygon':
        polygons.push(feature);
        break;
      case 'GeometryCollection':
        // normalizeGeoJson() flattens these before data reaches this function.
        break;
    }
  }

  return {
    points: featureCollection(points),
    lines: featureCollection(lines),
    polygons: featureCollection(polygons),
  };
}
