import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DB_NAME = 'comapeo-cloud-app';
const CANARY = '[REDACTED_SECRET]';

const V4_STORES = {
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
};

const V14_STORES = {
  projects:
    '&localId, [sourceType+sourceId+remoteId], [sourceType+sourceId+updatedAt], [dirtyLocal+updatedAt], serverUrl',
  observations:
    '&localId, projectLocalId, [sourceType+sourceId+remoteId], [projectLocalId+presetRefDocId], [dirtyLocal+updatedAt]',
  alerts:
    '&localId, projectLocalId, [sourceType+sourceId+remoteId], [dirtyLocal+updatedAt]',
  attachments:
    '&localId, projectLocalId, observationLocalId, [sourceType+sourceId+remoteId], [projectLocalId+mediaType], [observationLocalId+mediaType]',
  remoteServers: '&id, baseUrl, status, lastSyncedAt',
  syncMetadata: '&id, serverId, status, updatedAt',
  presets:
    '&localId, projectLocalId, [projectLocalId+remoteId], [sourceType+sourceId+remoteId], [dirtyLocal+updatedAt]',
  tracks:
    '&localId, projectLocalId, [projectLocalId+remoteId], [sourceType+sourceId+remoteId], [projectLocalId+presetRefDocId], [dirtyLocal+updatedAt]',
  fields:
    '&localId, projectLocalId, [projectLocalId+remoteId], [sourceType+sourceId+remoteId], [projectLocalId+key], [dirtyLocal+updatedAt]',
  iconCache: '&url',
  maps: '&id, projectLocalId, [projectLocalId+updatedAt], status',
  mapPackages: '&mapId',
  mapPackageChunks: '&id, mapId, [mapId+index]',
};

async function openCurrentDatabase() {
  vi.resetModules();
  const { getDb } = await import('@/lib/db');
  const db = getDb();
  await db.open();
  return db;
}

async function serializeAllTables(db: Dexie): Promise<string> {
  const snapshot: Record<string, unknown[]> = {};
  for (const table of db.tables) {
    snapshot[table.name] = await table.toArray();
  }
  return JSON.stringify(snapshot);
}

async function seedV14Database(): Promise<void> {
  const legacy = new Dexie(DB_NAME);
  legacy.version(14).stores(V14_STORES);
  await legacy.open();

  await legacy.table('remoteServers').bulkPut([
    {
      id: 'archive-canary',
      baseUrl: 'https://archive.example.com',
      label: 'Archive canary',
      token: CANARY,
      status: 'connected',
      lastSyncedAt: '2026-01-01T00:00:00.000Z',
      lastSuccessfulSyncAt: '2026-01-01T00:00:00.000Z',
      onboardingStatus: 'ready',
    },
    {
      id: 'archive-empty',
      baseUrl: 'https://empty.example.com',
      token: '',
      status: 'idle',
      lastSyncedAt: '',
    },
    {
      id: 'archive-number',
      baseUrl: 'https://number.example.com',
      token: 42,
      status: 'idle',
      lastSyncedAt: '',
    },
    {
      id: 'archive-object',
      baseUrl: 'https://object.example.com',
      token: { legacy: true },
      status: 'idle',
      lastSyncedAt: '',
    },
    {
      id: 'archive-null',
      baseUrl: 'https://null.example.com',
      token: null,
      status: 'idle',
      lastSyncedAt: '',
    },
  ]);

  await legacy.table('projects').put({
    localId: 'local-project',
    sourceType: 'local',
    sourceId: 'local',
    name: 'Local project',
    serverUrl: 'https://archive.example.com/projects/local-project',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    dirtyLocal: true,
    deleted: false,
  });
  await legacy.table('observations').put({
    localId: 'local-observation',
    projectLocalId: 'local-project',
    sourceType: 'local',
    sourceId: 'local',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    dirtyLocal: true,
    deleted: false,
  });
  await legacy.table('alerts').put({
    localId: 'local-alert',
    projectLocalId: 'local-project',
    sourceType: 'local',
    sourceId: 'local',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    dirtyLocal: true,
    deleted: false,
  });
  await legacy.table('attachments').put({
    localId: 'local-attachment',
    projectLocalId: 'local-project',
    observationLocalId: 'local-observation',
    sourceType: 'local',
    sourceId: 'local',
    remoteUrl: 'https://archive.example.com/attachments/local-attachment',
  });
  await legacy.table('tracks').put({
    localId: 'local-track',
    projectLocalId: 'local-project',
    sourceType: 'local',
    sourceId: 'local',
    updatedAt: '2026-01-02T00:00:00.000Z',
    dirtyLocal: true,
    deleted: false,
  });
  await legacy.table('presets').put({
    localId: 'local-preset',
    projectLocalId: 'local-project',
    sourceType: 'local',
    sourceId: 'local',
    updatedAt: '2026-01-02T00:00:00.000Z',
    dirtyLocal: true,
    deleted: false,
  });
  await legacy.table('fields').put({
    localId: 'local-field',
    projectLocalId: 'local-project',
    sourceType: 'local',
    sourceId: 'local',
    key: 'notes',
    updatedAt: '2026-01-02T00:00:00.000Z',
    dirtyLocal: true,
    deleted: false,
  });
  await legacy.table('iconCache').put({
    url: 'https://archive.example.com/icons/icon-1.png',
    data: new Uint8Array([1, 2, 3]).buffer,
    contentType: 'image/png',
    cachedAt: '2026-01-02T00:00:00.000Z',
  });
  await legacy.table('maps').put({
    id: 'local-map',
    projectLocalId: 'local-project',
    name: 'Offline map',
    type: 'raster',
    styleUrl: 'https://tiles.example.com/style.json',
    bbox: [-60, -10, -59, -9],
    minZoom: 0,
    maxZoom: 14,
    status: 'ready',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  });
  await legacy.table('mapPackages').put({
    mapId: 'local-map',
    contentType: 'application/zip',
    size: 3,
    chunkSize: 3,
    chunkCount: 1,
    updatedAt: '2026-01-02T00:00:00.000Z',
  });
  await legacy.table('mapPackageChunks').put({
    id: 'local-map:0',
    mapId: 'local-map',
    index: 0,
    data: new Uint8Array([4, 5, 6]).buffer,
  });
  await legacy.table('syncMetadata').put({
    id: 'sync-1',
    serverId: 'archive-canary',
    status: 'ready',
    updatedAt: '2026-01-02T00:00:00.000Z',
  });

  legacy.close();
}

async function seedV4Database(): Promise<void> {
  const legacy = new Dexie(DB_NAME);
  legacy.version(4).stores(V4_STORES);
  await legacy.open();

  await legacy.table('remoteServers').put({
    id: 'archive-v4',
    baseUrl: 'https://v4.example.com',
    label: 'Historical archive',
    token: CANARY,
    status: 'connected',
    lastSyncedAt: '2025-01-01T00:00:00.000Z',
  });
  await legacy.table('projects').put({
    localId: 'v4-project',
    sourceType: 'local',
    sourceId: 'local',
    name: 'Historical local project',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
    dirtyLocal: true,
    deleted: false,
  });
  await legacy.table('observations').put({
    localId: 'v4-observation',
    projectLocalId: 'v4-project',
    sourceType: 'local',
    sourceId: 'local',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
    dirtyLocal: true,
    deleted: false,
  });
  await legacy.table('alerts').put({
    localId: 'v4-alert',
    projectLocalId: 'v4-project',
    sourceType: 'local',
    sourceId: 'local',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
    dirtyLocal: true,
    deleted: false,
  });
  await legacy.table('attachments').put({
    localId: 'v4-attachment',
    projectLocalId: 'v4-project',
    observationLocalId: 'v4-observation',
    sourceType: 'local',
    sourceId: 'local',
  });
  await legacy.table('syncMetadata').put({
    id: 'v4-sync',
    serverId: 'archive-v4',
    status: 'ready',
    updatedAt: '2025-01-02T00:00:00.000Z',
  });

  legacy.close();
}

beforeEach(async () => {
  await Dexie.delete(DB_NAME);
  vi.resetModules();
});

afterEach(async () => {
  vi.resetModules();
  await Dexie.delete(DB_NAME);
});

describe('credential purge migration', () => {
  it('upgrades v14 through the credential-purge v16 path to current v17, removes every legacy token shape, and preserves all other data', async () => {
    await seedV14Database();

    const db = await openCurrentDatabase();

    expect(db.verno).toBe(17);
    const servers = (await db.remoteServers.toArray()) as unknown as Array<
      Record<string, unknown>
    >;
    expect(servers).toHaveLength(5);
    for (const server of servers) {
      expect(server).not.toHaveProperty('token');
    }

    const canaryServer = servers.find(
      (server) => server.id === 'archive-canary',
    );
    expect(canaryServer).toMatchObject({
      baseUrl: 'https://archive.example.com',
      label: 'Archive canary',
      status: 'connected',
      lastSyncedAt: '2026-01-01T00:00:00.000Z',
      lastSuccessfulSyncAt: '2026-01-01T00:00:00.000Z',
      onboardingStatus: 'ready',
    });

    expect(await db.projects.get('local-project')).toMatchObject({
      dirtyLocal: true,
      deleted: false,
    });
    expect(await db.observations.get('local-observation')).toMatchObject({
      dirtyLocal: true,
      deleted: false,
    });
    expect(await db.alerts.get('local-alert')).toMatchObject({
      dirtyLocal: true,
    });
    expect(await db.attachments.get('local-attachment')).toBeDefined();
    expect(await db.tracks.get('local-track')).toMatchObject({
      dirtyLocal: true,
    });
    expect(await db.presets.get('local-preset')).toMatchObject({
      dirtyLocal: true,
    });
    expect(await db.fields.get('local-field')).toMatchObject({
      dirtyLocal: true,
    });
    expect(await db.maps.get('local-map')).toMatchObject({ status: 'ready' });
    expect(await db.mapPackages.get('local-map')).toMatchObject({
      contentType: 'application/zip',
      size: 3,
      chunkCount: 1,
    });
    expect(await db.mapPackageChunks.get('local-map:0')).toMatchObject({
      mapId: 'local-map',
      index: 0,
    });
    expect(
      await db.iconCache.get('https://archive.example.com/icons/icon-1.png'),
    ).toBeDefined();
    expect(await db.syncMetadata.get('sync-1')).toBeDefined();

    expect(await serializeAllTables(db)).not.toContain(CANARY);

    db.close();
  });

  it('purges a v4 credential through the historical v5 upgrade path without deleting legacy local data', async () => {
    await seedV4Database();

    const db = await openCurrentDatabase();

    expect(db.verno).toBe(17);
    const server = (await db.remoteServers.get('archive-v4')) as unknown as
      Record<string, unknown> | undefined;
    expect(server).toMatchObject({
      id: 'archive-v4',
      baseUrl: 'https://v4.example.com',
      label: 'Historical archive',
      status: 'connected',
      lastSyncedAt: '2025-01-01T00:00:00.000Z',
    });
    expect(server).not.toHaveProperty('token');
    expect(await db.projects.get('v4-project')).toMatchObject({
      dirtyLocal: true,
    });
    expect(await db.observations.get('v4-observation')).toMatchObject({
      dirtyLocal: true,
    });
    expect(await db.alerts.get('v4-alert')).toMatchObject({ dirtyLocal: true });
    expect(await db.attachments.get('v4-attachment')).toBeDefined();
    expect(await db.syncMetadata.get('v4-sync')).toBeDefined();
    expect(await serializeAllTables(db)).not.toContain(CANARY);

    db.close();
  });

  it('is idempotent when the current v17 database is opened again', async () => {
    await seedV14Database();
    const first = await openCurrentDatabase();
    const firstSnapshot = await serializeAllTables(first);
    first.close();

    vi.resetModules();
    const second = await openCurrentDatabase();
    expect(second.verno).toBe(17);
    expect(await serializeAllTables(second)).toBe(firstSnapshot);
    expect(await serializeAllTables(second)).not.toContain(CANARY);
    second.close();
  });
});
