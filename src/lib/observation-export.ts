import type { Feature, FeatureCollection, Point } from 'geojson';

import type { Observation } from '@/lib/data-layer';

export type ExportFormat = 'geojson' | 'csv';

// ---------------------------------------------------------------------------
// Coord validation (mirrors data-layer.ts)
// ---------------------------------------------------------------------------

function isValidCoord(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

// ---------------------------------------------------------------------------
// Slugify
// ---------------------------------------------------------------------------

export function slugifyProjectName(name: string | undefined): string {
  if (!name) return 'project';
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'project';
}

// ---------------------------------------------------------------------------
// Filename builder
// ---------------------------------------------------------------------------

export function buildExportFilename(
  name: string | undefined,
  format: ExportFormat,
  date?: Date,
): string {
  const slug = slugifyProjectName(name);
  const d = date ?? new Date();
  const dateStr = d.toISOString().slice(0, 10);
  return `${slug}-observations-${dateStr}.${format}`;
}

// ---------------------------------------------------------------------------
// GeoJSON serializer
// ---------------------------------------------------------------------------

export function observationsToGeoJson(
  observations: Observation[],
): FeatureCollection {
  const features: Array<Feature<Point | null>> = observations.map((obs) => {
    const hasValidCoords =
      obs.lat !== undefined &&
      obs.lon !== undefined &&
      isValidCoord(obs.lat, obs.lon);

    return {
      type: 'Feature' as const,
      geometry: hasValidCoords
        ? { type: 'Point' as const, coordinates: [obs.lon!, obs.lat!] }
        : null,
      properties: {
        ...(obs.tags ?? {}),
        docId: obs.localId,
        createdAt: obs.createdAt,
        updatedAt: obs.updatedAt,
      },
    };
  });

  return {
    type: 'FeatureCollection',
    features: features as FeatureCollection['features'],
  };
}

// ---------------------------------------------------------------------------
// CSV serializer (RFC 4180)
// ---------------------------------------------------------------------------

const CSV_COLUMNS = [
  'docId',
  'category',
  'lat',
  'lon',
  'createdAt',
  'updatedAt',
  'tags',
  'photoUrls',
] as const;

function csvEscape(value: string): string {
  // Prevent CSV formula injection: prefix cells starting with =, +, -, @
  if (/^[=+\-@]/.test(value)) {
    value = "'" + value;
  }
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function observationsToCsv(observations: Observation[]): string {
  const header = CSV_COLUMNS.join(',');
  if (observations.length === 0) return header;

  const rows = observations.map((obs) => {
    const tags = obs.tags ?? {};
    const photoUrls = tags.photoUrls ?? '';
    const category = tags.category ?? '';

    const hasValidCoords =
      obs.lat !== undefined &&
      obs.lon !== undefined &&
      isValidCoord(obs.lat, obs.lon);

    const values: string[] = [
      csvEscape(obs.localId),
      csvEscape(category),
      hasValidCoords ? String(obs.lat) : '',
      hasValidCoords ? String(obs.lon) : '',
      csvEscape(obs.createdAt),
      csvEscape(obs.updatedAt),
      csvEscape(JSON.stringify(tags)),
      csvEscape(photoUrls),
    ];

    return values.join(',');
  });

  return [header, ...rows].join('\n');
}
