import type { Feature, FeatureCollection, Point } from 'geojson';

import { isValidCoord } from '@/lib/coords';
import type { Attachment, Field, FieldOption, Observation } from '@/lib/db';

export type ExportFormat = 'geojson' | 'csv';

export interface ObservationExportContext {
  attachmentsByObservationId?: Map<string, Attachment[]>;
  displayNamesByObservationId?: Map<string, string>;
  fieldsByKey?: Map<string, Field>;
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
  context: ObservationExportContext = {},
): FeatureCollection {
  const features: Array<Feature<Point | null>> = observations.map((obs) => {
    const hasValidCoords =
      obs.lat !== undefined &&
      obs.lon !== undefined &&
      isValidCoord(obs.lat, obs.lon);

    const tags = buildExportTags(obs, context);

    return {
      type: 'Feature' as const,
      geometry: hasValidCoords
        ? { type: 'Point' as const, coordinates: [obs.lon!, obs.lat!] }
        : null,
      properties: {
        ...tags,
        docId: obs.localId,
        remoteId: obs.remoteId,
        category:
          context.displayNamesByObservationId?.get(obs.localId) ??
          tags.category,
        presetRefDocId: obs.presetRefDocId ?? tags.presetRefDocId,
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
  // (including when preceded by whitespace, which Excel and Sheets also interpret)
  if (/^\s*[=+\-@]/.test(value)) {
    value = "'" + value;
  }
  if (
    value.includes(',') ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function observationsToCsv(
  observations: Observation[],
  context: ObservationExportContext = {},
): string {
  return observationsToCsvWithContext(observations, context);
}

export function observationsToCsvWithContext(
  observations: Observation[],
  context: ObservationExportContext = {},
): string {
  const header = CSV_COLUMNS.join(',');
  if (observations.length === 0) return header;

  const rows = observations.map((obs) => {
    const tags = buildExportTags(obs, context);
    const photoUrls = tags.photoUrls ?? '';
    const category =
      context.displayNamesByObservationId?.get(obs.localId) ??
      tags.category ??
      '';

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

function buildExportTags(
  observation: Observation,
  context: ObservationExportContext,
): Record<string, string> {
  const tags = { ...(observation.tags ?? {}) };
  const attachments = context.attachmentsByObservationId?.get(
    observation.localId,
  );

  if (observation.presetRefDocId && !tags.presetRefDocId) {
    tags.presetRefDocId = observation.presetRefDocId;
  }

  if (attachments && attachments.length > 0) {
    const photoUrls = attachments
      .filter((attachment) => attachment.mediaType === 'photo')
      .map((attachment) => attachment.resolvedUrl ?? attachment.remoteUrl)
      .filter(
        (url): url is string => typeof url === 'string' && url.length > 0,
      );
    const audioCount = attachments.filter(
      (attachment) => attachment.mediaType === 'audio',
    ).length;

    if (photoUrls.length > 0) {
      tags.photoCount = String(photoUrls.length);
      tags.photoUrls = photoUrls.join(',');
    }
    if (audioCount > 0) {
      tags.audioCount = String(audioCount);
    }
  }

  if (context.fieldsByKey) {
    for (const [key, value] of Object.entries(observation.tags ?? {})) {
      const field: Field | undefined = context.fieldsByKey.get(key);
      if (!field) continue;
      const labelKey = field.label || key;
      const optionLabel = field.options?.find(
        (option: FieldOption) => option.value === value,
      )?.label;
      tags[labelKey] = optionLabel ?? value;
    }
  }

  return tags;
}
