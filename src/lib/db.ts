import Dexie, { type EntityTable } from 'dexie';

import { normalizeArchiveBaseUrl } from '@/lib/archive-proxy';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Project {
  localId: string;
  sourceType: string;
  sourceId: string;
  remoteId?: string;
  name?: string;
  description?: string;
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
  remoteSourceId?: string;
  geometry?: { type: string; coordinates: unknown };
  metadata?: Record<string, unknown>;
  detectionDateStart?: string;
  detectionDateEnd?: string;
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
  token?: string;
  status: string;
  lastSyncedAt: string;
}

export interface SyncMetadata {
  id: string;
  serverId: string;
  status: string;
  updatedAt: string;
}

export interface Preset {
  localId: string;
  projectLocalId: string;
  sourceType: string;
  sourceId: string;
  remoteId?: string;
  name: string;
  color?: string;
  iconDocId?: string;
  terms: string[];
  fieldRefs: string[];
  createdAt: string;
  updatedAt: string;
  dirtyLocal: boolean;
  deleted: boolean;
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
  presets!: EntityTable<Preset, 'localId'>;

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

    this.version(4).upgrade(async (tx) => {
      const table = tx.table('projects');
      await table.toCollection().modify((proj: Record<string, unknown>) => {
        if (!('description' in proj)) proj.description = undefined;
      });
    });

    this.version(5).upgrade(async (tx) => {
      const table = tx.table('remoteServers');
      await table.toCollection().modify((srv: Record<string, unknown>) => {
        if (!('token' in srv)) srv.token = undefined;
      });
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

    // Rekey remoteArchive rows from `<sourceType>:<serverId>:<remoteId>`
    // to `<sourceType>:<normalizedBaseUrl>:<remoteId>` so re-adding the
    // same archive (different serverId, same baseUrl) does not duplicate rows.
    this.version(6).upgrade(async (tx) => {
      const servers = (await tx.table('remoteServers').toArray()) as Array<{
        id: string;
        baseUrl: string;
      }>;
      const serverIdToKey = new Map<string, string>();
      for (const s of servers) {
        const result = normalizeArchiveBaseUrl(s.baseUrl);
        const key = result.ok
          ? result.value
          : (s.baseUrl ?? '').trim().replace(/\/+$/, '');
        if (key) serverIdToKey.set(s.id, key);
      }
      if (serverIdToKey.size === 0) return;

      const rekey = async (
        tableName: string,
        projectKeyMap?: Map<string, string>,
        observationKeyMap?: Map<string, string>,
      ): Promise<Map<string, string>> => {
        const tbl = tx.table(tableName);
        const rows = (await tbl.toArray()) as Array<Record<string, unknown>>;
        const oldKeys: string[] = [];
        const newRows: Array<Record<string, unknown>> = [];
        const mapping = new Map<string, string>();
        for (const row of rows) {
          if (row.sourceType !== 'remoteArchive') continue;
          const newKey = serverIdToKey.get(row.sourceId as string);
          if (!newKey || !row.remoteId) continue;
          const oldLocalId = row.localId as string;
          const newLocalId = `remoteArchive:${newKey}:${row.remoteId}`;
          if (oldLocalId === newLocalId) continue;
          mapping.set(oldLocalId, newLocalId);
          oldKeys.push(oldLocalId);
          const newRow: Record<string, unknown> = {
            ...row,
            localId: newLocalId,
          };
          if (projectKeyMap && typeof row.projectLocalId === 'string') {
            newRow.projectLocalId =
              projectKeyMap.get(row.projectLocalId) ?? row.projectLocalId;
          }
          if (observationKeyMap && typeof row.observationLocalId === 'string') {
            newRow.observationLocalId =
              observationKeyMap.get(row.observationLocalId) ??
              row.observationLocalId;
          }
          newRows.push(newRow);
        }
        if (oldKeys.length > 0) {
          await tbl.bulkDelete(oldKeys);
          await tbl.bulkPut(newRows);
        }
        return mapping;
      };

      const projectKeyMap = await rekey('projects');
      const observationKeyMap = await rekey('observations', projectKeyMap);
      await rekey('alerts', projectKeyMap);
      await rekey('attachments', projectKeyMap, observationKeyMap);
    });

    this.version(7).stores({
      presets:
        '&localId, projectLocalId, [sourceType+sourceId+remoteId], [dirtyLocal+updatedAt]',
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
