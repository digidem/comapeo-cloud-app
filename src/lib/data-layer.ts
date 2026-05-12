import type { FeatureCollection, Geometry, Point } from 'geojson';
import JSZip from 'jszip';

import { extractPoints } from '@/lib/area-calculator/calculator';
import {
  createAttachment,
  createAlert as repoCreateAlert,
  createObservation as repoCreateObservation,
  createProject as repoCreateProject,
  deleteProject as repoDeleteProject,
  getAlerts as repoGetAlerts,
  getObservations as repoGetObservations,
  getProjects as repoGetProjects,
  updateProject as repoUpdateProject,
} from '@/lib/local-repositories';
import { syncRemoteArchive as doSync } from '@/lib/sync';
import { useAuthStore } from '@/stores/auth-store';

// Re-export types from db
export type { Alert, Attachment, Observation, Project } from '@/lib/db';

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function createProject(input: { name?: string; serverUrl?: string }) {
  return repoCreateProject(input);
}

export async function getProjects() {
  return repoGetProjects();
}

export async function updateProject(
  localId: string,
  updates: { name?: string },
) {
  return repoUpdateProject(localId, updates);
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

export async function createAlert(input: { projectLocalId: string }) {
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
}) {
  return createAttachment(input);
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
