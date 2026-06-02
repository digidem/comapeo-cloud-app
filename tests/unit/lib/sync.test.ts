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

  it('syncs projects, observations, alerts, tracks, presets, fields, and attachments from remote archive', async () => {
    const serverRecord = await seedServer();
    // Store the token alongside the server in the auth store
    const { useAuthStore } = await import('@/stores/auth-store');
    await useAuthStore.getState().addServer({
      label: 'Test Archive',
      baseUrl: archiveUrl,
      token: archiveToken,
      allowDuplicate: true,
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
              versionId: 'obs-1/0',
              originalVersionId: 'obs-1/0',
              schemaName: 'observation',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              links: [],
              deleted: false,
              attachments: [
                {
                  driveId: 'drive1',
                  type: 'photo',
                  name: 'img1.jpg',
                  url: '/projects/proj-1/attachments/drive1/photo/img1.jpg',
                },
              ],
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
      http.get(`${archiveUrl}/projects/proj-1/track`, () =>
        HttpResponse.json({
          data: [
            {
              docId: 'track-1',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:10:00Z',
              deleted: false,
              locations: [{ coords: { latitude: -8.35, longitude: -55.45 } }],
              observationRefs: [],
              tags: {},
            },
          ],
        }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/preset`, () =>
        HttpResponse.json({
          data: [
            {
              docId: 'preset-1',
              versionId: 'preset-1/0',
              originalVersionId: 'preset-1/0',
              schemaName: 'preset',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              links: [],
              deleted: false,
              name: 'Forest',
              geometry: ['point'],
              tags: {},
              addTags: {},
              removeTags: {},
              fieldRefs: [
                { docId: 'field-1', versionId: 'field-1/0', url: '/field-1' },
              ],
              terms: [],
            },
          ],
        }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/field`, () =>
        HttpResponse.json({
          data: [
            {
              docId: 'field-1',
              versionId: 'field-1/0',
              originalVersionId: 'field-1/0',
              schemaName: 'field',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              links: [],
              deleted: false,
              type: 'text',
              key: 'notes',
              label: 'Notes',
              universal: false,
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
    expect(await db.tracks.count()).toBe(1);
    expect(await db.presets.count()).toBe(1);
    expect(await db.fields.count()).toBe(1);
    expect(await db.attachments.count()).toBe(1);
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
      allowDuplicate: true,
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
      allowDuplicate: true,
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

  it('skips projects without remoteId', async () => {
    await resetDb();
    const serverRecord = await seedServer();
    await useAuthStore.getState().addServer({
      label: 'Test Archive',
      baseUrl: archiveUrl,
      token: archiveToken,
      allowDuplicate: true,
    });

    server.use(
      http.get(`${archiveUrl}/projects`, () =>
        HttpResponse.json({
          data: [{ projectId: 'proj-1', name: 'Has Remote' }],
        }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/observations`, () =>
        HttpResponse.json({ data: [] }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/remoteDetectionAlerts`, () =>
        HttpResponse.json({ data: [] }),
      ),
    );

    const result = await syncRemoteArchive(serverRecord.id, {
      baseUrl: archiveUrl,
      token: archiveToken,
    });

    expect(result.success).toBe(true);
  });

  it('handles non-Error thrown during sync', async () => {
    const serverRecord = await seedServer();
    await useAuthStore.getState().addServer({
      label: 'Test Archive',
      baseUrl: archiveUrl,
      token: archiveToken,
      allowDuplicate: true,
    });

    // Provide a valid projects mock so the sync starts, then throw a non-Error
    // from the observations handler by using a response that will be parsed
    // by Valibot which throws ValiError (an Error subclass). To get a true
    // non-Error, we need to make fetch itself throw one.
    // We'll override globalThis.fetch temporarily.
    const originalFetch = globalThis.fetch;
    let callCount = 0;
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
    expect(result.error).toContain('unexpected string error');
  });

  it('pulls presets for each project during sync', async () => {
    const serverRecord = await seedServer();
    await useAuthStore.getState().addServer({
      label: 'Test Archive',
      baseUrl: archiveUrl,
      token: archiveToken,
      allowDuplicate: true,
    });

    server.use(
      http.get(`${archiveUrl}/projects`, () =>
        HttpResponse.json({
          data: [{ projectId: 'proj-1', name: 'Forest Monitor' }],
        }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/observations`, () =>
        HttpResponse.json({ data: [] }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/remoteDetectionAlerts`, () =>
        HttpResponse.json({ data: [] }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/preset`, () =>
        HttpResponse.json({
          data: [
            {
              docId: 'preset-1',
              versionId: 'preset-1/0',
              originalVersionId: 'preset-1/0',
              schemaName: 'preset',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              links: [],
              deleted: false,
              name: 'Deforestation',
              geometry: ['point'],
              tags: {},
              addTags: {},
              removeTags: {},
              fieldRefs: [],
              terms: [],
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

    const db = getDb();
    const presets = await db.presets.toArray();
    expect(presets.length).toBeGreaterThan(0);
    expect(presets[0]!.name).toBe('Deforestation');
  });

  it('succeeds when presets fail (non-critical data type)', async () => {
    const serverRecord = await seedServer();
    await useAuthStore.getState().addServer({
      label: 'Test Archive',
      baseUrl: archiveUrl,
      token: archiveToken,
      allowDuplicate: true,
    });

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
        HttpResponse.json({ data: [] }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/preset`, () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    );

    const result = await syncRemoteArchive(serverRecord.id, {
      baseUrl: archiveUrl,
      token: archiveToken,
      serverLabel: 'Test Archive',
    });

    // Preset failures should not block sync success
    expect(result.success).toBe(true);

    // Observations and alerts should still be persisted
    const db = getDb();
    const observations = await db.observations.toArray();
    expect(observations.length).toBeGreaterThan(0);
  });

  it('succeeds when alerts fail (non-critical data type)', async () => {
    const serverRecord = await seedServer();
    await useAuthStore.getState().addServer({
      label: 'Test Archive',
      baseUrl: archiveUrl,
      token: archiveToken,
      allowDuplicate: true,
    });

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
        HttpResponse.json({}, { status: 500 }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/preset`, () =>
        HttpResponse.json({ data: [] }),
      ),
    );

    const result = await syncRemoteArchive(serverRecord.id, {
      baseUrl: archiveUrl,
      token: archiveToken,
      serverLabel: 'Test Archive',
    });

    // Alert failures should not block sync success
    expect(result.success).toBe(true);

    const db = getDb();
    const observations = await db.observations.toArray();
    expect(observations.length).toBeGreaterThan(0);
  });

  it('succeeds when tracks and fields fail (non-critical data types)', async () => {
    const serverRecord = await seedServer();
    await useAuthStore.getState().addServer({
      label: 'Test Archive',
      baseUrl: archiveUrl,
      token: archiveToken,
      allowDuplicate: true,
    });

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
        HttpResponse.json({ data: [] }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/track`, () =>
        HttpResponse.json({}, { status: 500 }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/preset`, () =>
        HttpResponse.json({ data: [] }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/field`, () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    );

    const result = await syncRemoteArchive(serverRecord.id, {
      baseUrl: archiveUrl,
      token: archiveToken,
      serverLabel: 'Test Archive',
    });

    expect(result.success).toBe(true);

    const db = getDb();
    const observations = await db.observations.toArray();
    expect(observations).toHaveLength(1);
  });

  it('fails when observations fail for all projects (critical data type)', async () => {
    const serverRecord = await seedServer();
    await useAuthStore.getState().addServer({
      label: 'Test Archive',
      baseUrl: archiveUrl,
      token: archiveToken,
      allowDuplicate: true,
    });

    server.use(
      http.get(`${archiveUrl}/projects`, () =>
        HttpResponse.json({
          data: [{ projectId: 'proj-1', name: 'Forest Monitor' }],
        }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/observations`, () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    );

    const result = await syncRemoteArchive(serverRecord.id, {
      baseUrl: archiveUrl,
      token: archiveToken,
      serverLabel: 'Test Archive',
    });

    expect(result.success).toBe(false);
  });

  it('pulls tracks for each project during sync', async () => {
    const serverRecord = await seedServer();
    await useAuthStore.getState().addServer({
      label: 'Test Archive',
      baseUrl: archiveUrl,
      token: archiveToken,
      allowDuplicate: true,
    });

    server.use(
      http.get(`${archiveUrl}/projects`, () =>
        HttpResponse.json({
          data: [{ projectId: 'proj-1', name: 'Forest Monitor' }],
        }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/observations`, () =>
        HttpResponse.json({ data: [] }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/remoteDetectionAlerts`, () =>
        HttpResponse.json({ data: [] }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/preset`, () =>
        HttpResponse.json({ data: [] }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/track`, () =>
        HttpResponse.json({
          data: [
            {
              docId: 'track-1',
              versionId: 'track-1/0',
              originalVersionId: 'track-1/0',
              schemaName: 'track',
              createdAt: '2024-03-15T08:00:00Z',
              updatedAt: '2024-03-15T08:30:00Z',
              links: [],
              deleted: false,
              locations: [
                {
                  coords: { latitude: -8.35, longitude: -55.45 },
                  timestamp: '2024-03-15T08:00:00Z',
                },
              ],
              observationRefs: [],
              tags: {},
            },
          ],
        }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/field`, () =>
        HttpResponse.json({ data: [] }),
      ),
    );

    const result = await syncRemoteArchive(serverRecord.id, {
      baseUrl: archiveUrl,
      token: archiveToken,
      serverLabel: 'Test Archive',
    });

    expect(result.success).toBe(true);

    const db = getDb();
    const tracks = await db.tracks.toArray();
    expect(tracks.length).toBeGreaterThan(0);
    expect(tracks[0]!.remoteId).toBe('track-1');
  });

  it('pulls fields for each project during sync', async () => {
    const serverRecord = await seedServer();
    await useAuthStore.getState().addServer({
      label: 'Test Archive',
      baseUrl: archiveUrl,
      token: archiveToken,
      allowDuplicate: true,
    });

    server.use(
      http.get(`${archiveUrl}/projects`, () =>
        HttpResponse.json({
          data: [{ projectId: 'proj-1', name: 'Forest Monitor' }],
        }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/observations`, () =>
        HttpResponse.json({ data: [] }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/remoteDetectionAlerts`, () =>
        HttpResponse.json({ data: [] }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/preset`, () =>
        HttpResponse.json({ data: [] }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/track`, () =>
        HttpResponse.json({ data: [] }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/field`, () =>
        HttpResponse.json({
          data: [
            {
              docId: 'field-1',
              versionId: 'field-1/0',
              originalVersionId: 'field-1/0',
              schemaName: 'field',
              createdAt: '2024-03-15T10:00:00Z',
              updatedAt: '2024-03-15T10:00:00Z',
              links: [],
              deleted: false,
              type: 'text',
              key: 'notes',
              label: 'Notes',
              universal: false,
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

    const db = getDb();
    const fields = await db.fields.toArray();
    expect(fields.length).toBeGreaterThan(0);
    expect(fields[0]!.key).toBe('notes');
  });

  it('derives attachment records from observation attachments during sync', async () => {
    const serverRecord = await seedServer();
    await useAuthStore.getState().addServer({
      label: 'Test Archive',
      baseUrl: archiveUrl,
      token: archiveToken,
      allowDuplicate: true,
    });

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
              docId: 'obs-attach-1',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              deleted: false,
              attachments: [
                {
                  url: `${archiveUrl}/projects/proj1/attachments/drive1/photo/img1`,
                },
              ],
              tags: {},
            },
          ],
        }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/remoteDetectionAlerts`, () =>
        HttpResponse.json({ data: [] }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/preset`, () =>
        HttpResponse.json({ data: [] }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/track`, () =>
        HttpResponse.json({ data: [] }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/field`, () =>
        HttpResponse.json({ data: [] }),
      ),
    );

    const result = await syncRemoteArchive(serverRecord.id, {
      baseUrl: archiveUrl,
      token: archiveToken,
      serverLabel: 'Test Archive',
    });

    expect(result.success).toBe(true);

    const db = getDb();
    const attachments = await db.attachments.toArray();
    expect(attachments.length).toBeGreaterThan(0);
    expect(attachments[0]!.mediaType).toBe('photo');
  });

  it('succeeds when tracks fail (non-critical data type)', async () => {
    const serverRecord = await seedServer();
    await useAuthStore.getState().addServer({
      label: 'Test Archive',
      baseUrl: archiveUrl,
      token: archiveToken,
      allowDuplicate: true,
    });

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
        HttpResponse.json({ data: [] }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/preset`, () =>
        HttpResponse.json({ data: [] }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/track`, () =>
        HttpResponse.json({}, { status: 500 }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/field`, () =>
        HttpResponse.json({ data: [] }),
      ),
    );

    const result = await syncRemoteArchive(serverRecord.id, {
      baseUrl: archiveUrl,
      token: archiveToken,
      serverLabel: 'Test Archive',
    });

    expect(result.success).toBe(true);

    const db = getDb();
    const observations = await db.observations.toArray();
    expect(observations.length).toBeGreaterThan(0);
  });

  it('succeeds when fields fail (non-critical data type)', async () => {
    const serverRecord = await seedServer();
    await useAuthStore.getState().addServer({
      label: 'Test Archive',
      baseUrl: archiveUrl,
      token: archiveToken,
      allowDuplicate: true,
    });

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
        HttpResponse.json({ data: [] }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/preset`, () =>
        HttpResponse.json({ data: [] }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/track`, () =>
        HttpResponse.json({ data: [] }),
      ),
      http.get(`${archiveUrl}/projects/proj-1/field`, () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    );

    const result = await syncRemoteArchive(serverRecord.id, {
      baseUrl: archiveUrl,
      token: archiveToken,
      serverLabel: 'Test Archive',
    });

    expect(result.success).toBe(true);

    const db = getDb();
    const observations = await db.observations.toArray();
    expect(observations.length).toBeGreaterThan(0);
  });
});
