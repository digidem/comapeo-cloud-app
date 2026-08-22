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
  /**
   * The currently active saved map for this project, or `null` when cleared.
   * Not indexed (schemaless field), so adding it does not require a Dexie
   * version bump. Nullable (not `undefined`) so `setActiveMap` can write
   * `null` to clear it under strict TypeScript.
   */
  activeMapId?: string | null;
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
  lastSuccessfulSyncAt?: string;
  onboardingStatus?: string;
  errorMessage?: string;
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

/**
 * A saved offline map authored within a project.
 *
 * Created in Phase 1b's authoring UI and downloaded to a styled-map-package
 * blob in Phase 1c. This is the foundation data model that every later phase
 * of the offline-map feature (#70) builds on.
 */
export interface SavedMap {
  id: string; // crypto.randomUUID()
  projectLocalId: string; // Origin project
  name: string; // Non-empty after validation
  type: 'raster' | 'style';
  origin?: 'authored' | 'imported'; // Optional for backwards compatibility
  styleUrl: string;
  bbox: [number, number, number, number]; // [west, south, east, north]
  minZoom: number; // Default 0
  maxZoom: number; // Default 14
  attribution?: string;
  scheme?: 'xyz' | 'tms'; // Raster only
  /** Legacy/runtime SMP blob. New package bytes live in the mapPackages table. */
  smpBlob?: Blob;
  smpSize?: number; // SMP byte length
  status: 'draft' | 'downloading' | 'ready' | 'error';
  errorMessage?: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/** SMP package metadata stored separately from map-list metadata. */
export interface SavedMapPackage {
  mapId: string;
  /**
   * Legacy v13 whole-package bytes. New writes use chunk rows so large imports
   * never have to materialize the entire package in JavaScript heap at once.
   */
  data?: ArrayBuffer;
  contentType: string;
  size?: number;
  chunkSize?: number;
  chunkCount?: number;
  updatedAt: string;
}

/** One portable ArrayBuffer chunk of an SMP package. */
export interface SavedMapPackageChunk {
  id: string;
  mapId: string;
  index: number;
  data: ArrayBuffer;
}

export interface SavedMapPackageSource {
  size: number;
  read: (offset: number, length: number) => Promise<Uint8Array>;
}

/**
 * A local Case — a bounded, investigatory grouping of observations/alerts for a
 * single owning project. Cases are created and edited fully offline; no remote
 * Case sync is enabled in this foundation (#268).
 *
 * The `remoteProjectNamespace` / `remoteProjectId` fields are *derived* from the
 * owning project when it originates from a remote archive. They are stored
 * alongside the Case for provenance only — they do NOT enable remote Case sync.
 */
export type CaseStatus = 'draft' | 'active' | 'closed';

export type CaseType =
  | 'invasion_occupation'
  | 'territorial_encroachment'
  | 'deforestation_logging'
  | 'illegal_mining'
  | 'fire'
  | 'wildlife_exploitation'
  | 'pollution_contamination'
  | 'threats_violence'
  | 'rights_violation'
  | 'other';

export interface Case {
  localId: string; // crypto.randomUUID()
  projectLocalId: string; // Owning project
  title: string;
  caseType: CaseType;
  status: CaseStatus;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  revision: number;
  createdBy: string;
  deleted: boolean;
  /** Source scope of the owning project (e.g. 'remoteArchive'), copied at creation. Undefined for local projects. */
  remoteProjectNamespace?: string;
  /** Remote project id from the owning project, copied at creation. Undefined for local projects. */
  remoteProjectId?: string;
}

/**
 * Metadata-only activity event tied to a Case lifecycle. Activity NEVER stores
 * Case factual content, report text, prompts, transcripts, media, or fabricated
 * actor names. Only opaque ids, timestamps, and count/status-like metadata.
 */
export type CaseActivityEvent =
  | 'created'
  | 'status_changed'
  | 'reopened'
  | 'report_state_changed'
  | 'deleted';

export type CaseAgency = 'FUNAI' | 'IBAMA' | 'MPF' | 'PF';

export interface CaseActivity {
  localId: string; // crypto.randomUUID()
  caseLocalId: string;
  projectLocalId: string;
  event: CaseActivityEvent;
  /**
   * Opaque metadata-only payload. May carry status/agency/count-like values but
   * never Case facts, report bodies, prompts, transcripts, media, or actor names.
   */
  status?: CaseStatus;
  agency?: CaseAgency;
  count?: number;
  createdAt: string; // ISO 8601
}

/**
 * Independent per-agency report *state* foundation. Each Case holds one row per
 * agency (FUNAI/IBAMA/MPF/PF). This stores ONLY status/configuration/provenance
 * placeholders needed by future report scopes. It deliberately does NOT store
 * report bodies, templates, AI prompts, disclosure payloads, PDFs, or provider
 * credentials.
 */
export interface CaseReportState {
  localId: string; // crypto.randomUUID() — primary key
  caseLocalId: string;
  projectLocalId: string;
  agency: CaseAgency;
  status: 'incomplete' | 'complete' | 'error';
  /** Number of records this agency's report covers, when known. */
  count?: number;
  revision: number;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
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
  maps!: EntityTable<SavedMap, 'id'>;
  mapPackages!: EntityTable<SavedMapPackage, 'mapId'>;
  mapPackageChunks!: EntityTable<SavedMapPackageChunk, 'id'>;
  cases!: EntityTable<Case, 'localId'>;
  caseActivity!: EntityTable<CaseActivity, 'localId'>;
  caseReportState!: EntityTable<CaseReportState, 'localId'>;

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

    // v12: add the maps table for saved offline maps (offline-map authoring
    // feature #70, Phase 1a). Purely additive — no existing table or record
    // shape changes, so no upgrade function is needed and users on any prior
    // version upgrade cleanly. Matches the additive iconCache pattern in v11.
    this.version(12).stores({
      maps: '&id, projectLocalId, [projectLocalId+updatedAt], status',
    });

    // v13: store SMP package bytes separately from map metadata. ArrayBuffer is
    // portable across the Playwright browser engines, and separating package
    // bytes keeps map-list queries from eagerly materializing large offline maps.
    // Legacy map rows with smpBlob remain readable through getSavedMapSmpBlob().
    this.version(13).stores({
      mapPackages: '&mapId',
    });

    // v14: chunk new package writes so large File/Blob imports stay bounded in
    // heap even on WebKit, which cannot persist Blob values in IndexedDB.
    // Existing v13 whole-package ArrayBuffer records remain readable.
    this.version(14).stores({
      mapPackageChunks: '&id, mapId, [mapId+index]',
    });

    // v15: Case data foundation for #268. Purely additive — introduces the
    // `cases` table, metadata-only `caseActivity`, and per-agency `caseReportState`
    // foundation. No existing table or record shape is changed, so users on
    // any prior version upgrade cleanly. These tables are local-only: they do
    // NOT enable remote Case sync (#275) and contain no sync/tombstone columns.
    this.version(15).stores({
      cases:
        '&localId, projectLocalId, [projectLocalId+status], [projectLocalId+updatedAt]',
      caseActivity: '&localId, caseLocalId, projectLocalId, event, createdAt',
      caseReportState:
        '&localId, caseLocalId, projectLocalId, agency, [caseLocalId+agency], [projectLocalId+agency]',
    });
  }
}

export type { AppDatabase };

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _db: AppDatabase | null = null;
let storageResetQuiesced = false;

export function getDb(): AppDatabase {
  if (!_db) {
    if (storageResetQuiesced) {
      throw new Error('Primary database is quiesced for local-data reset.');
    }
    _db = new AppDatabase();
  }
  return _db;
}

const MAP_PACKAGE_CHUNK_SIZE = 4 * 1024 * 1024;

export function getMapPackageChunkId(mapId: string, index: number): string {
  return `${mapId}:${index}`;
}

function throwIfPackageWriteAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Package persistence cancelled', 'AbortError');
  }
}

async function writeSavedMapPackageChunks(
  db: AppDatabase,
  mapId: string,
  blob: Blob,
  updatedAt: string,
  signal?: AbortSignal,
): Promise<void> {
  await db.mapPackageChunks.where('mapId').equals(mapId).delete();

  const chunkCount = Math.ceil(blob.size / MAP_PACKAGE_CHUNK_SIZE);

  // Keep at most one chunk's ArrayBuffer in heap at a time. Promise.all here
  // would recreate the whole-file memory spike this chunked format is designed
  // to avoid for large offline map packages.
  const writeChunk = async (index: number): Promise<void> => {
    throwIfPackageWriteAborted(signal);
    if (index >= chunkCount) return;
    const start = index * MAP_PACKAGE_CHUNK_SIZE;
    const end = Math.min(start + MAP_PACKAGE_CHUNK_SIZE, blob.size);
    const data = await Dexie.waitFor(blob.slice(start, end).arrayBuffer());
    throwIfPackageWriteAborted(signal);
    await db.mapPackageChunks.put({
      id: getMapPackageChunkId(mapId, index),
      mapId,
      index,
      data,
    });
    throwIfPackageWriteAborted(signal);
    await writeChunk(index + 1);
  };
  await writeChunk(0);
  throwIfPackageWriteAborted(signal);

  await db.mapPackages.put({
    mapId,
    contentType: blob.type || 'application/zip',
    size: blob.size,
    chunkSize: MAP_PACKAGE_CHUNK_SIZE,
    chunkCount,
    updatedAt,
  });
}

/** Atomically create a map row and its chunked SMP package. */
export async function addSavedMapWithPackage(
  map: SavedMap,
  blob: Blob,
): Promise<void> {
  const db = getDb();
  await db.transaction(
    'rw',
    [db.maps, db.mapPackages, db.mapPackageChunks],
    async () => {
      await db.maps.add(map);
      await writeSavedMapPackageChunks(db, map.id, blob, map.updatedAt);
    },
  );
}

/** Atomically replace an existing map package and update its map metadata. */
export async function updateSavedMapWithPackage(
  mapId: string,
  blob: Blob,
  updates: Partial<SavedMap>,
  signal?: AbortSignal,
): Promise<void> {
  const db = getDb();
  await db.transaction(
    'rw',
    [db.maps, db.mapPackages, db.mapPackageChunks],
    async () => {
      const existingMap = await db.maps.get(mapId);
      if (!existingMap) throw new Error('Map no longer exists');

      const updatedAt = updates.updatedAt ?? new Date().toISOString();
      await writeSavedMapPackageChunks(db, mapId, blob, updatedAt, signal);
      throwIfPackageWriteAborted(signal);
      await db.maps.update(mapId, { ...updates, updatedAt });
    },
  );
}

/** Check package availability and basic integrity without hydrating current v14 bytes. */
export async function hasSavedMapSmpPackage(
  map: Pick<SavedMap, 'id' | 'smpBlob' | 'smpSize'>,
): Promise<boolean> {
  if (map.smpBlob) return true;

  const db = getDb();
  const storedPackage = await db.mapPackages.get(map.id);
  if (!storedPackage) return false;

  if (storedPackage.data) {
    return (
      storedPackage.data.byteLength > 0 &&
      (map.smpSize === undefined ||
        storedPackage.data.byteLength === map.smpSize)
    );
  }

  const storedChunkCount = await db.mapPackageChunks
    .where('mapId')
    .equals(map.id)
    .count();
  const expectedChunkCount = storedPackage.chunkCount;
  const expectedSize = storedPackage.size ?? map.smpSize;
  const sizeMatchesMap =
    map.smpSize === undefined ||
    storedPackage.size === undefined ||
    storedPackage.size === map.smpSize;
  return (
    expectedChunkCount !== undefined &&
    expectedSize !== undefined &&
    expectedSize > 0 &&
    sizeMatchesMap &&
    storedChunkCount === expectedChunkCount
  );
}

/**
 * Return a random-access package source. New chunked packages read only the
 * chunks needed for each ZIP range request; legacy v13 whole-buffer records and
 * pre-v13 Blob-backed map rows remain readable.
 */
export async function getSavedMapPackageSource(
  map: Pick<SavedMap, 'id' | 'smpBlob' | 'smpSize'>,
): Promise<SavedMapPackageSource | undefined> {
  if (map.smpBlob) {
    return {
      size: map.smpBlob.size,
      read: async (offset, length) =>
        new Uint8Array(
          await map.smpBlob!.slice(offset, offset + length).arrayBuffer(),
        ),
    };
  }

  const db = getDb();
  const storedPackage = await db.mapPackages.get(map.id);
  if (!storedPackage) return undefined;

  if (storedPackage.data) {
    const data = storedPackage.data;
    return {
      size: data.byteLength,
      read: async (offset, length) =>
        new Uint8Array(
          data.slice(offset, Math.min(offset + length, data.byteLength)),
        ),
    };
  }

  const size = storedPackage.size ?? map.smpSize;
  const chunkSize = storedPackage.chunkSize;
  if (size === undefined || !chunkSize || chunkSize <= 0) return undefined;

  return {
    size,
    read: async (offset, length) => {
      if (offset < 0 || length <= 0 || offset >= size) return new Uint8Array(0);
      const end = Math.min(offset + length, size);
      const output = new Uint8Array(end - offset);
      const firstChunk = Math.floor(offset / chunkSize);
      const lastChunk = Math.floor((end - 1) / chunkSize);
      let outputOffset = 0;
      const indexes = Array.from(
        { length: lastChunk - firstChunk + 1 },
        (_, position) => firstChunk + position,
      );
      const chunkCount = storedPackage.chunkCount;
      if (chunkCount === undefined || lastChunk >= chunkCount) {
        throw new Error('SMP package chunk metadata is inconsistent');
      }

      const chunks = await db.mapPackageChunks.bulkGet(
        indexes.map((index) => getMapPackageChunkId(map.id, index)),
      );

      chunks.forEach((chunk, position) => {
        const index = indexes[position]!;
        if (!chunk) throw new Error(`SMP package chunk ${index} is missing`);

        const chunkStart = index * chunkSize;
        const expectedChunkLength =
          index === chunkCount - 1 ? size - chunkStart : chunkSize;
        if (chunk.data.byteLength !== expectedChunkLength) {
          throw new Error(`SMP package chunk ${index} has an invalid length`);
        }

        const from = Math.max(offset, chunkStart) - chunkStart;
        const to = Math.min(end, chunkStart + expectedChunkLength) - chunkStart;
        const part = new Uint8Array(chunk.data, from, to - from);
        output.set(part, outputOffset);
        outputOffset += part.byteLength;
      });

      if (outputOffset !== output.byteLength) {
        throw new Error('SMP package range is incomplete');
      }
      return output;
    },
  };
}

/** Load the full SMP package only for explicit Blob consumers such as export. */
export async function getSavedMapSmpBlob(
  map: Pick<SavedMap, 'id' | 'smpBlob'>,
): Promise<Blob | undefined> {
  if (map.smpBlob) return map.smpBlob;
  const db = getDb();
  const storedPackage = await db.mapPackages.get(map.id);
  if (!storedPackage) return undefined;
  if (storedPackage.data) {
    return new Blob([storedPackage.data], {
      type: storedPackage.contentType || 'application/zip',
    });
  }

  const chunks = await db.mapPackageChunks
    .where('mapId')
    .equals(map.id)
    .sortBy('index');
  if (
    storedPackage.chunkCount !== undefined &&
    chunks.length !== storedPackage.chunkCount
  ) {
    throw new Error('SMP package chunks are incomplete');
  }
  if (chunks.length === 0 && (storedPackage.size ?? 0) > 0) {
    throw new Error('SMP package chunks are missing');
  }
  return new Blob(
    chunks.map((chunk) => chunk.data),
    { type: storedPackage.contentType || 'application/zip' },
  );
}

/** Fetch one map and attach its package blob for explicit full-Blob consumers. */
export async function getSavedMapWithSmpBlob(
  mapId: string,
): Promise<SavedMap | undefined> {
  const map = await getDb().maps.get(mapId);
  if (!map) return undefined;
  const smpBlob = await getSavedMapSmpBlob(map);
  return smpBlob ? { ...map, smpBlob } : map;
}

/**
 * Re-enable the app-owned singleton after reset coordination has established a
 * safe non-reset startup state. A full page reload naturally resets this module,
 * but keeping the lifecycle explicit also makes same-page recovery deterministic.
 */
export function resumeDbAfterStorageReset(): void {
  if (!storageResetQuiesced) return;
  _db?.close();
  _db = null;
  storageResetQuiesced = false;
}

// ---------------------------------------------------------------------------
// Reset helper (for tests)
// ---------------------------------------------------------------------------

async function clearDatabaseTables(db: AppDatabase): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });
}

export async function resetDb(): Promise<void> {
  if (storageResetQuiesced) {
    await resetDbIsolated();
    return;
  }

  const db = getDb();
  if (!db.isOpen()) {
    await resetDbIsolated();
    return;
  }
  await clearDatabaseTables(db);
}

/**
 * Quiesce this tab's primary database connection during a cross-tab reset.
 * Dexie 4 keeps an explicitly closed connection closed until `open()` is called,
 * so app code cannot transparently auto-open it and enqueue stale writes.
 */
export function closeDbForStorageReset(): void {
  storageResetQuiesced = true;
  _db?.close();
}

/**
 * Clear the shared primary database through a fresh connection while this tab's
 * app-owned singleton remains closed. This lets a receiving tab perform a final
 * cleanup after any transaction that was already queued before the reset signal.
 */
export async function resetDbIsolated(): Promise<void> {
  const db = new AppDatabase();
  try {
    await clearDatabaseTables(db);
  } finally {
    db.close();
  }
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
