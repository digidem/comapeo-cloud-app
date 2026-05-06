import { apiClient } from '@/lib/api-client';
import type { RequestConfig } from '@/lib/api-client';
import { getDb } from '@/lib/db';
import type { Alert, Observation, Project } from '@/lib/db';

// ---------------------------------------------------------------------------
// Fetch archive data and store locally
// ---------------------------------------------------------------------------

export async function pullProjects(config: RequestConfig): Promise<Project[]> {
  const response = await apiClient.getProjects(config);
  const db = getDb();
  const projects: Project[] = response.data.map((item) => ({
    localId: crypto.randomUUID(),
    sourceType: 'remoteArchive' as const,
    sourceId: crypto.randomUUID(), // unique per archive source instance
    remoteId: item.projectId,
    name: item.name ?? undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dirtyLocal: false,
    deleted: false,
  }));

  await db.projects.bulkAdd(projects);
  return projects;
}

export async function pullObservations(
  projectRemoteId: string,
  config: RequestConfig,
): Promise<Observation[]> {
  const response = await apiClient.getObservations(projectRemoteId, config);
  const db = getDb();
  const observations: Observation[] = response.data.map((item) => ({
    localId: crypto.randomUUID(),
    projectLocalId: projectRemoteId,
    sourceType: 'remoteArchive' as const,
    sourceId: crypto.randomUUID(),
    remoteId: item.docId,
    tags: item.tags ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    dirtyLocal: false,
    deleted: item.deleted,
  }));

  await db.observations.bulkAdd(observations);
  return observations;
}

export async function pullAlerts(
  projectRemoteId: string,
  config: RequestConfig,
): Promise<Alert[]> {
  const response = await apiClient.getAlerts(projectRemoteId, config);
  const db = getDb();
  const alerts: Alert[] = response.data.map((item) => ({
    localId: crypto.randomUUID(),
    projectLocalId: projectRemoteId,
    sourceType: 'remoteArchive' as const,
    sourceId: crypto.randomUUID(),
    remoteId: item.docId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    dirtyLocal: false,
    deleted: item.deleted,
  }));

  await db.alerts.bulkAdd(alerts);
  return alerts;
}
