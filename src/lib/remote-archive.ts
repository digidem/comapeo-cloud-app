import type { Table, UpdateSpec } from 'dexie';

import { ApiError, apiClient } from '@/lib/api-client';
import type { EndpointSemantics, RequestConfig } from '@/lib/api-client';
import { normalizeArchiveBaseUrl } from '@/lib/archive-proxy';
import { buildIconUrl } from '@/lib/category-utils';
import { getCachedIconBlob, getDb, putCachedIconBlob } from '@/lib/db';
import type {
  Alert,
  Attachment,
  Field,
  Observation,
  Preset,
  Project,
  Track,
} from '@/lib/db';
import { getRemoteServer } from '@/lib/local-repositories';
import {
  type ReconciliationCounts,
  planReconciliation,
} from '@/lib/reconciliation';

export interface PullExecutionOptions {
  concurrency?: number;
}

export interface PullResult<T> {
  rows: T[];
  semantics: EndpointSemantics;
  counts: ReconciliationCounts;
  warnings: string[];
}

function resolvedSemantics(
  response: { semantics?: EndpointSemantics },
  resource: EndpointSemantics['resource'],
): EndpointSemantics {
  return (
    response.semantics ?? {
      resource,
      availability: 'supported',
      // Metadata can be absent in mocks or after a clone/serialization
      // boundary because it is attached non-enumerably for API compatibility.
      // Unknown provenance must preserve omissions rather than delete them.
      mode: 'unknown',
      source: 'contract',
    }
  );
}

function emptyCounts(preserved = 0): ReconciliationCounts {
  return {
    received: 0,
    upserted: 0,
    explicitTombstones: 0,
    omittedTombstones: 0,
    tombstoned: 0,
    preserved,
  };
}

function unsupportedResult<T>(
  semantics: EndpointSemantics,
  preserved = 0,
): PullResult<T> {
  return {
    rows: [],
    semantics,
    counts: emptyCounts(preserved),
    warnings: [`${semantics.resource} endpoint is unsupported by this archive`],
  };
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error || (error !== null && typeof error === 'object')) &&
    'name' in error &&
    error.name === 'AbortError'
  );
}

// ---------------------------------------------------------------------------
// Stable localId generation
// ---------------------------------------------------------------------------

/**
 * Generate a stable localId for a remote entity using the server's baseUrl
 * instead of its database ID. This ensures that even if duplicate server
 * records exist for the same URL, the same remote project/observation/alert
 * always maps to the same localId, preventing duplicates.
 *
 * Uses the same normalization as auth-store and AddArchiveServerDialog
 * for consistency across the dedup chain.
 */
function stableSourceKey(baseUrl: string): string {
  const result = normalizeArchiveBaseUrl(baseUrl);
  const key = result.ok ? result.value : baseUrl.trim().replace(/\/+$/, '');
  if (!key) {
    throw new Error(
      'remote-archive: cannot derive stable localId — server baseUrl is empty',
    );
  }
  return key;
}

// ---------------------------------------------------------------------------
// Attachment URL parsing
// ---------------------------------------------------------------------------

/**
 * Parse an attachment URL to extract the media type.
 * URL format: /projects/{projectId}/attachments/{driveId}/{type}/{name}
 * where {type} is "photo" or "audio".
 */
function parseAttachmentMediaType(url: string): 'photo' | 'audio' | 'unknown' {
  const match = url.match(/\/attachments\/[^/]+\/([^/]+)\/[^/]+$/);
  if (!match) return 'unknown';
  const type = match[1];
  if (type === 'photo') return 'photo';
  if (type === 'audio') return 'audio';
  return 'unknown';
}

function parseAttachmentPath(url: string):
  | {
      driveId?: string;
      type?: string;
      name?: string;
    }
  | undefined {
  const match = url.match(/\/attachments\/([^/]+)\/([^/]+)\/([^/?#]+)/);
  if (!match) return undefined;
  return {
    driveId: decodeURIComponent(match[1] ?? ''),
    type: decodeURIComponent(match[2] ?? ''),
    name: decodeURIComponent(match[3] ?? ''),
  };
}

/**
 * Build a stable per-attachment identity key that survives re-syncs and
 * server-side attachment removal. The localId is derived from the
 * addressable URL path (driveId/type/name) so removing one attachment in
 * the middle of a list does not shift the localIds of the others.
 */
function stableAttachmentSourceDocId(
  observationDocId: string,
  attachment: { driveId?: string; type?: string; name?: string; url: string },
  parsedPath: { driveId?: string; type?: string; name?: string } | undefined,
): string {
  const driveId = attachment.driveId ?? parsedPath?.driveId;
  const type = attachment.type ?? parsedPath?.type;
  const name = attachment.name ?? parsedPath?.name;
  if (driveId && type && name) {
    return `${observationDocId}:${driveId}:${type}:${name}`;
  }
  // Fallback to the raw URL when the path cannot be parsed (e.g. legacy
  // attachments served from a non-standard path).
  return `${observationDocId}:${attachment.url}`;
}

function resolveAttachmentUrl(url: string, archiveBaseUrl: string): string {
  try {
    return new URL(url, archiveBaseUrl).toString();
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Run a batch of promise-returning tasks with bounded concurrency. Each
 * task is invoked at most once, and results are returned in the original
 * order. Used by the per-project detail fetch in pullProjects to avoid
 * unbounded N+1 fan-out.
 */
async function allSettledLimited<T>(
  tasks: Array<() => Promise<T>>,
  limit = 5,
  signal?: AbortSignal,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let cursor = 0;

  async function worker() {
    while (cursor < tasks.length) {
      throwIfAborted(signal);
      const i = cursor++;
      try {
        results[i] = { status: 'fulfilled', value: await tasks[i]!() };
      } catch (reason) {
        if (isAbortError(reason) || signal?.aborted) throw abortError();
        results[i] = { status: 'rejected', reason };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(Math.max(limit, 1), tasks.length) }, worker),
  );
  return results;
}

async function tombstoneScopedRows<
  T extends {
    projectLocalId: string;
    sourceType: string;
    dirtyLocal: boolean;
    deleted: boolean;
    updatedAt: string;
  },
>(
  table: Table<T, string>,
  projectLocalIds: readonly string[],
  now: string,
): Promise<number> {
  if (projectLocalIds.length === 0) return 0;
  const rows = await table
    .where('projectLocalId')
    .anyOf(projectLocalIds)
    .and(
      (row) =>
        row.sourceType === 'remoteArchive' && !row.dirtyLocal && !row.deleted,
    )
    .toArray();
  if (rows.length === 0) return 0;
  for (const row of rows) {
    row.deleted = true;
    row.updatedAt = now;
  }
  await table.bulkPut(rows);
  return rows.length;
}

/**
 * Tombstone every clean remote-archive child of an omitted remote project.
 *
 * The caller owns the Dexie transaction so the project row and all dependent
 * rows commit or roll back together. Scoping by projectLocalId is intentional:
 * project identity is stable across legacy duplicate server records whose
 * sourceId may differ while their normalized archive URL is the same.
 */
async function tombstoneProjectChildren(
  projectLocalIds: readonly string[],
  now: string,
): Promise<number> {
  if (projectLocalIds.length === 0) return 0;
  const db = getDb();
  let count = 0;
  count += await tombstoneScopedRows(db.observations, projectLocalIds, now);
  count += await tombstoneScopedRows(db.attachments, projectLocalIds, now);
  count += await tombstoneScopedRows(db.alerts, projectLocalIds, now);
  count += await tombstoneScopedRows(db.presets, projectLocalIds, now);
  count += await tombstoneScopedRows(db.tracks, projectLocalIds, now);
  count += await tombstoneScopedRows(db.fields, projectLocalIds, now);
  return count;
}

async function projectIdsWithLocalChanges(
  projectLocalIds: readonly string[],
): Promise<Set<string>> {
  const protectedIds = new Set<string>();
  if (projectLocalIds.length === 0) return protectedIds;
  const db = getDb();
  const tables = [
    db.observations,
    db.attachments,
    db.alerts,
    db.presets,
    db.tracks,
    db.fields,
  ] as const;

  for (const table of tables) {
    const rows = await table
      .where('projectLocalId')
      .anyOf(projectLocalIds)
      .and(
        (row) =>
          !row.deleted &&
          (row.dirtyLocal || row.sourceType !== 'remoteArchive'),
      )
      .toArray();
    for (const row of rows) protectedIds.add(row.projectLocalId);
  }

  return protectedIds;
}

// ---------------------------------------------------------------------------
// Fetch archive data and store locally
// ---------------------------------------------------------------------------

export async function pullProjectsDetailed(
  serverId: string,
  config: RequestConfig,
  options: PullExecutionOptions = {},
): Promise<PullResult<Project>> {
  const response = await apiClient.getProjects(config);
  const semantics = resolvedSemantics(response, 'projects');
  const db = getDb();
  const sourceType = 'remoteArchive' as const;
  const warnings: string[] = [];

  // Look up the server record to get the archive's baseUrl.
  // Fall back to config.baseUrl if no record exists (e.g. during sync
  // before the server record is fully persisted).
  const serverRecord = await getRemoteServer(serverId);
  const baseUrl = serverRecord?.baseUrl ?? config.baseUrl ?? '';
  const stableKey = stableSourceKey(baseUrl);

  const archiveProjectPrefix = `${sourceType}:${stableKey}:`;
  const existingRecords = await db.projects
    .filter(
      (row) =>
        row.sourceType === sourceType &&
        row.localId.startsWith(archiveProjectPrefix),
    )
    .toArray();
  const existingMap = new Map(
    existingRecords.map((record) => [record.localId, record]),
  );

  const now = new Date().toISOString();
  const detailedProjects: Project[] = [];

  // Fetch detailed project information for each project with a concurrency
  // cap to avoid unbounded N+1 fan-out. Per-project detail failures must
  // NOT drop the basic project info — we keep the project with detail=null
  // and log a warning so the user can still see it in the project list.
  const projectDetails = await allSettledLimited(
    response.data.map((item) => async () => {
      const detailResponse = await apiClient.getProject(item.projectId, config);
      return { basic: item, detail: detailResponse.data };
    }),
    options.concurrency ?? 5,
    config.signal,
  );

  for (const [index, result] of projectDetails.entries()) {
    const basic = response.data[index]!;
    const localId = `${sourceType}:${stableKey}:${basic.projectId}`;
    const existing = existingMap.get(localId);

    if (result.status === 'rejected') {
      const warning = `Failed to fetch details for project ${basic.projectId}: ${String(result.reason)}`;
      warnings.push(warning);
      console.warn(warning);
      const nameChanged = existing?.name !== basic.name;
      detailedProjects.push({
        localId,
        sourceType,
        sourceId: serverId,
        remoteId: basic.projectId,
        name: basic.name,
        description: existing?.description,
        iconRef: existing?.iconRef,
        serverUrl: baseUrl || undefined,
        createdAt: existing?.createdAt ?? now,
        updatedAt: nameChanged ? now : (existing?.updatedAt ?? now),
        dirtyLocal: false,
        deleted: false,
      });
      continue;
    }

    const { detail } = result.value;
    const nameChanged = existing?.name !== basic.name;
    const descriptionChanged = existing?.description !== detail?.description;

    detailedProjects.push({
      localId,
      sourceType,
      sourceId: serverId,
      remoteId: basic.projectId,
      name: basic.name,
      description: detail?.description,
      serverUrl: baseUrl || undefined,
      iconRef: detail?.iconRef,
      createdAt: existing?.createdAt ?? now,
      updatedAt:
        nameChanged || descriptionChanged ? now : (existing?.updatedAt ?? now),
      dirtyLocal: false,
      deleted: false,
    });
  }

  // Persist. Existing rows get a PARTIAL update so this sync never overwrites
  // the local-only `activeMapId`: that field is written independently by
  // setActiveMap, which can land while the per-project detail fetches above
  // were still in flight. The `existing` snapshot was captured at the start of
  // the pull, BEFORE those fetches, so a full-row bulkPut would silently
  // clobber a selection made during the sync and revert the UI on the next
  // hydration. New rows have no prior selection to preserve, so they get a
  // full put (activeMapId stays undefined for a brand-new remote project).
  //
  // INVARIANT: `changes` (the spread of `project` minus `localId` and
  // `activeMapId`) must include ALL sync-managed Project fields — including
  // optional ones as `undefined` when absent — so the partial update is
  // semantically equivalent to a full replace of those fields. Any new
  // sync-managed field added to the Project type in the future must appear in
  // `detailedProjects` entries (and therefore in `changes`) or it will be
  // silently omitted from updates, leaving stale values in existing rows.
  const incomingProjectIds = new Set(
    detailedProjects.map((project) => project.localId),
  );
  const omittedProjectIds = existingRecords
    .filter(
      (project) => !project.deleted && !incomingProjectIds.has(project.localId),
    )
    .map((project) => project.localId);
  const protectedProjectIds =
    await projectIdsWithLocalChanges(omittedProjectIds);
  const reconciliation = planReconciliation({
    existing: existingRecords.map((project) =>
      protectedProjectIds.has(project.localId)
        ? { ...project, dirtyLocal: true }
        : project,
    ),
    incoming: detailedProjects,
    mode: semantics.mode,
  });
  const inserts: Project[] = [];
  const updates: Array<{ key: string; changes: UpdateSpec<Project> }> = [];
  for (const project of reconciliation.rowsToPut) {
    if (existingMap.has(project.localId)) {
      const { localId, activeMapId: _preserve, ...changes } = project;
      updates.push({ key: localId, changes });
    } else {
      inserts.push(project);
    }
  }

  const tombstonedProjectIds = reconciliation.tombstonedRows.map(
    (project) => project.localId,
  );
  await db.transaction(
    'rw',
    [
      db.projects,
      db.observations,
      db.attachments,
      db.alerts,
      db.presets,
      db.tracks,
      db.fields,
    ],
    async () => {
      if (inserts.length > 0) await db.projects.bulkPut(inserts);
      if (updates.length > 0) await db.projects.bulkUpdate(updates);
      await tombstoneProjectChildren(tombstonedProjectIds, now);
    },
  );

  return {
    rows: reconciliation.activeRows,
    semantics,
    counts: reconciliation.counts,
    warnings,
  };
}

export async function pullProjects(
  serverId: string,
  config: RequestConfig,
): Promise<Project[]> {
  return (await pullProjectsDetailed(serverId, config)).rows;
}

export async function pullObservationsDetailed(
  serverId: string,
  projectRemoteId: string,
  projectLocalId: string,
  config: RequestConfig,
): Promise<PullResult<Observation>> {
  const response = await apiClient.getObservations(projectRemoteId, config);
  const semantics = resolvedSemantics(response, 'observations');
  const db = getDb();
  const sourceType = 'remoteArchive' as const;
  const serverRecord = await getRemoteServer(serverId);
  const stableKey = stableSourceKey(
    serverRecord?.baseUrl ?? config.baseUrl ?? '',
  );
  const existingObservations = await db.observations
    .where('projectLocalId')
    .equals(projectLocalId)
    .and((row) => row.sourceType === sourceType)
    .toArray();
  const attachments: Attachment[] = [];
  const syncedAttachmentLocalIds = new Set<string>();
  const syncedObservationLocalIds = new Set<string>();
  const observations: Observation[] = response.data.map((item) => {
    // Parse attachments to extract media counts and photo URLs
    let photoCount = 0;
    let audioCount = 0;
    const photoUrls: string[] = [];

    const observationLocalId = `${sourceType}:${stableKey}:${item.docId}`;
    syncedObservationLocalIds.add(observationLocalId);

    // Skip attachment derivation for deleted observations: the server has
    // marked the observation as removed, so its attachments are not relevant
    // for the local UI. (Mirrors the test in deriveAttachmentsFromObservations.)
    const attachmentItems = item.deleted ? [] : item.attachments;

    for (const attachment of attachmentItems) {
      const mediaType = parseAttachmentMediaType(attachment.url);
      const parsedPath = parseAttachmentPath(attachment.url);
      const resolvedUrl = resolveAttachmentUrl(attachment.url, config.baseUrl);
      if (mediaType === 'photo') {
        photoCount++;
        photoUrls.push(resolvedUrl);
      } else if (mediaType === 'audio') {
        audioCount++;
      }

      const sourceDocId = stableAttachmentSourceDocId(
        item.docId,
        attachment,
        parsedPath,
      );
      const localId = `${sourceType}:${stableKey}:${sourceDocId}`;
      syncedAttachmentLocalIds.add(localId);
      attachments.push({
        localId,
        projectLocalId,
        observationLocalId,
        sourceType,
        sourceId: serverId,
        remoteId: sourceDocId,
        sourceDocId,
        driveId: attachment.driveId ?? parsedPath?.driveId,
        type: attachment.type ?? parsedPath?.type,
        name: attachment.name ?? parsedPath?.name,
        hash: attachment.hash,
        remoteUrl: attachment.url,
        resolvedUrl,
        mediaType,
        contentType: attachment.mimeType,
        downloadStatus: 'remote-only',
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        dirtyLocal: false,
        deleted: item.deleted,
      });
    }

    // Merge attachment metadata into tags; coerce all tag values to strings
    // because observation.tags schema allows unknown values at runtime.
    const enrichedTags: Record<string, string> = Object.fromEntries(
      Object.entries(item.tags ?? {}).map(([k, v]) => [k, String(v)]),
    );
    if (item.presetRef?.docId) {
      enrichedTags.presetRefDocId = item.presetRef.docId;
    }
    if (photoCount > 0) {
      enrichedTags.photoCount = String(photoCount);
      // Store up to 4 photo URLs as comma-separated string
      enrichedTags.photoUrls = photoUrls.slice(0, 4).join(',');
    }
    if (audioCount > 0) {
      enrichedTags.audioCount = String(audioCount);
    }

    return {
      localId: observationLocalId,
      projectLocalId,
      sourceType,
      sourceId: serverId,
      remoteId: item.docId,
      versionId: item.versionId,
      originalVersionId: item.originalVersionId,
      schemaName: item.schemaName,
      links: item.links,
      tags: Object.keys(enrichedTags).length > 0 ? enrichedTags : undefined,
      metadata: item.metadata,
      presetRefDocId: item.presetRef?.docId,
      presetRef: item.presetRef,
      lat: item.lat,
      lon: item.lon,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      dirtyLocal: false,
      deleted: item.deleted,
    };
  });

  const reconciliation = planReconciliation({
    existing: existingObservations,
    incoming: observations,
    mode: semantics.mode,
  });
  const attachmentScope = new Set([
    ...syncedObservationLocalIds,
    ...reconciliation.tombstonedRows.map((row) => row.localId),
  ]);

  await db.transaction('rw', [db.observations, db.attachments], async () => {
    if (reconciliation.rowsToPut.length > 0) {
      await db.observations.bulkPut(reconciliation.rowsToPut);
    }
    if (attachments.length > 0) await db.attachments.bulkPut(attachments);

    if (attachmentScope.size > 0) {
      const staleAttachments = await db.attachments
        .where('observationLocalId')
        .anyOf(Array.from(attachmentScope))
        .and(
          (row) => !syncedAttachmentLocalIds.has(row.localId) && !row.deleted,
        )
        .toArray();
      if (staleAttachments.length > 0) {
        const now = new Date().toISOString();
        for (const row of staleAttachments) {
          row.deleted = true;
          row.updatedAt = now;
        }
        await db.attachments.bulkPut(staleAttachments);
      }
    }
  });
  return {
    rows: observations,
    semantics,
    counts: reconciliation.counts,
    warnings: [],
  };
}

export async function pullObservations(
  serverId: string,
  projectRemoteId: string,
  projectLocalId: string,
  config: RequestConfig,
): Promise<Observation[]> {
  return (
    await pullObservationsDetailed(
      serverId,
      projectRemoteId,
      projectLocalId,
      config,
    )
  ).rows;
}

export async function pullAlertsDetailed(
  serverId: string,
  projectRemoteId: string,
  projectLocalId: string,
  config: RequestConfig,
): Promise<PullResult<Alert>> {
  const response = await apiClient.getAlerts(projectRemoteId, config);
  const semantics = resolvedSemantics(response, 'alerts');
  const db = getDb();
  const sourceType = 'remoteArchive' as const;
  const serverRecord = await getRemoteServer(serverId);
  const stableKey = stableSourceKey(
    serverRecord?.baseUrl ?? config.baseUrl ?? '',
  );
  const existingAlerts = await db.alerts
    .where('projectLocalId')
    .equals(projectLocalId)
    .and((row) => row.sourceType === sourceType)
    .toArray();
  const alerts: Alert[] = response.data.map((item) => ({
    localId: `${sourceType}:${stableKey}:${item.docId}`,
    projectLocalId,
    sourceType,
    sourceId: serverId,
    remoteSourceId: item.sourceId,
    remoteId: item.docId,
    geometry: item.geometry,
    metadata: item.metadata,
    detectionDateStart: item.detectionDateStart,
    detectionDateEnd: item.detectionDateEnd,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    dirtyLocal: false,
    deleted: item.deleted,
  }));
  const reconciliation = planReconciliation({
    existing: existingAlerts,
    incoming: alerts,
    mode: semantics.mode,
  });

  if (reconciliation.rowsToPut.length > 0) {
    await db.alerts.bulkPut(reconciliation.rowsToPut);
  }
  return {
    rows: alerts,
    semantics,
    counts: reconciliation.counts,
    warnings: [],
  };
}

export async function pullAlerts(
  serverId: string,
  projectRemoteId: string,
  projectLocalId: string,
  config: RequestConfig,
): Promise<Alert[]> {
  return (
    await pullAlertsDetailed(serverId, projectRemoteId, projectLocalId, config)
  ).rows;
}

/**
 * Pre-fetch and cache the icon blobs for the given presets so the UI can
 * render category icons instantly (from IndexedDB) instead of fetching them
 * on first render. Best-effort: individual icon failures are logged as
 * warnings and surfaced in the result, but never block the preset sync
 * itself. The cache key matches the icon URL the UI
 * derives via {@link buildIconUrl}, so cached blobs are found on lookup.
 *
 * Concurrency is capped at 4 to avoid overwhelming the server with
 * parallel authenticated requests during first sync.
 */
const ICON_FETCH_CONCURRENCY = 4;

async function precacheCategoryIcons(
  presets: readonly Preset[],
  projectRemoteId: string,
  serverUrl: string,
  config: RequestConfig,
  concurrency = ICON_FETCH_CONCURRENCY,
): Promise<string[]> {
  const seen = new Set<string>();
  const uniqueIconDocIds = presets
    .filter((preset) => !preset.deleted && preset.iconDocId)
    .map((preset) => {
      const iconUrl = buildIconUrl({
        projectRemoteId,
        serverUrl,
        iconDocId: preset.iconDocId,
      });
      if (!iconUrl || seen.has(iconUrl)) return null;
      seen.add(iconUrl);
      return { iconUrl, docId: preset.iconDocId! };
    })
    .filter(
      (item): item is { iconUrl: string; docId: string } => item !== null,
    );

  const results = await allSettledLimited(
    uniqueIconDocIds.map(({ iconUrl, docId }) => async () => {
      const existing = await getCachedIconBlob(iconUrl);
      if (existing) return;
      const blob = await apiClient.getIcon(projectRemoteId, docId, config);
      await putCachedIconBlob(iconUrl, blob);
    }),
    concurrency,
    config.signal,
  );

  return results.flatMap((result, index) =>
    result.status === 'rejected'
      ? [
          `Icon prefetch failed for ${uniqueIconDocIds[index]?.docId ?? 'unknown icon'}: ${
            result.reason instanceof ApiError
              ? `[${result.reason.kind} ${result.reason.status}] ${result.reason.code}: ${result.reason.message}`
              : String(result.reason)
          }`,
        ]
      : [],
  );
}

export async function pullPresetsDetailed(
  serverId: string,
  projectRemoteId: string,
  projectLocalId: string,
  config: RequestConfig,
  options: PullExecutionOptions = {},
): Promise<PullResult<Preset>> {
  const response = await apiClient.getPresets(projectRemoteId, config);
  const semantics = resolvedSemantics(response, 'presets');
  const db = getDb();
  const sourceType = 'remoteArchive' as const;
  const serverRecord = await getRemoteServer(serverId);
  const baseUrl = serverRecord?.baseUrl ?? config.baseUrl ?? '';
  const stableKey = stableSourceKey(baseUrl);
  const existingPresets = await db.presets
    .where('projectLocalId')
    .equals(projectLocalId)
    .and((row) => row.sourceType === sourceType)
    .toArray();
  if (semantics.availability === 'unsupported') {
    return unsupportedResult(
      semantics,
      existingPresets.filter((row) => !row.deleted).length,
    );
  }

  // Map ALL items (including deleted) and write them all to DB as tombstones
  // matching the pattern from pullObservations / pullAlerts
  const allPresets: Preset[] = response.data.map((item) => ({
    localId: `${sourceType}:${stableKey}:${item.docId}`,
    projectLocalId,
    sourceType,
    sourceId: serverId,
    remoteId: item.docId,
    name: item.name,
    color: item.color,
    iconDocId: item.iconRef?.docId,
    terms: item.terms ?? [],
    tags: item.tags,
    fieldRefs: item.fieldRefs.map((f) => f.docId),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    dirtyLocal: false,
    deleted: item.deleted,
  }));

  const reconciliation = planReconciliation({
    existing: existingPresets,
    incoming: allPresets,
    mode: semantics.mode,
  });
  if (reconciliation.rowsToPut.length > 0) {
    await db.presets.bulkPut(reconciliation.rowsToPut);
  }
  const warnings = await precacheCategoryIcons(
    reconciliation.activeRows,
    projectRemoteId,
    baseUrl,
    config,
    options.concurrency,
  );

  return {
    rows: reconciliation.activeRows,
    semantics,
    counts: reconciliation.counts,
    warnings,
  };
}

export async function pullPresets(
  serverId: string,
  projectRemoteId: string,
  projectLocalId: string,
  config: RequestConfig,
): Promise<Preset[]> {
  return (
    await pullPresetsDetailed(serverId, projectRemoteId, projectLocalId, config)
  ).rows;
}

export async function pullTracksDetailed(
  serverId: string,
  projectRemoteId: string,
  projectLocalId: string,
  config: RequestConfig,
): Promise<PullResult<Track>> {
  const response = await apiClient.getTracks(projectRemoteId, config);
  const semantics = resolvedSemantics(response, 'tracks');
  const db = getDb();
  const sourceType = 'remoteArchive' as const;
  const serverRecord = await getRemoteServer(serverId);
  const stableKey = stableSourceKey(
    serverRecord?.baseUrl ?? config.baseUrl ?? '',
  );
  const existingTracks = await db.tracks
    .where('projectLocalId')
    .equals(projectLocalId)
    .and((row) => row.sourceType === sourceType)
    .toArray();
  if (semantics.availability === 'unsupported') {
    return unsupportedResult(
      semantics,
      existingTracks.filter((row) => !row.deleted).length,
    );
  }

  const allTracks: Track[] = response.data.map((item) => ({
    localId: `${sourceType}:${stableKey}:${item.docId}`,
    projectLocalId,
    sourceType,
    sourceId: serverId,
    remoteId: item.docId,
    versionId: item.versionId,
    originalVersionId: item.originalVersionId,
    schemaName: item.schemaName,
    links: item.links ?? [],
    tags: item.tags,
    presetRefDocId: item.presetRef?.docId,
    presetRef: item.presetRef,
    locations: item.locations ?? [],
    observationRefs: item.observationRefs ?? [],
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    dirtyLocal: false,
    deleted: item.deleted,
  }));
  const reconciliation = planReconciliation({
    existing: existingTracks,
    incoming: allTracks,
    mode: semantics.mode,
  });

  if (reconciliation.rowsToPut.length > 0) {
    await db.tracks.bulkPut(reconciliation.rowsToPut);
  }
  return {
    rows: reconciliation.activeRows,
    semantics,
    counts: reconciliation.counts,
    warnings: [],
  };
}

export async function pullTracks(
  serverId: string,
  projectRemoteId: string,
  projectLocalId: string,
  config: RequestConfig,
): Promise<Track[]> {
  return (
    await pullTracksDetailed(serverId, projectRemoteId, projectLocalId, config)
  ).rows;
}

export async function pullFieldsDetailed(
  serverId: string,
  projectRemoteId: string,
  projectLocalId: string,
  config: RequestConfig,
): Promise<PullResult<Field>> {
  const response = await apiClient.getFields(projectRemoteId, config);
  const semantics = resolvedSemantics(response, 'fields');
  const db = getDb();
  const sourceType = 'remoteArchive' as const;
  const serverRecord = await getRemoteServer(serverId);
  const stableKey = stableSourceKey(
    serverRecord?.baseUrl ?? config.baseUrl ?? '',
  );
  const existingFields = await db.fields
    .where('projectLocalId')
    .equals(projectLocalId)
    .and((row) => row.sourceType === sourceType)
    .toArray();
  if (semantics.availability === 'unsupported') {
    return unsupportedResult(
      semantics,
      existingFields.filter((row) => !row.deleted).length,
    );
  }

  const allFields: Field[] = response.data.map((item) => ({
    localId: `${sourceType}:${stableKey}:${item.docId}`,
    projectLocalId,
    sourceType,
    sourceId: serverId,
    remoteId: item.docId,
    versionId: item.versionId,
    originalVersionId: item.originalVersionId,
    schemaName: item.schemaName,
    links: item.links ?? [],
    type: item.type,
    key: item.tagKey ?? item.key ?? '',
    label: item.label,
    placeholder: item.placeholder,
    universal: item.universal,
    options: item.options,
    createdAt: item.createdAt ?? '',
    updatedAt: item.updatedAt ?? '',
    dirtyLocal: false,
    deleted: item.deleted,
  }));
  const reconciliation = planReconciliation({
    existing: existingFields,
    incoming: allFields,
    mode: semantics.mode,
  });

  if (reconciliation.rowsToPut.length > 0) {
    await db.fields.bulkPut(reconciliation.rowsToPut);
  }
  return {
    rows: reconciliation.activeRows,
    semantics,
    counts: reconciliation.counts,
    warnings: [],
  };
}

export async function pullFields(
  serverId: string,
  projectRemoteId: string,
  projectLocalId: string,
  config: RequestConfig,
): Promise<Field[]> {
  return (
    await pullFieldsDetailed(serverId, projectRemoteId, projectLocalId, config)
  ).rows;
}

export async function deriveAttachmentsFromObservations(
  serverId: string,
  projectRemoteId: string,
  projectLocalId: string,
  config: RequestConfig,
): Promise<void> {
  // Attachment derivation is now handled inline in pullObservations, using the
  // same single network fetch. This function delegates to avoid a second
  // GET /projects/:id/observations round-trip.
  await pullObservations(serverId, projectRemoteId, projectLocalId, config);
}
