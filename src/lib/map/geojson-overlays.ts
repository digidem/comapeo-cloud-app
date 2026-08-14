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

export type GeoJsonOverlayErrorCode =
  | 'invalid'
  | 'invalid-polygon-ring'
  | 'read'
  | 'too-large'
  | 'unsupported'
  | 'unsupported-file';

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

type JsonRecord = Record<string, unknown>;

const MAX_GEOJSON_GEOMETRY_DEPTH = 64;

function invalidGeoJson(): never {
  throw new GeoJsonOverlayError('invalid', 'This file is not valid GeoJSON.');
}

function invalidPolygonRing(): never {
  throw new GeoJsonOverlayError(
    'invalid-polygon-ring',
    'Polygon rings must contain at least four positions and be closed.',
  );
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

function validatePolygonCoordinates(
  value: unknown,
): asserts value is Position[][] {
  if (!Array.isArray(value) || value.length === 0) invalidGeoJson();
  if (!value.every((ring) => isLinearRing(ring))) invalidPolygonRing();
}

function validateGeometry(value: unknown): Geometry {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || current.depth > MAX_GEOJSON_GEOMETRY_DEPTH) {
      invalidGeoJson();
    }

    const candidate = current.value;
    if (!isRecord(candidate) || typeof candidate.type !== 'string') {
      invalidGeoJson();
    }

    switch (candidate.type) {
      case 'Point':
        if (!isPosition(candidate.coordinates)) invalidGeoJson();
        break;
      case 'MultiPoint':
        if (
          !Array.isArray(candidate.coordinates) ||
          candidate.coordinates.length === 0 ||
          !candidate.coordinates.every((position) => isPosition(position))
        ) {
          invalidGeoJson();
        }
        break;
      case 'LineString':
        if (!isLineCoordinates(candidate.coordinates)) invalidGeoJson();
        break;
      case 'MultiLineString':
        if (
          !Array.isArray(candidate.coordinates) ||
          candidate.coordinates.length === 0 ||
          !candidate.coordinates.every((line) => isLineCoordinates(line))
        ) {
          invalidGeoJson();
        }
        break;
      case 'Polygon':
        validatePolygonCoordinates(candidate.coordinates);
        break;
      case 'MultiPolygon':
        if (
          !Array.isArray(candidate.coordinates) ||
          candidate.coordinates.length === 0
        ) {
          invalidGeoJson();
        }
        candidate.coordinates.forEach((polygon) =>
          validatePolygonCoordinates(polygon),
        );
        break;
      case 'GeometryCollection':
        if (!Array.isArray(candidate.geometries)) invalidGeoJson();
        for (
          let index = candidate.geometries.length - 1;
          index >= 0;
          index -= 1
        ) {
          stack.push({
            value: candidate.geometries[index],
            depth: current.depth + 1,
          });
        }
        break;
      default:
        invalidGeoJson();
    }
  }

  return value as Geometry;
}

function normalizeGeometry(
  geometry: Geometry,
  properties: GeoJsonProperties,
  id?: string | number,
): Array<Feature<Geometry, GeoJsonProperties>> {
  const features: Array<Feature<Geometry, GeoJsonProperties>> = [];
  const stack: Geometry[] = [geometry];
  const deriveChildIds =
    geometry.type === 'GeometryCollection' && id !== undefined;
  let childIndex = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    if (current.type === 'GeometryCollection') {
      for (let index = current.geometries.length - 1; index >= 0; index -= 1) {
        const member = current.geometries[index];
        if (member) stack.push(member);
      }
      continue;
    }

    let featureId = id;
    if (id !== undefined && deriveChildIds) {
      featureId = `${id}:${childIndex}`;
    }
    features.push({
      type: 'Feature',
      properties,
      geometry: current,
      ...(featureId === undefined ? {} : { id: featureId }),
    });
    childIndex += 1;
  }

  return features;
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
  const lowerName = file.name.toLowerCase();
  const supportedFileType =
    lowerName.endsWith('.geojson') ||
    lowerName.endsWith('.json') ||
    file.type === 'application/geo+json' ||
    file.type === 'application/json';
  if (!supportedFileType) {
    throw new GeoJsonOverlayError(
      'unsupported-file',
      'Choose a GeoJSON or JSON file.',
    );
  }

  if (file.size > MAX_GEOJSON_OVERLAY_BYTES) {
    throw new GeoJsonOverlayError(
      'too-large',
      'GeoJSON reference files must be 5 MB or smaller.',
    );
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    throw new GeoJsonOverlayError('read', 'Could not read this GeoJSON file.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new GeoJsonOverlayError('invalid', 'This file is not valid GeoJSON.');
  }

  return normalizeGeoJson(parsed);
}
