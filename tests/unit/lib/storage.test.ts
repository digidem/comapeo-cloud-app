import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDb, resetDb } from '@/lib/db';
import { clearAllStorage } from '@/lib/local-storage-utils';
import {
  clearAllData,
  clearProjectData,
  clearServerData,
  getStorageStats,
} from '@/lib/storage';
import { useAuthStore } from '@/stores/auth-store';

// Mock navigator.storage.estimate
const mockEstimate = vi.fn();

beforeEach(() => {
  vi.stubGlobal('navigator', {
    ...navigator,
    storage: {
      estimate: mockEstimate,
    },
  });

  mockEstimate.mockResolvedValue({
    quota: 1073741824, // 1 GB
    usage: 52428800, // 50 MB
  });

  // Reset stores
  useAuthStore.setState({
    servers: [],
    activeServerId: null,
    token: null,
    baseUrl: null,
  });
});

describe('getStorageStats', () => {
  it('returns total quota and usage from navigator.storage.estimate', async () => {
    const stats = await getStorageStats();
    expect(stats.quota).toBe(1073741824);
    expect(stats.usage).toBe(52428800);
  });

  it('calculates usage percentage correctly', async () => {
    const stats = await getStorageStats();
    expect(stats.usagePercent).toBeCloseTo(4.88, 1);
  });

  it('returns zero percent when quota is zero to avoid division by zero', async () => {
    mockEstimate.mockResolvedValue({ quota: 0, usage: 0 });
    const stats = await getStorageStats();
    expect(stats.usagePercent).toBe(0);
  });

  it('returns per-table record counts', async () => {
    const db = getDb();

    // Add test records
    await db.projects.bulkAdd([
      {
        localId: 'proj-1',
        sourceType: 'local',
        sourceId: 'local',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        dirtyLocal: false,
        deleted: false,
      },
      {
        localId: 'proj-2',
        sourceType: 'remoteArchive',
        sourceId: 'server-1',
        remoteId: 'remote-1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        dirtyLocal: false,
        deleted: false,
      },
    ]);

    await db.observations.bulkAdd([
      {
        localId: 'obs-1',
        projectLocalId: 'proj-1',
        sourceType: 'local',
        sourceId: 'local',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        dirtyLocal: false,
        deleted: false,
      },
    ]);

    const stats = await getStorageStats();
    expect(stats.tables.projects.count).toBe(2);
    expect(stats.tables.observations.count).toBe(1);
    expect(stats.tables.alerts.count).toBe(0);
    expect(stats.tables.attachments.count).toBe(0);
    expect(stats.tables.presets.count).toBe(0);
    expect(stats.tables.remoteServers.count).toBe(0);
    expect(stats.tables.syncMetadata.count).toBe(0);
  });

  it('handles navigator.storage.estimate being unavailable', async () => {
    vi.stubGlobal('navigator', {});
    const stats = await getStorageStats();
    expect(stats.quota).toBe(0);
    expect(stats.usage).toBe(0);
  });
});

describe('clearAllData', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('clears all IndexedDB tables', async () => {
    const db = getDb();

    await db.projects.add({
      localId: 'proj-1',
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });

    await clearAllData();

    const count = await db.projects.count();
    expect(count).toBe(0);
  });

  it('clears all data from all tables', async () => {
    const db = getDb();

    await db.projects.add({
      localId: 'proj-1',
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });
    await db.observations.add({
      localId: 'obs-1',
      projectLocalId: 'proj-1',
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });

    await clearAllData();

    expect(await db.projects.count()).toBe(0);
    expect(await db.observations.count()).toBe(0);
    expect(await db.alerts.count()).toBe(0);
    expect(await db.attachments.count()).toBe(0);
    expect(await db.presets.count()).toBe(0);
    expect(await db.remoteServers.count()).toBe(0);
    expect(await db.syncMetadata.count()).toBe(0);
  });
});

describe('clearServerData', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('clears all records associated with a specific server', async () => {
    const db = getDb();

    // Add a server
    await db.remoteServers.add({
      id: 'server-1',
      baseUrl: 'https://archive.example.com',
      status: 'connected',
      lastSyncedAt: '2026-01-01T00:00:00Z',
    });

    // Add a project from that server
    await db.projects.add({
      localId: 'proj-s1',
      sourceType: 'remoteArchive',
      sourceId: 'server-1',
      remoteId: 'remote-proj-1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });

    // Add observations for that project
    await db.observations.add({
      localId: 'obs-s1',
      projectLocalId: 'proj-s1',
      sourceType: 'remoteArchive',
      sourceId: 'server-1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });

    // Add sync metadata
    await db.syncMetadata.add({
      id: 'sync-1',
      serverId: 'server-1',
      status: 'complete',
      updatedAt: '2026-01-01T00:00:00Z',
    });

    // Add unrelated project
    await db.projects.add({
      localId: 'proj-other',
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });

    await clearServerData('server-1');

    // Server data should be gone
    expect(await db.remoteServers.get('server-1')).toBeUndefined();
    expect(await db.projects.get('proj-s1')).toBeUndefined();
    expect(await db.observations.get('obs-s1')).toBeUndefined();
    expect(await db.syncMetadata.get('sync-1')).toBeUndefined();

    // Unrelated data should remain
    expect(await db.projects.get('proj-other')).toBeDefined();
  });

  it('does nothing when server has no data', async () => {
    const db = getDb();

    await db.projects.add({
      localId: 'proj-1',
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });

    await clearServerData('nonexistent-server');

    // Existing data should remain
    expect(await db.projects.get('proj-1')).toBeDefined();
  });
});

describe('clearProjectData', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('clears a project and all its related records', async () => {
    const db = getDb();

    // Add a project
    await db.projects.add({
      localId: 'proj-to-clear',
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });

    // Add observations for that project
    await db.observations.bulkAdd([
      {
        localId: 'obs-1',
        projectLocalId: 'proj-to-clear',
        sourceType: 'local',
        sourceId: 'local',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        dirtyLocal: false,
        deleted: false,
      },
      {
        localId: 'obs-2',
        projectLocalId: 'proj-to-clear',
        sourceType: 'local',
        sourceId: 'local',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        dirtyLocal: false,
        deleted: false,
      },
    ]);

    // Add alerts
    await db.alerts.add({
      localId: 'alert-1',
      projectLocalId: 'proj-to-clear',
      sourceType: 'satellite',
      sourceId: 'sensor-1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });

    // Add attachments
    await db.attachments.add({
      localId: 'att-1',
      projectLocalId: 'proj-to-clear',
      observationLocalId: 'obs-1',
      sourceType: 'drive',
      sourceId: 'drive-abc',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });

    // Add presets
    await db.presets.add({
      localId: 'preset-1',
      projectLocalId: 'proj-to-clear',
      sourceType: 'local',
      sourceId: 'local',
      name: 'Test Preset',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
      fieldRefs: [],
      terms: [],
    });

    // Add another project that should remain
    await db.projects.add({
      localId: 'proj-keep',
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });

    await clearProjectData('proj-to-clear');

    // Cleared project should be gone
    expect(await db.projects.get('proj-to-clear')).toBeUndefined();
    expect(await db.observations.get('obs-1')).toBeUndefined();
    expect(await db.observations.get('obs-2')).toBeUndefined();
    expect(await db.alerts.get('alert-1')).toBeUndefined();
    expect(await db.attachments.get('att-1')).toBeUndefined();
    expect(await db.presets.get('preset-1')).toBeUndefined();

    // Unrelated project should remain
    expect(await db.projects.get('proj-keep')).toBeDefined();
  });

  it('does nothing when project does not exist', async () => {
    const db = getDb();

    await db.projects.add({
      localId: 'proj-1',
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });

    await clearProjectData('nonexistent-proj');

    expect(await db.projects.get('proj-1')).toBeDefined();
  });
});
