import type { UpdateSpec } from 'dexie';

import { apiClient } from '@/lib/api-client';
import type { RequestConfig } from '@/lib/api-client';
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
function allSettledLimited<T>(
  tasks: Array<() => Promise<T>>,
  limit = 5,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let cursor = 0;

  async function worker() {
    while (cursor < tasks.length) {
      const i = cursor++;
      try {
        results[i] = { status: 'fulfilled', value: await tasks[i]!() };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  }

  return Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, worker),
  ).then(() => results);
}

// ---------------------------------------------------------------------------
// Fetch archive data and store locally
// ---------------------------------------------------------------------------

export async function pullProjects(
  serverId: string,
  config: RequestConfig,
): Promise<Project[]> {
  const response = await apiClient.getProjects(config);
  const db = getDb();
  const sourceType = 'remoteArchive' as const;

  // Look up the server record to get the archive's baseUrl.
  // Fall back to config.baseUrl if no record exists (e.g. during sync
  // before the server record is fully persisted).
  const serverRecord = await getRemoteServer(serverId);
  const baseUrl = serverRecord?.baseUrl ?? config.baseUrl ?? '';
  const stableKey = stableSourceKey(baseUrl);

  const localIds = response.data.map(
    (item) => `${sourceType}:${stableKey}:${item.projectId}`,
  );

  // Fetch existing records to preserve timestamps
  const existingRecords = await db.projects.bulkGet(localIds);
  const existingMap = new Map<string, Project>();
  for (const record of existingRecords) {
    if (record) existingMap.set(record.localId, record);
  }

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
  );

  for (const [index, result] of projectDetails.entries()) {
    const basic = response.data[index]!;
    const localId = `${sourceType}:${stableKey}:${basic.projectId}`;
    const existing = existingMap.get(localId);

    if (result.status === 'rejected') {
      console.warn(
        `Failed to fetch details for project ${basic.projectId}:`,
        result.reason,
      );
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
  const inserts: Project[] = [];
  const updates: Array<{ key: string; changes: UpdateSpec<Project> }> = [];
  for (const project of detailedProjects) {
    if (existingMap.has(project.localId)) {
      const { localId, activeMapId: _preserve, ...changes } = project;
      updates.push({ key: localId, changes });
    } else {
      inserts.push(project);
    }
  }

  await db.transaction('rw', db.projects, async () => {
    if (inserts.length > 0) await db.projects.bulkPut(inserts);
    if (updates.length > 0) await db.projects.bulkUpdate(updates);
  });

  return detailedProjects;
}

export async function pullObservations(
  serverId: string,
  projectRemoteId: string,
  projectLocalId: string,
  config: RequestConfig,
): Promise<Observation[]> {
  const response = await apiClient.getObservations(projectRemoteId, config);
  const db = getDb();
  const sourceType = 'remoteArchive' as const;
  const serverRecord = await getRemoteServer(serverId);
  const stableKey = stableSourceKey(
    serverRecord?.baseUrl ?? config.baseUrl ?? '',
  );
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

  await db.transaction('rw', [db.observations, db.attachments], async () => {
    await db.observations.bulkPut(observations);
    if (attachments.length > 0) await db.attachments.bulkPut(attachments);

    // Tombstone attachments that belong to the synced observations but
    // were not returned by the server on this sync. This handles
    // server-side removal: the local row stays around (preserving the
    // localId reference) but is marked deleted so the UI can hide it.
    if (syncedObservationLocalIds.size > 0) {
      const staleAttachments = await db.attachments
        .where('observationLocalId')
        .anyOf(Array.from(syncedObservationLocalIds))
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
  return observations;
}

export async function pullAlerts(
  serverId: string,
  projectRemoteId: string,
  projectLocalId: string,
  config: RequestConfig,
): Promise<Alert[]> {
  const response = await apiClient.getAlerts(projectRemoteId, config);
  const db = getDb();
  const sourceType = 'remoteArchive' as const;
  const serverRecord = await getRemoteServer(serverId);
  const stableKey = stableSourceKey(
    serverRecord?.baseUrl ?? config.baseUrl ?? '',
  );
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

  await db.alerts.bulkPut(alerts);
  return alerts;
}

/**
 * Pre-fetch and cache the icon blobs for the given presets so the UI can
 * render category icons instantly (from IndexedDB) instead of fetching them
 * on first render. Best-effort: individual icon failures are swallowed and
 * never affect the preset sync. The cache key matches the icon URL the UI
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
): Promise<void> {
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

  // Process with bounded concurrency
  for (let i = 0; i < uniqueIconDocIds.length; i += ICON_FETCH_CONCURRENCY) {
    const batch = uniqueIconDocIds.slice(i, i + ICON_FETCH_CONCURRENCY);
    await Promise.allSettled(
      batch.map(async ({ iconUrl, docId }) => {
        // Skip if already cached to avoid redundant network fetches.
        const existing = await getCachedIconBlob(iconUrl);
        if (existing) return;

        const blob = await apiClient.getIcon(projectRemoteId, docId, config);
        await putCachedIconBlob(iconUrl, blob);
      }),
    );
  }
}

export async function pullPresets(
  serverId: string,
  projectRemoteId: string,
  projectLocalId: string,
  config: RequestConfig,
): Promise<Preset[]> {
  const response = await apiClient.getPresets(projectRemoteId, config);
  const db = getDb();
  const sourceType = 'remoteArchive' as const;
  const serverRecord = await getRemoteServer(serverId);
  const baseUrl = serverRecord?.baseUrl ?? config.baseUrl ?? '';
  const stableKey = stableSourceKey(baseUrl);

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

  await db.presets.bulkPut(allPresets);

  // Pre-cache category icons so the UI renders them instantly. Fire-and-forget
  // so a slow/hung icon fetch never blocks the sync. The hook lazily caches on
  // first render as a fallback.
  void precacheCategoryIcons(allPresets, projectRemoteId, baseUrl, config);

  // Return only the non-deleted subset to callers; deleted items remain
  // locally as tombstones so they are not re-surfaced after server-side deletion
  return allPresets.filter((p) => !p.deleted);
}

export async function pullTracks(
  serverId: string,
  projectRemoteId: string,
  projectLocalId: string,
  config: RequestConfig,
): Promise<Track[]> {
  const response = await apiClient.getTracks(projectRemoteId, config);
  const db = getDb();
  const sourceType = 'remoteArchive' as const;
  const serverRecord = await getRemoteServer(serverId);
  const stableKey = stableSourceKey(
    serverRecord?.baseUrl ?? config.baseUrl ?? '',
  );

  // Map ALL items (including deleted) and write them all to DB as tombstones,
  // then mark previously-synced rows that the server no longer returns as
  // deleted so they don't surface as stale data after remote deletion.
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

  await db.transaction('rw', [db.tracks], async () => {
    await db.tracks.bulkPut(allTracks);
    await tombstoneStaleRows(db.tracks, projectLocalId, serverId, allTracks);
  });
  return allTracks.filter((t) => !t.deleted);
}

/**
 * Mark previously-synced rows for (projectLocalId, sourceId) as `deleted: true`
 * when the current pull did not return them. Without this, a remote delete
 * (or an empty response from a 0.4 server that no longer emits the resource)
 * leaves stale rows in IndexedDB that the UI continues to show.
 */
async function tombstoneStaleRows<
  T extends {
    localId: string;
    projectLocalId: string;
    sourceId: string;
    deleted: boolean;
    updatedAt: string;
  },
>(
  table: {
    bulkPut: (rows: T[]) => Promise<unknown>;
    where: (key: string) => {
      equals: (value: string) => {
        and: (pred: (row: T) => boolean) => { toArray: () => Promise<T[]> };
      };
    };
  },
  projectLocalId: string,
  sourceId: string,
  currentRows: readonly T[],
): Promise<void> {
  const syncedIds = new Set(currentRows.map((r) => r.localId));
  const staleRows = await table
    .where('projectLocalId')
    .equals(projectLocalId)
    .and(
      (row) =>
        row.sourceId === sourceId &&
        !row.deleted &&
        !syncedIds.has(row.localId),
    )
    .toArray();
  if (staleRows.length === 0) return;
  const now = new Date().toISOString();
  for (const row of staleRows) {
    row.deleted = true;
    row.updatedAt = now;
  }
  await table.bulkPut(staleRows);
}

export async function pullFields(
  serverId: string,
  projectRemoteId: string,
  projectLocalId: string,
  config: RequestConfig,
): Promise<Field[]> {
  const response = await apiClient.getFields(projectRemoteId, config);
  const db = getDb();
  const sourceType = 'remoteArchive' as const;
  const serverRecord = await getRemoteServer(serverId);
  const stableKey = stableSourceKey(
    serverRecord?.baseUrl ?? config.baseUrl ?? '',
  );

  // Map ALL items (including deleted) and write them all to DB as tombstones,
  // then mark previously-synced rows that the server no longer returns as
  // deleted so they don't surface as stale data after remote deletion.
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
    key: item.key,
    label: item.label,
    placeholder: item.placeholder,
    universal: item.universal,
    options: item.options,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    dirtyLocal: false,
    deleted: item.deleted,
  }));

  await db.transaction('rw', [db.fields], async () => {
    await db.fields.bulkPut(allFields);
    await tombstoneStaleRows(db.fields, projectLocalId, serverId, allFields);
  });
  return allFields.filter((f) => !f.deleted);
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
