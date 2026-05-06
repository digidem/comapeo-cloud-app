import {
  createAttachment,
  createAlert as repoCreateAlert,
  createObservation as repoCreateObservation,
  createProject as repoCreateProject,
  getAlerts as repoGetAlerts,
  getObservations as repoGetObservations,
  getProjects as repoGetProjects,
} from '@/lib/local-repositories';

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
  return {
    isSyncing: false,
    lastSyncedAt: null,
    errors: [],
  };
}

export async function syncRemoteArchive(_serverId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  // Stub — real implementation in sync.ts (Task 8)
  return { success: true };
}
