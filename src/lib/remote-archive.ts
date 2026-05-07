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
  const projects: Project[] = response.data.map((item) => ({
    localId: `${sourceType}:${serverId}:${item.projectId}`,
    sourceType,
    sourceId: serverId,
    remoteId: item.projectId,
    name: item.name ?? undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dirtyLocal: false,
    deleted: false,
  }));

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
