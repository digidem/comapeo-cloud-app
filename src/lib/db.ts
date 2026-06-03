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
  iconRef?: {
    docId: string;
    name?: string;
    contentType?: string;
  };
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
  versionId?: string;
  originalVersionId?: string;
  schemaName?: string;
  links?: string[];
  tags?: Record<string, string>;
  metadata?: Record<string, unknown>;
  presetRefDocId?: string;
  presetRef?: RemoteDocRef;
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
  sourceDocId?: string;
  driveId?: string;
  type?: string;
  name?: string;
  hash?: string;
  remoteUrl?: string;
  resolvedUrl?: string;
  mediaType?: 'photo' | 'audio' | 'unknown';
  contentType?: string;
  downloadStatus?: 'remote-only' | 'available' | 'failed';
  createdAt: string;
  updatedAt: string;
  dirtyLocal: boolean;
  deleted: boolean;
}

export interface TrackLocation {
  coords: {
    latitude: number;
    longitude: number;
  };
  timestamp?: string;
  createdAt?: string;
  accuracy?: number;
  altitude?: number;
}

export interface RemoteDocRef {
  docId: string;
  versionId?: string;
  url?: string;
}

export interface Track {
  localId: string;
  projectLocalId: string;
  sourceType: string;
  sourceId: string;
  remoteId?: string;
  versionId?: string;
  originalVersionId?: string;
  schemaName?: string;
  links?: string[];
  tags?: Record<string, unknown>;
  presetRefDocId?: string;
  presetRef?: RemoteDocRef;
  locations: TrackLocation[];
  observationRefs: RemoteDocRef[];
  createdAt: string;
  updatedAt: string;
  dirtyLocal: boolean;
  deleted: boolean;
}

export interface FieldOption {
  label: string;
  value: string;
}

export interface Field {
  localId: string;
  projectLocalId: string;
  sourceType: string;
  sourceId: string;
  remoteId?: string;
  versionId?: string;
  originalVersionId?: string;
  schemaName?: string;
  links?: string[];
  type: string;
  key: string;
  label: string;
  placeholder?: string;
  universal: boolean;
  options?: FieldOption[];
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
  tags?: Record<string, unknown>;
  terms: string[];
  fieldRefs: string[];
  createdAt: string;
  updatedAt: string;
  dirtyLocal: boolean;
  deleted: boolean;
}

/**
 * Locally cached category icon blob, keyed by the icon's authenticated URL.
 *
 * Icons are small, immutable-per-docId assets fetched from the archive with
 * Authorization headers. Caching the decoded blob lets the UI render them
 * instantly on subsequent loads instead of re-fetching on every render.
 */
export interface CachedIcon {
  url: string;
  /**
   * Raw icon bytes. Stored as an ArrayBuffer (not a Blob) so the record
   * round-trips through every structured-clone implementation, including the
   * fake-indexeddb used in tests. The Blob is reconstructed on read.
   */
  data: ArrayBuffer;
  contentType?: string;
  /** Timestamp when the icon was cached. Reserved for future TTL-based eviction. */
  cachedAt: string;
}

// ---------------------------------------------------------------------------
// Database class
// ---------------------------------------------------------------------------

class AppDatabase extends Dexie {
  projects!: EntityTable<Project, 'localId'>;
  observations!: EntityTable<Observation, 'localId'>;
  alerts!: EntityTable<Alert, 'localId'>;
  attachments!: EntityTable<Attachment, 'localId'>;
  tracks!: EntityTable<Track, 'localId'>;
  fields!: EntityTable<Field, 'localId'>;
  remoteServers!: EntityTable<RemoteServer, 'id'>;
  syncMetadata!: EntityTable<SyncMetadata, 'id'>;
  presets!: EntityTable<Preset, 'localId'>;
  iconCache!: EntityTable<CachedIcon, 'url'>;

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
        '&localId, projectLocalId, [projectLocalId+remoteId], [sourceType+sourceId+remoteId], [dirtyLocal+updatedAt]',
    });

    // v8: shape-preserving no-op upgrade.
    //
    // A previous iteration of this branch folded the v9 work into a revised
    // v8, which caused Dexie to reject open() for any user whose IndexedDB
    // was at v9 (the version the post-#67 main build writes) with
    // `VersionError: The requested version (8) is less than the existing
    // version (9)`. We keep v8 as a no-op so users upgrading from the v9
    // main build pass through cleanly, then put the actual schema and data
    // changes in v10 below. See: Greptile P1 review on PR #63.
    this.version(8).upgrade(() => {
      // no-op: schema and data shape are unchanged from main's v9
    });

    // v9 from main is preserved by reference (string → RemoteDocRef
    // coercion for Track.presetRef / Track.observationRefs). Re-declared
    // here only as a passing-through upgrade so that the version number
    // sequence (8 → 9 → 10) is monotonic for users on any prior build.
    this.version(9).upgrade(async (tx) => {
      const table = tx.table('tracks');
      await table.toCollection().modify((track: Record<string, unknown>) => {
        if (typeof track.presetRef === 'string') {
          track.presetRef = { docId: track.presetRef };
        }
        if (Array.isArray(track.observationRefs)) {
          track.observationRefs = track.observationRefs.map((ref) =>
            typeof ref === 'string' ? { docId: ref } : ref,
          );
        }
      });
    });

    // v10: sync resource v2 (comapeo-cloud 0.4) — adds the v2 sync indexes
    // and the observation/attachment field migrations introduced by PR #63.
    // Safe for users already on main's v9: the string→ref coercion has
    // already been applied, so the tracks migration block is a no-op for
    // them.
    this.version(10)
      .stores({
        observations:
          '&localId, projectLocalId, [sourceType+sourceId+remoteId], [projectLocalId+presetRefDocId], [dirtyLocal+updatedAt]',
        attachments:
          '&localId, projectLocalId, observationLocalId, [sourceType+sourceId+remoteId], [projectLocalId+mediaType], [observationLocalId+mediaType]',
        tracks:
          '&localId, projectLocalId, [projectLocalId+remoteId], [sourceType+sourceId+remoteId], [projectLocalId+presetRefDocId], [dirtyLocal+updatedAt]',
        fields:
          '&localId, projectLocalId, [projectLocalId+remoteId], [sourceType+sourceId+remoteId], [projectLocalId+key], [dirtyLocal+updatedAt]',
      })
      .upgrade(async (tx) => {
        // Defensive: re-apply the string→ref migration in case a user
        // skipped main's v9 (e.g., they were on a pre-#67 build that
        // landed v10 directly).
        await tx
          .table('tracks')
          .toCollection()
          .modify((track: Record<string, unknown>) => {
            if (typeof track.presetRef === 'string') {
              track.presetRef = { docId: track.presetRef };
            }
            if (Array.isArray(track.observationRefs)) {
              track.observationRefs = track.observationRefs.map((ref) =>
                typeof ref === 'string' ? { docId: ref } : ref,
              );
            }
          });
        await tx
          .table('observations')
          .toCollection()
          .modify((obs: Record<string, unknown>) => {
            if (!('metadata' in obs)) obs.metadata = undefined;
            if (!('versionId' in obs)) obs.versionId = undefined;
            if (!('originalVersionId' in obs)) {
              obs.originalVersionId = undefined;
            }
            if (!('schemaName' in obs)) obs.schemaName = undefined;
            if (!('links' in obs)) obs.links = undefined;
            if (!('presetRef' in obs)) obs.presetRef = undefined;
            if (!('presetRefDocId' in obs)) {
              const tags = obs.tags;
              obs.presetRefDocId =
                tags &&
                typeof tags === 'object' &&
                !Array.isArray(tags) &&
                typeof (tags as Record<string, unknown>).presetRefDocId ===
                  'string'
                  ? (tags as Record<string, string>).presetRefDocId
                  : undefined;
            }
          });
        await tx
          .table('attachments')
          .toCollection()
          .modify((attachment: Record<string, unknown>) => {
            if (!('sourceDocId' in attachment)) {
              attachment.sourceDocId = attachment.remoteId;
            }
            if (!('driveId' in attachment)) attachment.driveId = undefined;
            if (!('type' in attachment)) attachment.type = undefined;
            if (!('name' in attachment)) attachment.name = undefined;
            if (!('hash' in attachment)) attachment.hash = undefined;
            if (!('remoteUrl' in attachment)) attachment.remoteUrl = undefined;
            if (!('resolvedUrl' in attachment)) {
              attachment.resolvedUrl = undefined;
            }
            if (!('mediaType' in attachment)) attachment.mediaType = undefined;
            if (!('contentType' in attachment)) {
              attachment.contentType = undefined;
            }
            if (!('downloadStatus' in attachment)) {
              attachment.downloadStatus = undefined;
            }
          });
      });

    // v11: add the iconCache key-value table for storing category icon blobs
    // locally (keyed by authenticated icon URL). Purely additive — no existing
    // table or record shape changes, so users on any prior version upgrade
    // cleanly.
    this.version(11).stores({
      iconCache: '&url',
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

// ---------------------------------------------------------------------------
// Icon cache helpers
// ---------------------------------------------------------------------------

/**
 * Return the cached icon blob for the given authenticated icon URL, or
 * `undefined` if it has not been cached yet.
 */
export async function getCachedIconBlob(
  url: string,
): Promise<Blob | undefined> {
  if (!url) return undefined;
  const db = getDb();
  const row = await db.iconCache.get(url);
  if (!row) return undefined;
  return new Blob([row.data], { type: row.contentType ?? '' });
}

/**
 * Store (or overwrite) the icon blob for the given authenticated icon URL.
 */
export async function putCachedIconBlob(
  url: string,
  blob: Blob,
  contentType?: string,
): Promise<void> {
  if (!url) return;
  const data = await blob.arrayBuffer();
  const db = getDb();
  await db.iconCache.put({
    url,
    data,
    contentType: contentType ?? (blob.type || undefined),
    cachedAt: new Date().toISOString(),
  });
}
