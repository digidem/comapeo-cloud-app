import { getDb } from '@/lib/db';
import type {
  Alert,
  Attachment,
  Observation,
  Project,
  RemoteServer,
  SyncMetadata,
} from '@/lib/db';
import { DbError, wrapDb } from '@/lib/db-error';
import { uuid } from '@/lib/uuid';

export { DbError } from '@/lib/db-error';

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
  serverUrl?: string;
}

export async function createProject(
  input: CreateProjectInput,
): Promise<Project> {
  return wrapDb(async () => {
    const db = getDb();
    const project: Project = {
      localId: uuid(),
      ...localMeta(),
      ...input,
    };
    await db.projects.add(project);
    return project;
  });
}

export async function getProjects(): Promise<Project[]> {
  return wrapDb(async () => {
    const db = getDb();
    return db.projects.filter((p) => !p.deleted).toArray();
  });
}

export async function getProject(
  localId: string,
): Promise<Project | undefined> {
  return wrapDb(async () => {
    const db = getDb();
    return db.projects.get(localId);
  });
}

export async function updateProject(
  localId: string,
  updates: ProjectUpdates,
): Promise<Project | undefined> {
  return wrapDb(async () => {
    const db = getDb();
    await db.projects.update(localId, { ...updates, updatedAt: timestamp() });
    return db.projects.get(localId);
  });
}

export async function deleteProject(localId: string): Promise<void> {
  return wrapDb(async () => {
    const db = getDb();
    await db.transaction(
      'rw',
      [db.projects, db.observations, db.alerts, db.attachments],
      async () => {
        await db.observations.where('projectLocalId').equals(localId).delete();
        await db.alerts.where('projectLocalId').equals(localId).delete();
        await db.attachments.where('projectLocalId').equals(localId).delete();
        await db.projects.delete(localId);
      },
    );
  });
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
  return wrapDb(async () => {
    const db = getDb();
    const project = await db.projects.get(input.projectLocalId);
    if (!project) {
      throw new DbError(
        'FK_VIOLATION',
        `Project with localId "${input.projectLocalId}" does not exist`,
      );
    }
    const observation: Observation = {
      localId: uuid(),
      projectLocalId: input.projectLocalId,
      ...localMeta(),
      tags: input.tags ?? {},
      lat: input.lat,
      lon: input.lon,
    };
    await db.observations.add(observation);
    return observation;
  });
}

export async function getObservations(
  projectLocalId: string,
): Promise<Observation[]> {
  return wrapDb(async () => {
    const db = getDb();
    return db.observations
      .where('projectLocalId')
      .equals(projectLocalId)
      .filter((o) => !o.deleted)
      .toArray();
  });
}

export async function getObservation(
  localId: string,
): Promise<Observation | undefined> {
  return wrapDb(async () => {
    const db = getDb();
    return db.observations.get(localId);
  });
}

export async function updateObservation(
  localId: string,
  updates: ObservationUpdates,
): Promise<Observation | undefined> {
  return wrapDb(async () => {
    const db = getDb();
    await db.observations.update(localId, {
      ...updates,
      updatedAt: timestamp(),
    });
    return db.observations.get(localId);
  });
}

export async function deleteObservation(localId: string): Promise<void> {
  return wrapDb(async () => {
    const db = getDb();
    await db.transaction('rw', [db.observations, db.attachments], async () => {
      await db.attachments.where('observationLocalId').equals(localId).delete();
      await db.observations.delete(localId);
    });
  });
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export interface CreateAlertInput {
  projectLocalId: string;
}

export async function createAlert(input: CreateAlertInput): Promise<Alert> {
  return wrapDb(async () => {
    const db = getDb();
    const project = await db.projects.get(input.projectLocalId);
    if (!project) {
      throw new DbError(
        'FK_VIOLATION',
        `Project with localId "${input.projectLocalId}" does not exist`,
      );
    }
    const alert: Alert = {
      localId: uuid(),
      projectLocalId: input.projectLocalId,
      ...localMeta(),
    };
    await db.alerts.add(alert);
    return alert;
  });
}

export async function getAlerts(projectLocalId: string): Promise<Alert[]> {
  return wrapDb(async () => {
    const db = getDb();
    return db.alerts
      .where('projectLocalId')
      .equals(projectLocalId)
      .filter((a) => !a.deleted)
      .toArray();
  });
}

export async function getAlert(localId: string): Promise<Alert | undefined> {
  return wrapDb(async () => {
    const db = getDb();
    return db.alerts.get(localId);
  });
}

export async function updateAlert(
  localId: string,
  updates: AlertUpdates,
): Promise<Alert | undefined> {
  return wrapDb(async () => {
    const db = getDb();
    await db.alerts.update(localId, { ...updates, updatedAt: timestamp() });
    return db.alerts.get(localId);
  });
}

export async function deleteAlert(localId: string): Promise<void> {
  return wrapDb(async () => {
    const db = getDb();
    await db.alerts.delete(localId);
  });
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
  return wrapDb(async () => {
    const db = getDb();
    const project = await db.projects.get(input.projectLocalId);
    if (!project) {
      throw new DbError(
        'FK_VIOLATION',
        `Project with localId "${input.projectLocalId}" does not exist`,
      );
    }
    const observation = await db.observations.get(input.observationLocalId);
    if (!observation) {
      throw new DbError(
        'FK_VIOLATION',
        `Observation with localId "${input.observationLocalId}" does not exist`,
      );
    }
    const attachment: Attachment = {
      localId: uuid(),
      ...input,
      ...localMeta(),
    };
    await db.attachments.add(attachment);
    return attachment;
  });
}

export async function getAttachments(
  observationLocalId: string,
): Promise<Attachment[]> {
  return wrapDb(async () => {
    const db = getDb();
    return db.attachments
      .where('observationLocalId')
      .equals(observationLocalId)
      .toArray();
  });
}

export async function getAttachmentsForProject(
  projectLocalId: string,
): Promise<Attachment[]> {
  return wrapDb(async () => {
    const db = getDb();
    return db.attachments
      .where('projectLocalId')
      .equals(projectLocalId)
      .toArray();
  });
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
  return wrapDb(async () => {
    const db = getDb();
    const server: RemoteServer = {
      id: uuid(),
      baseUrl: input.baseUrl,
      label: input.label,
      status: input.status ?? 'idle',
      lastSyncedAt: '',
    };
    await db.remoteServers.add(server);
    return server;
  });
}

export async function getRemoteServers(): Promise<RemoteServer[]> {
  return wrapDb(async () => {
    const db = getDb();
    return db.remoteServers.toArray();
  });
}

export async function getRemoteServer(
  id: string,
): Promise<RemoteServer | undefined> {
  return wrapDb(async () => {
    const db = getDb();
    return db.remoteServers.get(id);
  });
}

export async function getRemoteServerByBaseUrl(
  baseUrl: string,
): Promise<RemoteServer | undefined> {
  return wrapDb(async () => {
    const db = getDb();
    return db.remoteServers.where('baseUrl').equals(baseUrl).first();
  });
}

export async function updateRemoteServer(
  id: string,
  updates: Partial<RemoteServer>,
): Promise<RemoteServer | undefined> {
  return wrapDb(async () => {
    const db = getDb();
    await db.remoteServers.update(id, updates);
    return db.remoteServers.get(id);
  });
}

export async function deleteRemoteServer(id: string): Promise<void> {
  return wrapDb(async () => {
    const db = getDb();
    await db.remoteServers.delete(id);
  });
}

// ---------------------------------------------------------------------------
// Sync Metadata
// ---------------------------------------------------------------------------

export async function getSyncMetadata(): Promise<SyncMetadata[]> {
  return wrapDb(async () => {
    const db = getDb();
    return db.syncMetadata.toArray();
  });
}

export async function upsertSyncMetadata(
  meta: SyncMetadata,
): Promise<SyncMetadata> {
  return wrapDb(async () => {
    const db = getDb();
    await db.syncMetadata.put(meta);
    return meta;
  });
}
