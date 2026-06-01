import { apiClient } from '@/lib/api-client';
import type { RequestConfig } from '@/lib/api-client';
import { normalizeArchiveBaseUrl } from '@/lib/archive-proxy';
import { getDb } from '@/lib/db';
import type {
  Alert,
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

function resolveAttachmentUrl(url: string, archiveBaseUrl: string): string {
  try {
    return new URL(url, archiveBaseUrl).toString();
  } catch {
    return url;
  }
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

  // Fetch detailed project information for each project with error handling
  const projectDetails = await Promise.allSettled(
    response.data.map(async (item) => {
      try {
        const detailResponse = await apiClient.getProject(
          item.projectId,
          config,
        );
        return { basic: item, detail: detailResponse.data };
      } catch (error) {
        console.warn(
          `Failed to fetch details for project ${item.projectId}:`,
          error,
        );
        return { basic: item, detail: null };
      }
    }),
  );

  for (const result of projectDetails) {
    if (result.status === 'fulfilled') {
      const { basic, detail } = result.value;
      const localId = `${sourceType}:${stableKey}:${basic.projectId}`;
      const existing = existingMap.get(localId);
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
          nameChanged || descriptionChanged
            ? now
            : (existing?.updatedAt ?? now),
        dirtyLocal: false,
        deleted: false,
      });
    }
  }

  await db.projects.bulkPut(detailedProjects);
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
  const observations: Observation[] = response.data.map((item) => {
    // Parse attachments to extract media counts and photo URLs
    let photoCount = 0;
    let audioCount = 0;
    const photoUrls: string[] = [];

    for (const attachment of item.attachments) {
      const mediaType = parseAttachmentMediaType(attachment.url);
      if (mediaType === 'photo') {
        photoCount++;
        photoUrls.push(resolveAttachmentUrl(attachment.url, config.baseUrl));
      } else if (mediaType === 'audio') {
        audioCount++;
      }
    }

    // Merge attachment metadata into tags
    const enrichedTags: Record<string, string> = {
      ...((item.tags as Record<string, string>) ?? {}),
    };
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
      localId: `${sourceType}:${stableKey}:${item.docId}`,
      projectLocalId,
      sourceType,
      sourceId: serverId,
      remoteId: item.docId,
      tags: Object.keys(enrichedTags).length > 0 ? enrichedTags : undefined,
      lat: item.lat,
      lon: item.lon,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      dirtyLocal: false,
      deleted: item.deleted,
    };
  });

  await db.observations.bulkPut(observations);
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
  const stableKey = stableSourceKey(
    serverRecord?.baseUrl ?? config.baseUrl ?? '',
  );

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

  const allTracks: Track[] = response.data.map((item) => ({
    localId: `${sourceType}:${stableKey}:${item.docId}`,
    projectLocalId,
    sourceType,
    sourceId: serverId,
    remoteId: item.docId,
    tags:
      Object.keys(item.tags as Record<string, string>).length > 0
        ? (item.tags as Record<string, string>)
        : undefined,
    presetRef: item.presetRef?.docId,
    locations: item.locations.map((loc) => ({
      coords: {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      },
      timestamp: loc.timestamp,
    })),
    observationRefs: item.observationRefs.map((ref) => ref.docId),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    dirtyLocal: false,
    deleted: item.deleted,
  }));

  await db.tracks.bulkPut(allTracks);
  return allTracks.filter((t) => !t.deleted);
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

  const allFields: Field[] = response.data.map((item) => ({
    localId: `${sourceType}:${stableKey}:${item.docId}`,
    projectLocalId,
    sourceType,
    sourceId: serverId,
    remoteId: item.docId,
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

  await db.fields.bulkPut(allFields);
  return allFields.filter((f) => !f.deleted);
}

export async function deriveAttachmentsFromObservations(
  serverId: string,
  projectRemoteId: string,
  projectLocalId: string,
  config: RequestConfig,
): Promise<void> {
  const response = await apiClient.getObservations(projectRemoteId, config);
  const db = getDb();
  const sourceType = 'remoteArchive' as const;
  const serverRecord = await getRemoteServer(serverId);
  const stableKey = stableSourceKey(
    serverRecord?.baseUrl ?? config.baseUrl ?? '',
  );
  const baseUrl = serverRecord?.baseUrl ?? config.baseUrl ?? '';

  const attachments: import('@/lib/db').Attachment[] = [];

  for (const obs of response.data) {
    if (obs.deleted) continue;

    const observationLocalId = `${sourceType}:${stableKey}:${obs.docId}`;

    for (const attachment of obs.attachments) {
      const mediaType = parseAttachmentMediaType(attachment.url);
      const resolvedUrl = resolveAttachmentUrl(attachment.url, baseUrl);

      const attachmentLocalId = `${sourceType}:${stableKey}:attachment:${obs.docId}:${attachment.url}`;

      attachments.push({
        localId: attachmentLocalId,
        projectLocalId,
        observationLocalId,
        sourceType,
        sourceId: serverId,
        remoteUrl: attachment.url,
        resolvedUrl,
        mediaType,
        createdAt: obs.createdAt,
        updatedAt: obs.updatedAt,
        dirtyLocal: false,
        deleted: false,
      });
    }
  }

  if (attachments.length > 0) {
    await db.attachments.bulkPut(attachments);
  }
}
