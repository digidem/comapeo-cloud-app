import { server } from '@tests/mocks/node';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createAlertForProject,
  resolveAlertCreatePlan,
} from '@/lib/data-layer';
import { getDb, resetDb } from '@/lib/db';
import { useAuthStore } from '@/stores/auth-store';

// A posted alert captured by the MSW override, keyed deterministically.
let capturedPost: { url: string; body: unknown } | null = null;

function installArchiveHandlers() {
  server.use(
    http.post('*/projects/*/remoteDetectionAlerts', async ({ request }) => {
      const body = await request.json();
      capturedPost = { url: request.url, body };
      return HttpResponse.json(null, { status: 201 });
    }),
    http.get('*/projects/*/remoteDetectionAlerts', () => {
      // After a POST the archive's collection contains the posted alert again
      // (server is source of truth) alongside the fixture.
      return HttpResponse.json({
        data: [
          {
            docId: 'echo-0001',
            createdAt: '2024-03-15T08:00:00Z',
            updatedAt: '2024-03-15T08:00:00Z',
            deleted: false,
            detectionDateStart: (capturedPost?.body as Record<string, unknown>)
              ?.detectionDateStart,
            detectionDateEnd: (capturedPost?.body as Record<string, unknown>)
              ?.detectionDateEnd,
            sourceId: (capturedPost?.body as Record<string, unknown>)?.sourceId,
            metadata:
              (capturedPost?.body as Record<string, unknown>)?.metadata ?? {},
            geometry: (capturedPost?.body as Record<string, unknown>)?.geometry,
          },
        ],
      });
    }),
  );
}

async function insertRemoteProject(
  localId: string,
  remoteId: string,
  serverId: string,
) {
  const db = getDb();
  await db.projects.put({
    localId,
    sourceType: 'remoteArchive',
    sourceId: serverId,
    remoteId,
    name: 'Remote Proj',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    dirtyLocal: false,
    deleted: false,
  });
}

async function insertLocalProject(localId: string) {
  const db = getDb();
  await db.projects.put({
    localId,
    sourceType: 'local',
    sourceId: 'local',
    name: 'Local Proj',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    dirtyLocal: true,
    deleted: false,
  });
}

const alertInput = {
  projectLocalId: 'proj-remote',
  geometry: { type: 'Point' as const, coordinates: [-55.45, -8.35] },
  metadata: { severity: 'high' },
  detectionDateStart: '2024-03-15T00:00:00Z',
  detectionDateEnd: '2024-03-15T23:59:59Z',
  sourceId: 'source-1',
};

beforeEach(async () => {
  await resetDb();
  capturedPost = null;
  useAuthStore.setState({
    servers: [
      {
        id: 'server-1',
        label: 'Archive',
        baseUrl: 'https://archive.example.com',
        token: 'tok-1',
        status: 'connected',
      },
    ],
  });
});

describe('resolveAlertCreatePlan', () => {
  it('returns local for a local-only project (no remoteId)', async () => {
    await insertLocalProject('proj-local');
    const plan = await resolveAlertCreatePlan('proj-local');
    expect(plan.kind).toBe('local');
  });

  it('returns local for an archive project with no owning-server token', async () => {
    await insertRemoteProject('proj-x', 'proj-remote-x', 'server-missing');
    const plan = await resolveAlertCreatePlan('proj-x');
    expect(plan.kind).toBe('local');
  });

  it('returns an archive target for an archive-backed project with a token', async () => {
    await insertRemoteProject('proj-remote', 'base32proj', 'server-1');
    const plan = await resolveAlertCreatePlan('proj-remote');
    expect(plan).toEqual({
      kind: 'archive',
      target: {
        projectLocalId: 'proj-remote',
        ownerServerId: 'server-1',
        config: {
          serverId: 'server-1',
          baseUrl: 'https://archive.example.com',
          token: 'tok-1',
        },
        projectRemoteId: 'base32proj',
      },
    });
  });
});

describe('createAlertForProject', () => {
  it('writes a local alert for a local-only project', async () => {
    await insertLocalProject('proj-local');
    const result = await createAlertForProject({
      ...alertInput,
      projectLocalId: 'proj-local',
    });
    expect(result).toMatchObject({ kind: 'local' });
    const db = getDb();
    const stored = await db.alerts
      .where('projectLocalId')
      .equals('proj-local')
      .toArray();
    expect(stored).toHaveLength(1);
  });

  it('posts to the owning archive and echoes the server alert (no local row)', async () => {
    await insertRemoteProject('proj-remote', 'base32proj', 'server-1');
    installArchiveHandlers();

    const result = await createAlertForProject({
      ...alertInput,
      // geometry bound numbers
      geometry: { type: 'Point', coordinates: [-55.45, -8.35] },
    });

    expect(result).toEqual({ kind: 'archive' });
    expect(capturedPost?.url).toContain(
      '/projects/base32proj/remoteDetectionAlerts',
    );

    // No transient local alert row persisted.
    const db = getDb();
    const stored = await db.alerts
      .where('projectLocalId')
      .equals('proj-remote')
      .toArray();
    expect(stored).toHaveLength(1); // the echoed remoteArchive row
    expect(stored[0]!.sourceType).toBe('remoteArchive');
    expect(stored[0]!.sourceId).toBe('server-1');
  });

  it('throws (and writes no row) when the archive POST fails', async () => {
    await insertRemoteProject('proj-remote', 'base32proj', 'server-1');
    server.use(
      http.post('*/projects/*/remoteDetectionAlerts', () =>
        HttpResponse.json(
          { error: { code: 'SERVER_ERROR', message: 'boom' } },
          { status: 500 },
        ),
      ),
    );

    await expect(
      createAlertForProject({
        ...alertInput,
        geometry: { type: 'Point', coordinates: [-55.45, -8.35] },
      }),
    ).rejects.toThrow();

    const db = getDb();
    const stored = await db.alerts
      .where('projectLocalId')
      .equals('proj-remote')
      .toArray();
    expect(stored).toHaveLength(0);
  });

  it('waits for the echo to propagate (empty first, then present) before success', async () => {
    await insertRemoteProject('proj-remote', 'base32proj', 'server-1');
    installArchiveHandlers();
    let getCalls = 0;
    server.use(
      http.get('*/projects/*/remoteDetectionAlerts', () => {
        getCalls += 1;
        const posted = capturedPost?.body as Record<string, unknown> | null;
        const data =
          posted && getCalls >= 2
            ? [
                {
                  docId: 'echo-late',
                  createdAt: '2024-03-15T08:00:00Z',
                  updatedAt: '2024-03-15T08:00:00Z',
                  deleted: false,
                  detectionDateStart: posted.detectionDateStart,
                  detectionDateEnd: posted.detectionDateEnd,
                  sourceId: posted.sourceId,
                  metadata: posted.metadata ?? {},
                  geometry: posted.geometry,
                },
              ]
            : [];
        return HttpResponse.json({ data });
      }),
    );

    const result = await createAlertForProject({
      ...alertInput,
      geometry: { type: 'Point', coordinates: [-55.45, -8.35] },
    });

    expect(result).toEqual({ kind: 'archive' });
    expect(getCalls).toBeGreaterThanOrEqual(2);
    const db = getDb();
    const stored = await db.alerts
      .where('projectLocalId')
      .equals('proj-remote')
      .toArray();
    // The echoed remoteArchive row (server source of truth) is present.
    expect(stored.some((a) => a.sourceId === 'server-1')).toBe(true);
  });

  it('fails (no fake success) when the archive never echoes the alert', async () => {
    await insertRemoteProject('proj-remote', 'base32proj', 'server-1');
    installArchiveHandlers();
    server.use(
      http.get('*/projects/*/remoteDetectionAlerts', () =>
        HttpResponse.json({ data: [] }),
      ),
    );

    await expect(
      createAlertForProject({
        ...alertInput,
        geometry: { type: 'Point', coordinates: [-55.45, -8.35] },
      }),
    ).rejects.toThrow(/could not be confirmed/);
  });
});
