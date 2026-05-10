import { apiClient } from '@/lib/api-client';
import type { RequestConfig } from '@/lib/api-client';
import { getDb } from '@/lib/db';
import type { Alert, Observation, Project } from '@/lib/db';

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

  const localIds = response.data.map(
    (item) => `${sourceType}:${serverId}:${item.projectId}`,
  );

  // Fetch existing records to preserve timestamps
  const existingRecords = await db.projects.bulkGet(localIds);
  const existingMap = new Map<string, Project>();
  for (const record of existingRecords) {
    if (record) existingMap.set(record.localId, record);
  }

  const now = new Date().toISOString();
  const projects: Project[] = response.data.map((item) => {
    const localId = `${sourceType}:${serverId}:${item.projectId}`;
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
  const observations: Observation[] = response.data.map((item) => ({
    localId: `${sourceType}:${serverId}:${item.docId}`,
    projectLocalId,
    sourceType,
    sourceId: serverId,
    remoteId: item.docId,
    tags: (item.tags as Record<string, string>) ?? undefined,
    lat: item.lat,
    lon: item.lon,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    dirtyLocal: false,
    deleted: item.deleted,
  }));

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
  const alerts: Alert[] = response.data.map((item) => ({
    localId: `${sourceType}:${serverId}:${item.docId}`,
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
