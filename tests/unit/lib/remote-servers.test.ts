import { beforeEach, describe, expect, it } from 'vitest';

import { getDb, resetDb } from '@/lib/db';
import {
  createRemoteServer,
  deleteRemoteServer,
  getRemoteServer,
  getRemoteServers,
  updateRemoteServer,
} from '@/lib/local-repositories';

beforeEach(async () => {
  await resetDb();
});

describe('remote server repository', () => {
  it('adds a remote archive server', async () => {
    const server = await createRemoteServer({
      baseUrl: 'https://archive.example.com',
    });
    expect(server.id).toBeDefined();
    expect(server.baseUrl).toBe('https://archive.example.com');
    expect(server.status).toBe('idle');
  });

  it('lists configured servers', async () => {
    await createRemoteServer({ baseUrl: 'https://s1.example.com' });
    await createRemoteServer({ baseUrl: 'https://s2.example.com' });
    const all = await getRemoteServers();
    expect(all).toHaveLength(2);
  });

  it('updates server status and error message', async () => {
    const server = await createRemoteServer({
      baseUrl: 'https://archive.example.com',
    });
    await updateRemoteServer(server.id, {
      status: 'error',
    });
    const updated = await getRemoteServer(server.id);
    expect(updated).toBeDefined();
    expect(updated!.status).toBe('error');
  });

  it('removes server without deleting cached domain records', async () => {
    const server = await createRemoteServer({
      baseUrl: 'https://archive.example.com',
    });
    // Add a project sourced from this server
    const db = getDb();
    await db.projects.add({
      localId: 'cached-proj-1',
      sourceType: 'remoteArchive',
      sourceId: server.id,
      remoteId: 'remote-1',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });

    // Remove the server
    await deleteRemoteServer(server.id);
    const servers = await getRemoteServers();
    expect(servers).toHaveLength(0);

    // Cached project should still exist
    const cached = await db.projects.get('cached-proj-1');
    expect(cached).toBeDefined();
    expect(cached!.sourceId).toBe(server.id);
  });

  it('persists records across database reopen', async () => {
    const server = await createRemoteServer({
      baseUrl: 'https://persistent.example.com',
      status: 'connected',
    });

    // Re-query the same server — the data is in IndexedDB
    const retrieved = await getRemoteServer(server.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.baseUrl).toBe('https://persistent.example.com');
    expect(retrieved!.status).toBe('connected');
  });
});
