import { apiClient } from '@/lib/api-client';
import type { RequestConfig } from '@/lib/api-client';
import { normalizeArchiveBaseUrl } from '@/lib/archive-proxy';
import { getDb } from '@/lib/db';
import type { Alert, Observation, Project } from '@/lib/db';
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
  const projects: Project[] = response.data.map((item) => {
    const localId = `${sourceType}:${stableKey}:${item.projectId}`;
    const existing = existingMap.get(localId);
    const nameChanged = existing
      ? existing.name !== (item.name ?? undefined)
      : true;

    return {
      localId,
      sourceType,
      sourceId: serverId,
      remoteId: item.projectId,
      name: item.name ?? undefined,
      serverUrl: baseUrl || undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: nameChanged ? now : (existing?.updatedAt ?? now),
      dirtyLocal: false,
      deleted: false,
    };
  });

  await db.projects.bulkPut(projects);
  return projects;
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
    remoteId: item.docId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    dirtyLocal: false,
    deleted: item.deleted,
  }));

  await db.alerts.bulkPut(alerts);
  return alerts;
}
