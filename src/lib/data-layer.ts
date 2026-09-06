import type { FeatureCollection, Geometry, Point } from 'geojson';
import JSZip from 'jszip';

import { apiClient } from '@/lib/api-client';
import { extractPoints } from '@/lib/area-calculator/calculator';
import { isValidCoord } from '@/lib/coords';
import type {
  Case,
  CaseActivity,
  CaseAgency,
  CaseReportState,
  CaseStatus,
  ReportBranding,
} from '@/lib/db';
import type { CaseUpdates } from '@/lib/local-repositories';
import {
  createAlert as repoCreateAlert,
  createAttachment as repoCreateAttachment,
  createCase as repoCreateCase,
  createObservation as repoCreateObservation,
  createProject as repoCreateProject,
  deleteCase as repoDeleteCase,
  deleteProject as repoDeleteProject,
  getAlerts as repoGetAlerts,
  getAttachmentsForProject as repoGetAttachmentsForProject,
  getCase as repoGetCase,
  getCaseActivity as repoGetCaseActivity,
  getCaseReportState as repoGetCaseReportState,
  getCaseReportStates as repoGetCaseReportStates,
  getCases as repoGetCases,
  getFields as repoGetFields,
  getObservations as repoGetObservations,
  getPresets as repoGetPresets,
  getProject as repoGetProject,
  getProjects as repoGetProjects,
  getTracks as repoGetTracks,
  recordCaseActivity as repoRecordCaseActivity,
  updateCase as repoUpdateCase,
  updateProject as repoUpdateProject,
  upsertCaseReportState as repoUpsertCaseReportState,
} from '@/lib/local-repositories';
import {
  getLegacyDisplayName,
  matchObservationToPreset,
} from '@/lib/preset-utils';
import { pullAlertsDetailed } from '@/lib/remote-archive';
import type { SyncOptions, SyncResult } from '@/lib/sync';
import { syncArchive } from '@/lib/sync-coordinator';
import { useAuthStore } from '@/stores/auth-store';

// Re-export types from db
export type {
  Alert,
  Attachment,
  Case,
  CaseActivity,
  CaseAgency,
  CaseReportState,
  CaseStatus,
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
  updates: {
    name?: string;
    description?: string;
    serverUrl?: string | null;
    reportBranding?: ReportBranding;
  },
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
  sourceId?: string;
}) {
  return repoCreateAlert(input);
}

export interface AlertToArchive {
  projectLocalId: string;
  geometry?: { type: string; coordinates: unknown };
  metadata?: Record<string, unknown>;
  detectionDateStart?: string;
  detectionDateEnd?: string;
  sourceId?: string;
}

/**
 * Resolved, archive-backed create target for the selected project.
 * Mirror of `CategoriesEditor`'s owning-server resolution: the project is
 * archive-backed when it carries a `remoteId` (server projectPublicId) and an
 * owning archive server with a token exists (keyed by `project.sourceId`).
 */
export interface ResolvedAlertArchiveTarget {
  projectLocalId: string;
  ownerServerId: string;
  config: { serverId: string; baseUrl: string; token: string };
  projectRemoteId: string;
}

export type AlertCreatePlan =
  { kind: 'local' } | { kind: 'archive'; target: ResolvedAlertArchiveTarget };

function sameGeometry(
  a: { type: string; coordinates: unknown } | undefined,
  b: unknown,
): boolean {
  if (a === undefined) return b === undefined;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Decide whether the project with `projectLocalId` is archive-backed (POST to
 * its owning archive) or a pure-local project (local DB write).
 */
export async function resolveAlertCreatePlan(
  projectLocalId: string,
): Promise<AlertCreatePlan> {
  const project = await repoGetProject(projectLocalId);
  if (!project) throw new TypeError('Unknown project');

  const projectRemoteId = project.remoteId ?? undefined;
  if (!projectRemoteId) return { kind: 'local' };

  const servers = useAuthStore.getState().servers;
  const owner = servers.find((s) => s.id === project.sourceId);
  if (!owner?.token) return { kind: 'local' };

  return {
    kind: 'archive',
    target: {
      projectLocalId,
      ownerServerId: owner.id,
      config: {
        serverId: owner.id,
        baseUrl: owner.baseUrl,
        token: owner.token,
      },
      projectRemoteId,
    },
  };
}

function matchesEcho(
  alert: import('@/lib/db').Alert,
  input: AlertToArchive,
): boolean {
  return (
    !alert.deleted &&
    alert.sourceType === 'remoteArchive' &&
    sameGeometry(alert.geometry, input.geometry) &&
    (alert.remoteSourceId ?? undefined) === (input.sourceId || undefined)
  );
}

// Build the archive POST body. `createAlertBodySchema` requires geometry,
// metadata, detectionDate{Start,End}, and sourceId. Form submits always carry
// geometry (the inline panel and standalone screen require a valid geometry
// before submitting) and resolved ISO dates, but guard the optionals here so
// the type is the schema's inferred input.
type ApiAlertBody = Parameters<typeof apiClient.createAlert>[1];

function apiClientBodyFrom(input: AlertToArchive): ApiAlertBody {
  if (!input.geometry) {
    throw new TypeError('Geometry is required to create an alert');
  }
  return {
    geometry: input.geometry,
    metadata: input.metadata ?? {},
    detectionDateStart: input.detectionDateStart ?? '',
    detectionDateEnd: input.detectionDateEnd ?? '',
    sourceId: input.sourceId ?? '',
  } as ApiAlertBody;
}

/**
 * Internal: archive POST then a bounded wait until the server-generated alert
 * is echoed into the selected project's local alert set. Because the archive
 * POST returns an empty 201 and the server mints the alert docId internally
 * (never returned), the only way to surface the canonical row is to re-fetch
 * the project's alert collection (`pullAlertsDetailed`) and confirm our
 * submission appears. No transient local-only row is written.
 */
const ECHO_ATTEMPTS = 5;
const ECHO_RETRY_MS = 250;

async function submitToArchive(
  target: ResolvedAlertArchiveTarget,
  input: AlertToArchive,
): Promise<void> {
  const body = apiClientBodyFrom(input);
  await apiClient.createAlert(target.projectRemoteId, body, target.config);
  for (let attempt = 0; attempt < ECHO_ATTEMPTS; attempt++) {
    // Re-fetch the archive's alert collection on every attempt so a briefly
    // not-yet-propagated POST is still confirmed as soon as the server echoes it.
    await pullAlertsDetailed(
      target.ownerServerId,
      target.projectRemoteId,
      target.projectLocalId,
      target.config,
    );
    const alerts = await repoGetAlerts(target.projectLocalId);
    if (alerts.some((alert) => matchesEcho(alert, input))) return;
    await new Promise((resolve) => setTimeout(resolve, ECHO_RETRY_MS));
  }
  throw new Error(
    'The alert was created on the archive but could not be confirmed yet.',
  );
}

export async function createAlertForProject(
  input: AlertToArchive,
): Promise<
  { kind: 'local'; alert: import('@/lib/db').Alert } | { kind: 'archive' }
> {
  const plan = await resolveAlertCreatePlan(input.projectLocalId);
  if (plan.kind === 'local') {
    const alert = await repoCreateAlert(input);
    return { kind: 'local', alert };
  }
  await submitToArchive(plan.target, input);
  return { kind: 'archive' };
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
  return repoCreateAttachment(input);
}

export async function getAttachmentsForProject(projectLocalId: string) {
  return repoGetAttachmentsForProject(projectLocalId);
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

export function syncRemoteArchive(
  serverId: string,
  options?: SyncOptions,
  control?: { isCancelled?: () => boolean },
): Promise<SyncResult> {
  return syncArchive(serverId, options, control);
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

// ---------------------------------------------------------------------------
// Cases (local-only foundation for #268 — no remote Case sync)
// ---------------------------------------------------------------------------

export async function createCase(input: {
  projectLocalId: string;
  title: string;
  caseType: Case['caseType'];
  status?: CaseStatus;
}) {
  return repoCreateCase(input);
}

export async function getCases(projectLocalId: string) {
  return repoGetCases(projectLocalId);
}

export async function getCase(projectLocalId: string, localId: string) {
  return repoGetCase(projectLocalId, localId);
}

export async function updateCase(
  projectLocalId: string,
  localId: string,
  updates: CaseUpdates,
) {
  return repoUpdateCase(projectLocalId, localId, updates);
}

export async function deleteCase(
  projectLocalId: string,
  localId: string,
): Promise<boolean> {
  return repoDeleteCase(projectLocalId, localId);
}

// ---------------------------------------------------------------------------
// Case activity (metadata-only)
// ---------------------------------------------------------------------------

export async function recordCaseActivity(input: {
  caseLocalId: string;
  projectLocalId: string;
  event: CaseActivity['event'];
  status?: CaseStatus;
  agency?: CaseAgency;
  count?: number;
}) {
  return repoRecordCaseActivity(input);
}

export async function getCaseActivity(
  projectLocalId: string,
  caseLocalId: string,
) {
  return repoGetCaseActivity(projectLocalId, caseLocalId);
}

// ---------------------------------------------------------------------------
// Per-agency report state (independent per agency)
// ---------------------------------------------------------------------------

export async function upsertCaseReportState(input: {
  caseLocalId: string;
  projectLocalId: string;
  agency: CaseAgency;
  status: CaseReportState['status'];
  count?: number;
  revision?: number;
}) {
  return repoUpsertCaseReportState(input);
}

export async function getCaseReportState(
  projectLocalId: string,
  caseLocalId: string,
  agency: CaseAgency,
) {
  return repoGetCaseReportState(projectLocalId, caseLocalId, agency);
}

export async function getCaseReportStates(
  projectLocalId: string,
  caseLocalId: string,
) {
  return repoGetCaseReportStates(projectLocalId, caseLocalId);
}
