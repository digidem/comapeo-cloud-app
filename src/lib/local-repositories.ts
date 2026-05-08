import { getDb } from '@/lib/db';
import type {
  Alert,
  Attachment,
  Observation,
  Project,
  RemoteServer,
  SyncMetadata,
} from '@/lib/db';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timestamp(): string {
  return new Date().toISOString();
}

function localMeta() {
  return {
    sourceType: 'local' as const,
    sourceId: 'local' as const,
    dirtyLocal: true,
    createdAt: timestamp(),
    updatedAt: timestamp(),
    deleted: false,
  };
}

type ImmutableFields = 'localId' | 'sourceType' | 'sourceId' | 'createdAt';
export type ProjectUpdates = Omit<Partial<Project>, ImmutableFields>;
export type ObservationUpdates = Omit<Partial<Observation>, ImmutableFields>;
export type AlertUpdates = Omit<Partial<Alert>, ImmutableFields>;

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export interface CreateProjectInput {
  name?: string;
}

export async function createProject(
  input: CreateProjectInput,
): Promise<Project> {
  const db = getDb();
  const project: Project = {
    localId: crypto.randomUUID(),
    ...localMeta(),
    ...input,
  };
  await db.projects.add(project);
  return project;
}

export async function getProjects(): Promise<Project[]> {
  const db = getDb();
  return db.projects.filter((p) => !p.deleted).toArray();
}

export async function getProject(
  localId: string,
): Promise<Project | undefined> {
  const db = getDb();
  return db.projects.get(localId);
}

export async function updateProject(
  localId: string,
  updates: ProjectUpdates,
): Promise<Project | undefined> {
  const db = getDb();
  await db.projects.update(localId, { ...updates, updatedAt: timestamp() });
  return db.projects.get(localId);
}

export async function deleteProject(localId: string): Promise<void> {
  const db = getDb();
  await db.projects.delete(localId);
}

// ---------------------------------------------------------------------------
// Observations
// ---------------------------------------------------------------------------

export interface CreateObservationInput {
  projectLocalId: string;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
}

export async function createObservation(
  input: CreateObservationInput,
): Promise<Observation> {
  const db = getDb();
  const observation: Observation = {
    localId: crypto.randomUUID(),
    projectLocalId: input.projectLocalId,
    ...localMeta(),
    tags: input.tags ?? {},
    lat: input.lat,
    lon: input.lon,
  };
  await db.observations.add(observation);
  return observation;
}

export async function getObservations(
  projectLocalId: string,
): Promise<Observation[]> {
  const db = getDb();
  return db.observations
    .where('projectLocalId')
    .equals(projectLocalId)
    .filter((o) => !o.deleted)
    .toArray();
}

export async function getObservation(
  localId: string,
): Promise<Observation | undefined> {
  const db = getDb();
  return db.observations.get(localId);
}

export async function updateObservation(
  localId: string,
  updates: ObservationUpdates,
): Promise<Observation | undefined> {
  const db = getDb();
  await db.observations.update(localId, {
    ...updates,
    updatedAt: timestamp(),
  });
  return db.observations.get(localId);
}

export async function deleteObservation(localId: string): Promise<void> {
  const db = getDb();
  await db.observations.delete(localId);
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export interface CreateAlertInput {
  projectLocalId: string;
}

export async function createAlert(input: CreateAlertInput): Promise<Alert> {
  const db = getDb();
  const alert: Alert = {
    localId: crypto.randomUUID(),
    projectLocalId: input.projectLocalId,
    ...localMeta(),
  };
  await db.alerts.add(alert);
  return alert;
}

export async function getAlerts(projectLocalId: string): Promise<Alert[]> {
  const db = getDb();
  return db.alerts
    .where('projectLocalId')
    .equals(projectLocalId)
    .filter((a) => !a.deleted)
    .toArray();
}

export async function getAlert(localId: string): Promise<Alert | undefined> {
  const db = getDb();
  return db.alerts.get(localId);
}

export async function updateAlert(
  localId: string,
  updates: AlertUpdates,
): Promise<Alert | undefined> {
  const db = getDb();
  await db.alerts.update(localId, { ...updates, updatedAt: timestamp() });
  return db.alerts.get(localId);
}

export async function deleteAlert(localId: string): Promise<void> {
  const db = getDb();
  await db.alerts.delete(localId);
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export interface CreateAttachmentInput {
  projectLocalId: string;
  observationLocalId: string;
}

export async function createAttachment(
  input: CreateAttachmentInput,
): Promise<Attachment> {
  const db = getDb();
  const attachment: Attachment = {
    localId: crypto.randomUUID(),
    ...input,
    ...localMeta(),
  };
  await db.attachments.add(attachment);
  return attachment;
}

export async function getAttachments(
  observationLocalId: string,
): Promise<Attachment[]> {
  const db = getDb();
  return db.attachments
    .where('observationLocalId')
    .equals(observationLocalId)
    .toArray();
}

// ---------------------------------------------------------------------------
// Remote Servers
// ---------------------------------------------------------------------------

export interface CreateRemoteServerInput {
  baseUrl: string;
  label?: string;
  status?: string;
}

export async function createRemoteServer(
  input: CreateRemoteServerInput,
): Promise<RemoteServer> {
  const db = getDb();
  const server: RemoteServer = {
    id: crypto.randomUUID(),
    baseUrl: input.baseUrl,
    label: input.label,
    status: input.status ?? 'idle',
    lastSyncedAt: '',
  };
  await db.remoteServers.add(server);
  return server;
}

export async function getRemoteServers(): Promise<RemoteServer[]> {
  const db = getDb();
  return db.remoteServers.toArray();
}

export async function getRemoteServer(
  id: string,
): Promise<RemoteServer | undefined> {
  const db = getDb();
  return db.remoteServers.get(id);
}

export async function getRemoteServerByBaseUrl(
  baseUrl: string,
): Promise<RemoteServer | undefined> {
  const db = getDb();
  return db.remoteServers.where('baseUrl').equals(baseUrl).first();
}

export async function updateRemoteServer(
  id: string,
  updates: Partial<RemoteServer>,
): Promise<RemoteServer | undefined> {
  const db = getDb();
  await db.remoteServers.update(id, updates);
  return db.remoteServers.get(id);
}

export async function deleteRemoteServer(id: string): Promise<void> {
  const db = getDb();
  await db.remoteServers.delete(id);
}

// ---------------------------------------------------------------------------
// Sync Metadata
// ---------------------------------------------------------------------------

export async function getSyncMetadata(): Promise<SyncMetadata[]> {
  const db = getDb();
  return db.syncMetadata.toArray();
}

export async function upsertSyncMetadata(
  meta: SyncMetadata,
): Promise<SyncMetadata> {
  const db = getDb();
  await db.syncMetadata.put(meta);
  return meta;
}
