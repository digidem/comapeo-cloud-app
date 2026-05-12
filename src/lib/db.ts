import Dexie, { type EntityTable } from 'dexie';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Project {
  localId: string;
  sourceType: string;
  sourceId: string;
  remoteId?: string;
  name?: string;
  serverUrl?: string;
  createdAt: string;
  updatedAt: string;
  dirtyLocal: boolean;
  deleted: boolean;
}

export interface Observation {
  localId: string;
  projectLocalId: string;
  sourceType: string;
  sourceId: string;
  remoteId?: string;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  createdAt: string;
  updatedAt: string;
  dirtyLocal: boolean;
  deleted: boolean;
}

export interface Alert {
  localId: string;
  projectLocalId: string;
  sourceType: string;
  sourceId: string;
  remoteId?: string;
  createdAt: string;
  updatedAt: string;
  dirtyLocal: boolean;
  deleted: boolean;
}

export interface Attachment {
  localId: string;
  projectLocalId: string;
  observationLocalId: string;
  sourceType: string;
  sourceId: string;
  remoteId?: string;
  createdAt: string;
  updatedAt: string;
  dirtyLocal: boolean;
  deleted: boolean;
}

export interface RemoteServer {
  id: string;
  baseUrl: string;
  label?: string;
  status: string;
  lastSyncedAt: string;
}

export interface SyncMetadata {
  id: string;
  serverId: string;
  status: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Database class
// ---------------------------------------------------------------------------

class AppDatabase extends Dexie {
  projects!: EntityTable<Project, 'localId'>;
  observations!: EntityTable<Observation, 'localId'>;
  alerts!: EntityTable<Alert, 'localId'>;
  attachments!: EntityTable<Attachment, 'localId'>;
  remoteServers!: EntityTable<RemoteServer, 'id'>;
  syncMetadata!: EntityTable<SyncMetadata, 'id'>;

  constructor() {
    super('comapeo-cloud-app');

    this.version(1).stores({
      projects:
        '&localId, [sourceType+sourceId+remoteId], [sourceType+sourceId+updatedAt], [dirtyLocal+updatedAt]',
      observations:
        '&localId, projectLocalId, [sourceType+sourceId+remoteId], [dirtyLocal+updatedAt]',
      alerts:
        '&localId, projectLocalId, [sourceType+sourceId+remoteId], [dirtyLocal+updatedAt]',
      attachments:
        '&localId, projectLocalId, observationLocalId, [sourceType+sourceId+remoteId]',
      remoteServers: '&id, baseUrl, status, lastSyncedAt',
      syncMetadata: '&id, serverId, status, updatedAt',
    });

    this.version(3).stores({
      projects:
        '&localId, [sourceType+sourceId+remoteId], [sourceType+sourceId+updatedAt], [dirtyLocal+updatedAt], serverUrl',
      observations:
        '&localId, projectLocalId, [sourceType+sourceId+remoteId], [dirtyLocal+updatedAt]',
      alerts:
        '&localId, projectLocalId, [sourceType+sourceId+remoteId], [dirtyLocal+updatedAt]',
      attachments:
        '&localId, projectLocalId, observationLocalId, [sourceType+sourceId+remoteId]',
      remoteServers: '&id, baseUrl, status, lastSyncedAt',
      syncMetadata: '&id, serverId, status, updatedAt',
    });

    this.version(2).upgrade(async (tx) => {
      // Backfill `lat` and `lon` as `undefined` on existing observation
      // records that lack these fields so that downstream code can safely
      // check `o.lat !== undefined` without worrying about missing keys.
      const table = tx.table('observations');
      await table.toCollection().modify((obs: Record<string, unknown>) => {
        if (!('lat' in obs)) obs.lat = undefined;
        if (!('lon' in obs)) obs.lon = undefined;
      });
    });
  }
}

export type { AppDatabase };

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _db: AppDatabase | null = null;

export function getDb(): AppDatabase {
  if (!_db) {
    _db = new AppDatabase();
  }
  return _db;
}

// ---------------------------------------------------------------------------
// Reset helper (for tests)
// ---------------------------------------------------------------------------

export async function resetDb(): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });
}
