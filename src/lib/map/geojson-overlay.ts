/**
 * GeoJSON reference overlay utilities for the map authoring screen.
 *
 * Overlays are authoring aids only — they are never persisted into `SavedMap`
 * and are cleared when the authoring screen unmounts.
 *
 * Validation strategy:
 * We explicitly validate the GeoJSON top-level `type` against the supported
 * geometry families (Point/MultiPoint, LineString/MultiLineString,
 * Polygon/MultiPolygon) plus `Feature` and `FeatureCollection`. We deliberately
 * do **not** use `turf.area()` as a generic validity check because valid point
 * and line geometries have no polygon-area semantics — an area-based check
 * would reject perfectly valid reference markers and routes.
 */
import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
} from 'geojson';

/**
 * Maximum file size accepted for a single overlay.
 *
 * Chosen conservatively at 10 MiB to keep main-thread JSON parsing and
 * MapLibre source ingestion responsive on low-end mobile devices. Larger
 * reference datasets should be simplified before import. The threshold is
 * enforced **before** any `JSON.parse` runs on the main thread.
 */
export const MAX_OVERLAY_FILE_SIZE = 10 * 1024 * 1024; // 10 MiB

const SUPPORTED_GEOMETRY_TYPES = new Set<Geometry['type']>([
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
]);

const SUPPORTED_ROOT_TYPES = new Set([
  'FeatureCollection',
  'Feature',
  ...SUPPORTED_GEOMETRY_TYPES,
]);

/**
 * Discriminated union describing why an overlay could not be parsed.
 * Each `kind` maps to a user-visible i18n message.
 */
export type GeoJsonOverlayErrorKind =
  'too-large' | 'invalid-json' | 'invalid-geojson';

export interface GeoJsonOverlayError {
  kind: GeoJsonOverlayErrorKind;
  message: string;
}

/**
 * Read a `File` and return a validated, normalised FeatureCollection ready
 * to feed into a MapLibre GeoJSON source.
 *
 * Throws a {@link GeoJsonOverlayError} for any unsupported or malformed input.
 * On error no partial state is produced — the caller adds nothing.
 */
export async function parseGeoJsonOverlay(
  file: File,
): Promise<FeatureCollection> {
  if (file.size > MAX_OVERLAY_FILE_SIZE) {
    throw {
      kind: 'too-large',
      message: `File is ${file.size} bytes, exceeds ${MAX_OVERLAY_FILE_SIZE}`,
    } satisfies GeoJsonOverlayError;
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    throw {
      kind: 'invalid-json',
      message: 'Could not read file contents',
    } satisfies GeoJsonOverlayError;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw {
      kind: 'invalid-json',
      message: 'File is not valid JSON',
    } satisfies GeoJsonOverlayError;
  }

  return normaliseGeoJson(parsed);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSupportedGeometry(value: unknown): value is Geometry {
  return (
    isPlainObject(value) &&
    typeof value.type === 'string' &&
    SUPPORTED_GEOMETRY_TYPES.has(value.type as Geometry['type']) &&
    Array.isArray(value.coordinates)
  );
}

/**
 * Normalise any supported GeoJSON root into a FeatureCollection whose
 * features all carry a supported geometry. Features with null or unsupported
 * geometries (e.g. GeometryCollection) are skipped.
 */
export function normaliseGeoJson(input: unknown): FeatureCollection {
  if (!isPlainObject(input) || typeof input.type !== 'string') {
    throw {
      kind: 'invalid-geojson',
      message: 'Missing or invalid GeoJSON type',
    } satisfies GeoJsonOverlayError;
  }

  if (!SUPPORTED_ROOT_TYPES.has(input.type)) {
    throw {
      kind: 'invalid-geojson',
      message: `Unsupported GeoJSON type: ${input.type}`,
    } satisfies GeoJsonOverlayError;
  }

  if (input.type === 'FeatureCollection') {
    const features = Array.isArray(input.features) ? input.features : [];
    return {
      type: 'FeatureCollection',
      features: features
        .filter(
          (f): f is Feature =>
            isPlainObject(f) &&
            f.type === 'Feature' &&
            isSupportedGeometry(f.geometry),
        )
        .map((f) => ({
          type: 'Feature' as const,
          properties: (f.properties ?? null) as GeoJsonProperties,
          geometry: f.geometry,
        })),
    };
  }

  if (input.type === 'Feature') {
    const geometry = input.geometry;
    if (!isSupportedGeometry(geometry)) {
      throw {
        kind: 'invalid-geojson',
        message: 'Feature has unsupported geometry',
      } satisfies GeoJsonOverlayError;
    }
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: (input.properties ?? null) as GeoJsonProperties,
          geometry,
        },
      ],
    };
  }

  // Bare geometry root
  if (isSupportedGeometry(input)) {
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: null,
          geometry: input,
        },
      ],
    };
  }

  throw {
    kind: 'invalid-geojson',
    message: 'Unsupported GeoJSON geometry',
  } satisfies GeoJsonOverlayError;
}
