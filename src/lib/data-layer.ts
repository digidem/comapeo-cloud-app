import type { FeatureCollection, Geometry, Point } from 'geojson';
import JSZip from 'jszip';

import { extractPoints } from '@/lib/area-calculator/calculator';
import { isValidCoord } from '@/lib/coords';
import {
  createAttachment,
  createAlert as repoCreateAlert,
  createObservation as repoCreateObservation,
  createProject as repoCreateProject,
  deleteProject as repoDeleteProject,
  getAlerts as repoGetAlerts,
<<<<<<< HEAD
=======
  getAttachments as repoGetAttachments,
>>>>>>> b87357d (feat(sync): add archive data tables)
  getFields as repoGetFields,
  getObservations as repoGetObservations,
  getPresets as repoGetPresets,
  getProjects as repoGetProjects,
  getTracks as repoGetTracks,
  updateProject as repoUpdateProject,
} from '@/lib/local-repositories';
import {
  getLegacyDisplayName,
  matchObservationToPreset,
} from '@/lib/preset-utils';
import { syncRemoteArchive as doSync } from '@/lib/sync';
import { useAuthStore } from '@/stores/auth-store';

// Re-export types from db
export type {
  Alert,
  Attachment,
  Field,
  Observation,
  Preset,
  Project,
  Track,
} from '@/lib/db';

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function createProject(input: {
  name?: string;
  description?: string;
  serverUrl?: string;
}) {
  return repoCreateProject(input);
}

export async function getProjects() {
  return repoGetProjects();
}

export async function updateProject(
  localId: string,
  updates: { name?: string; description?: string; serverUrl?: string | null },
) {
  const { serverUrl, ...rest } = updates;
  return repoUpdateProject(localId, {
    ...rest,
    ...(serverUrl !== undefined && { serverUrl: serverUrl ?? undefined }),
  });
}

export async function deleteProject(localId: string) {
  return repoDeleteProject(localId);
}

// ---------------------------------------------------------------------------
// Observations
// ---------------------------------------------------------------------------

export async function createObservation(input: {
  projectLocalId: string;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
}) {
  return repoCreateObservation(input);
}

export async function getObservations(projectLocalId: string) {
  return repoGetObservations(projectLocalId);
}

export async function getProjectPoints(
  projectLocalId: string,
): Promise<FeatureCollection<Point>> {
  const observations = await repoGetObservations(projectLocalId);
  const features = observations
    .filter(
      (o) =>
        o.lat !== undefined &&
        o.lon !== undefined &&
        isValidCoord(o.lat, o.lon),
    )
    .map((o) => ({
      type: 'Feature' as const,
      properties: { localId: o.localId },
      geometry: {
        type: 'Point' as const,
        coordinates: [o.lon!, o.lat!],
      },
    }));

  return {
    type: 'FeatureCollection',
    features,
  };
}

function countPointGeometries(value: unknown): number {
  const geometry = value as Partial<Geometry> | null;
  if (!geometry) return 0;

  if (geometry.type === 'Point') return 1;

  if (geometry.type === 'MultiPoint' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.length;
  }

  return 0;
}

function countGeoJsonPointCandidates(value: unknown): number {
  if (!value || typeof value !== 'object') return 0;

  const geojson = value as {
    type?: unknown;
    features?: unknown;
    geometry?: unknown;
  };

  if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
    return geojson.features.reduce(
      (sum, feature) =>
        sum +
        (feature && typeof feature === 'object'
          ? countPointGeometries(
              (feature as { geometry?: unknown }).geometry ?? null,
            )
          : 0),
      0,
    );
  }

  if (geojson.type === 'Feature') {
    return countPointGeometries(geojson.geometry);
  }

  return countPointGeometries(value);
}

export async function importGeoJsonPoints(
  projectLocalId: string,
  file: File,
): Promise<{ imported: number; skipped: number }> {
  let geojsonText: string;

  if (file.name.toLowerCase().endsWith('.zip')) {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(await file.arrayBuffer());
    } catch {
      return { imported: 0, skipped: 0 };
    }
    const geojsonFile = Object.values(zip.files).find((f) => {
      const lower = f.name.toLowerCase();
      return lower.endsWith('.geojson') || lower.endsWith('.json');
    });
    if (!geojsonFile) {
      return { imported: 0, skipped: 0 };
    }
    geojsonText = await geojsonFile.async('text');
  } else {
    geojsonText = await file.text();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(geojsonText);
  } catch {
    return { imported: 0, skipped: 0 };
  }
  const points = extractPoints(parsed);
  const candidateCount = countGeoJsonPointCandidates(parsed);

  let imported = 0;

  for (const point of points) {
    const [lon, lat] = point.geometry.coordinates as [number, number];
    await repoCreateObservation({ projectLocalId, lat, lon });
    imported++;
  }

  return { imported, skipped: Math.max(0, candidateCount - imported) };
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export async function createAlert(input: {
  projectLocalId: string;
  geometry?: { type: string; coordinates: unknown };
  metadata?: Record<string, unknown>;
  detectionDateStart?: string;
  detectionDateEnd?: string;
}) {
  return repoCreateAlert(input);
}

export async function getAlerts(projectLocalId: string) {
  return repoGetAlerts(projectLocalId);
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export async function addAttachment(input: {
  projectLocalId: string;
  observationLocalId: string;
  sourceDocId?: string;
  remoteUrl?: string;
  resolvedUrl?: string;
  mediaType?: 'photo' | 'audio' | 'unknown';
  contentType?: string;
  downloadStatus?: 'remote-only' | 'available' | 'failed';
}) {
  return createAttachment(input);
}

export async function getAttachments(observationLocalId: string) {
  return repoGetAttachments(observationLocalId);
}

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------

export async function getTracks(projectLocalId: string) {
  return repoGetTracks(projectLocalId);
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

export async function getFields(projectLocalId: string) {
  return repoGetFields(projectLocalId);
}

// ---------------------------------------------------------------------------
// Sync status
// ---------------------------------------------------------------------------

export function getSyncStatus(): {
  isSyncing: boolean;
  lastSyncedAt: string | null;
  errors: string[];
} {
  const { servers } = useAuthStore.getState();
  const syncing = servers.some((s) => s.status === 'syncing');
  const lastSynced =
    servers
      .filter((s) => s.lastSyncedAt)
      .sort((a, b) =>
        (b.lastSyncedAt ?? '').localeCompare(a.lastSyncedAt ?? ''),
      )[0]?.lastSyncedAt ?? null;
  const errors = servers
    .filter((s) => s.status === 'error' && s.errorMessage)
    .map((s) => s.errorMessage!);
  return {
    isSyncing: syncing,
    lastSyncedAt: lastSynced,
    errors,
  };
}

export async function syncRemoteArchive(
  serverId: string,
  options: { baseUrl: string; token: string; serverLabel?: string },
): Promise<{ success: boolean; error?: string }> {
  return doSync(serverId, options);
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export async function getPresets(projectLocalId: string) {
  return repoGetPresets(projectLocalId);
}

/**
 * Build a lookup map from preset remoteId to Preset for efficient matching.
 */
export async function getPresetLookupMap(
  projectLocalId: string,
): Promise<Map<string, import('@/lib/db').Preset>> {
  const presets = await repoGetPresets(projectLocalId);
  const map = new Map<string, import('@/lib/db').Preset>();
  for (const p of presets) {
    if (p.remoteId) map.set(p.remoteId, p);
  }
  return map;
}

/**
 * Resolve the display name for an observation using its matched preset.
 * Falls back to 'Observation'.
 */
export async function getObservationDisplayName(
  observation: import('@/lib/db').Observation,
  projectLocalId: string,
): Promise<string> {
  const presets = await repoGetPresets(projectLocalId);
  const preset = matchObservationToPreset(observation, presets);
  if (preset) return preset.name;
  return getLegacyDisplayName(observation.tags) ?? 'Observation';
}

export async function getTracks(projectLocalId: string) {
  return repoGetTracks(projectLocalId);
}

export async function getFields(projectLocalId: string) {
  return repoGetFields(projectLocalId);
}
