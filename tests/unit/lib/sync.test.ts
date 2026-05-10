import { server } from '@tests/mocks/node';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { getDb, resetDb } from '@/lib/db';
import { createRemoteServer } from '@/lib/local-repositories';
import { syncRemoteArchive } from '@/lib/sync';
import { useAuthStore } from '@/stores/auth-store';

const archiveUrl = 'https://archive.example.com';
const archiveToken = 'my-sync-token';

beforeEach(async () => {
  await resetDb();
});

describe('syncRemoteArchive', () => {
  async function seedServer() {
    return createRemoteServer({
      baseUrl: archiveUrl,
      label: 'Test Archive',
    });
  }

  it('syncs projects, observations, and alerts from remote archive', async () => {
    const serverRecord = await seedServer();
    // Store the token alongside the server in the auth store
    const { useAuthStore } = await import('@/stores/auth-store');
    await useAuthStore.getState().addServer({
      label: 'Test Archive',
      baseUrl: archiveUrl,
      token: archiveToken,
    });

    // Mock all endpoints
    server.use(
      http.get(`${archiveUrl}/projects`, () =>
        HttpResponse.json({
          data: [{ projectId: 'proj-1', name: 'Forest Monitor' }],
        }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/observations`, () =>
        HttpResponse.json({
          data: [
            {
              docId: 'obs-1',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              deleted: false,
              attachments: [],
              tags: {},
            },
          ],
        }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/remoteDetectionAlerts`, () =>
        HttpResponse.json({
          data: [
            {
              docId: 'alert-1',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              deleted: false,
              geometry: { type: 'Point', coordinates: [0, 0] },
            },
          ],
        }),
      ),
    );

    const result = await syncRemoteArchive(serverRecord.id, {
      baseUrl: archiveUrl,
      token: archiveToken,
      serverLabel: 'Test Archive',
    });

    expect(result.success).toBe(true);

    // Verify data was stored
    const db = getDb();
    const projects = await db.projects.toArray();
    expect(projects.length).toBeGreaterThan(0);
    // Projects should have sourceId equal to serverDbId
    expect(projects[0]!.sourceId).toBe(serverRecord.id);
    const observations = await db.observations.toArray();
    expect(observations.length).toBeGreaterThan(0);
    // Observations should have projectLocalId matching the project's localId
    expect(observations[0]!.projectLocalId).toBe(projects[0]!.localId);
    expect(observations[0]!.sourceId).toBe(serverRecord.id);
    const alerts = await db.alerts.toArray();
    expect(alerts.length).toBeGreaterThan(0);
    // Alerts should have projectLocalId matching the project's localId
    expect(alerts[0]!.projectLocalId).toBe(projects[0]!.localId);
    expect(alerts[0]!.sourceId).toBe(serverRecord.id);
  });

  it('returns success false on network failure', async () => {
    const serverRecord = await seedServer();
    server.use(http.get(`${archiveUrl}/projects`, () => HttpResponse.error()));

    const result = await syncRemoteArchive(serverRecord.id, {
      baseUrl: archiveUrl,
      token: archiveToken,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns error on invalid response from server', async () => {
    const serverRecord = await seedServer();
    server.use(
      http.get(`${archiveUrl}/projects`, () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    );

    const result = await syncRemoteArchive(serverRecord.id, {
      baseUrl: archiveUrl,
      token: archiveToken,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('is idempotent — repeated sync does not duplicate records', async () => {
    const serverRecord = await seedServer();
    server.use(
      http.get(`${archiveUrl}/projects`, () =>
        HttpResponse.json({
          data: [{ projectId: 'proj-1', name: 'Unique' }],
        }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/observations`, () =>
        HttpResponse.json({ data: [] }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/remoteDetectionAlerts`, () =>
        HttpResponse.json({ data: [] }),
      ),
    );

    // First sync
    const r1 = await syncRemoteArchive(serverRecord.id, {
      baseUrl: archiveUrl,
      token: archiveToken,
    });
    expect(r1.success).toBe(true);

    const db = getDb();
    const countAfterFirst = await db.projects.count();

    // Second sync
    const r2 = await syncRemoteArchive(serverRecord.id, {
      baseUrl: archiveUrl,
      token: archiveToken,
    });
    expect(r2.success).toBe(true);

    const countAfterSecond = await db.projects.count();
    // Should not duplicate — deterministic localId + bulkPut upserts
    expect(countAfterSecond).toBe(countAfterFirst);
  });

  it('preserves existing local data after sync', async () => {
    const serverRecord = await seedServer();
    // Add existing local project
    const db = getDb();
    await db.projects.add({
      localId: 'local-proj-1',
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      dirtyLocal: true,
      deleted: false,
    });

    server.use(
      http.get(`${archiveUrl}/projects`, () =>
        HttpResponse.json({
          data: [{ projectId: 'archive-proj-1', name: 'Archive' }],
        }),
      ),
      http.get(`${archiveUrl}/projects/archive-proj-1/observations`, () =>
        HttpResponse.json({ data: [] }),
      ),
      http.get(
        `${archiveUrl}/projects/archive-proj-1/remoteDetectionAlerts`,
        () => HttpResponse.json({ data: [] }),
      ),
    );

    await syncRemoteArchive(serverRecord.id, {
      baseUrl: archiveUrl,
      token: archiveToken,
    });

    // Local data still exists
    const localProject = await db.projects.get('local-proj-1');
    expect(localProject).toBeDefined();
    expect(localProject!.sourceType).toBe('local');
  });

  it('adds server to store when not already present', async () => {
    const serverRecord = await seedServer();
    // Reset auth store to ensure no servers from previous tests
    useAuthStore.setState({
      servers: [],
      activeServerId: null,
      token: null,
      baseUrl: null,
    });
    expect(
      useAuthStore.getState().servers.find((s) => s.baseUrl === archiveUrl),
    ).toBeUndefined();

    server.use(
      http.get(`${archiveUrl}/projects`, () => HttpResponse.json({ data: [] })),
    );

    const result = await syncRemoteArchive(serverRecord.id, {
      baseUrl: archiveUrl,
      token: archiveToken,
      serverLabel: 'Auto-added Server',
    });

    expect(result.success).toBe(true);
    const found = useAuthStore
      .getState()
      .servers.find((s) => s.baseUrl === archiveUrl);
    expect(found).toBeDefined();
    expect(found!.token).toBe(archiveToken);
  });

  it('returns error when server record not found in database', async () => {
    // Ensure the server is in the auth store so ensureServerInStore passes
    useAuthStore.setState({
      servers: [],
      activeServerId: null,
      token: null,
      baseUrl: null,
    });
    await useAuthStore.getState().addServer({
      label: 'Ghost Server',
      baseUrl: archiveUrl,
      token: archiveToken,
    });

    // Use a non-existent DB id — getRemoteServer will return undefined
    const fakeId = 'nonexistent-server-id';

    const result = await syncRemoteArchive(fakeId, {
      baseUrl: archiveUrl,
      token: archiveToken,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('rejects concurrent sync for the same server', async () => {
    const serverRecord = await seedServer();
    useAuthStore.setState({
      servers: [],
      activeServerId: null,
      token: null,
      baseUrl: null,
    });
    await useAuthStore.getState().addServer({
      label: 'Test Archive',
      baseUrl: archiveUrl,
      token: archiveToken,
    });

    // Make the projects endpoint slow so the first sync stays in-flight
    let resolveProjects: () => void;
    const projectsPromise = new Promise<void>(
      (resolve) => (resolveProjects = resolve),
    );
    server.use(
      http.get(`${archiveUrl}/projects`, async () => {
        await projectsPromise;
        return HttpResponse.json({
          data: [{ projectId: 'proj-1', name: 'Slow' }],
        });
      }),
      http.get(`${archiveUrl}/projects/proj-1/observations`, () =>
        HttpResponse.json({ data: [] }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/remoteDetectionAlerts`, () =>
        HttpResponse.json({ data: [] }),
      ),
    );

    // Start first sync (will hang until we resolve)
    const first = syncRemoteArchive(serverRecord.id, {
      baseUrl: archiveUrl,
      token: archiveToken,
    });

    // Start second sync while first is still in-flight
    const second = syncRemoteArchive(serverRecord.id, {
      baseUrl: archiveUrl,
      token: archiveToken,
    });

    // Second should fail immediately
    const secondResult = await second;
    expect(secondResult.success).toBe(false);
    expect(secondResult.error).toContain('already in progress');

    // Release the first sync
    resolveProjects!();
    const firstResult = await first;
    expect(firstResult.success).toBe(true);
  });

  it('uses baseUrl as fallback label when serverLabel is not provided', async () => {
    const serverRecord = await seedServer();
    useAuthStore.setState({
      servers: [],
      activeServerId: null,
      token: null,
      baseUrl: null,
    });

    server.use(
      http.get(`${archiveUrl}/projects`, () => HttpResponse.json({ data: [] })),
    );

    // No serverLabel provided — should use baseUrl as label
    const result = await syncRemoteArchive(serverRecord.id, {
      baseUrl: archiveUrl,
      token: archiveToken,
      // serverLabel intentionally omitted
    });

    expect(result.success).toBe(true);
    const found = useAuthStore
      .getState()
      .servers.find((s) => s.baseUrl === archiveUrl);
    expect(found).toBeDefined();
    // The label should fall back to the baseUrl since serverLabel was omitted
    expect(found!.label).toBe(archiveUrl);
  });

  it('handles non-Error thrown during sync', async () => {
    const serverRecord = await seedServer();
    await useAuthStore.getState().addServer({
      label: 'Test Archive',
      baseUrl: archiveUrl,
      token: archiveToken,
    });

    // Provide a valid projects mock so the sync starts, then throw a non-Error
    // from the observations handler by using a response that will be parsed
    // by Valibot which throws ValiError (an Error subclass). To get a true
    // non-Error, we need to make fetch itself throw one.
    // We'll override globalThis.fetch temporarily.
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    globalThis.fetch = (..._args: Parameters<typeof fetch>) => {
      callCount++;
      // First call is projects — return valid data
      if (callCount === 1) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ data: [{ projectId: 'proj-1', name: 'Test' }] }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      // Second call is observations — throw a non-Error
      throw 'unexpected string error';
    };

    const result = await syncRemoteArchive(serverRecord.id, {
      baseUrl: archiveUrl,
      token: archiveToken,
    });

    globalThis.fetch = originalFetch;

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unknown sync error');
  });
});
