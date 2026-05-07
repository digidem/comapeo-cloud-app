import {
  createAttachment,
  createAlert as repoCreateAlert,
  createObservation as repoCreateObservation,
  createProject as repoCreateProject,
  getAlerts as repoGetAlerts,
  getObservations as repoGetObservations,
  getProjects as repoGetProjects,
} from '@/lib/local-repositories';
import { syncRemoteArchive as doSync } from '@/lib/sync';
import { useAuthStore } from '@/stores/auth-store';

// Re-export types from db
export type { Alert, Attachment, Observation, Project } from '@/lib/db';

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function createProject(input: { name?: string }) {
  return repoCreateProject(input);
}

export async function getProjects() {
  return repoGetProjects();
}

// ---------------------------------------------------------------------------
// Observations
// ---------------------------------------------------------------------------

export async function createObservation(input: {
  projectLocalId: string;
  tags?: Record<string, string>;
}) {
  return repoCreateObservation(input);
}

export async function getObservations(projectLocalId: string) {
  return repoGetObservations(projectLocalId);
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
