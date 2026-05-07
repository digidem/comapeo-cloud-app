import { server } from '@tests/mocks/node';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { getDb, resetDb } from '@/lib/db';
import {
  pullAlerts,
  pullObservations,
  pullProjects,
} from '@/lib/remote-archive';

const archiveConfig = {
  baseUrl: 'https://archive.example.com',
  token: 'my-secret-token',
};

const PROJECTS_RESPONSE = {
  data: [
    { projectId: 'proj-1', name: 'Forest Monitoring' },
    { projectId: 'proj-2' },
  ],
};

const OBSERVATIONS_RESPONSE = {
  data: [
    {
      docId: 'obs-1',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      deleted: false,
      attachments: [],
      tags: { species: 'tree' },
    },
  ],
};

const ALERTS_RESPONSE = {
  data: [
    {
      docId: 'alert-1',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      deleted: false,
      geometry: { type: 'Point', coordinates: [0, 0] },
    },
  ],
};

beforeEach(async () => {
  await resetDb();
});

describe('remote-archive', () => {
  it('pulls projects from archive and stores them locally', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects`, () =>
        HttpResponse.json(PROJECTS_RESPONSE),
      ),
    );

    const projects = await pullProjects('server-1', archiveConfig);

    expect(projects).toHaveLength(2);
    expect(projects[0]!.remoteId).toBe('proj-1');
    expect(projects[0]!.name).toBe('Forest Monitoring');
    expect(projects[0]!.sourceType).toBe('remoteArchive');
    expect(projects[0]!.sourceId).toBe('server-1');
    expect(projects[0]!.dirtyLocal).toBe(false);
    expect(projects[0]!.localId).toBe('remoteArchive:server-1:proj-1');
  });

  it('sends bearer auth header when pulling projects', async () => {
    let capturedAuth: string | null = null;
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects`, ({ request }) => {
        capturedAuth = request.headers.get('Authorization');
        return HttpResponse.json({ data: [] });
      }),
    );

    await pullProjects('server-1', archiveConfig);

    expect(capturedAuth).toBe(`Bearer ${archiveConfig.token}`);
  });

  it('pulls observations from archive and stores them locally', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-1/observations`, () =>
        HttpResponse.json(OBSERVATIONS_RESPONSE),
      ),
    );

    const observations = await pullObservations(
      'server-1',
      'proj-1',
      'local-proj-1',
      archiveConfig,
    );

    expect(observations).toHaveLength(1);
    expect(observations[0]!.remoteId).toBe('obs-1');
    expect(observations[0]!.tags?.species).toBe('tree');
    expect(observations[0]!.sourceType).toBe('remoteArchive');
    expect(observations[0]!.sourceId).toBe('server-1');
    expect(observations[0]!.projectLocalId).toBe('local-proj-1');
    expect(observations[0]!.localId).toBe('remoteArchive:server-1:obs-1');
  });

  it('pulls alerts from archive and stores them locally', async () => {
    server.use(
      http.get(
        `${archiveConfig.baseUrl}/projects/proj-1/remoteDetectionAlerts`,
        () => HttpResponse.json(ALERTS_RESPONSE),
      ),
    );

    const alerts = await pullAlerts(
      'server-1',
      'proj-1',
      'local-proj-1',
      archiveConfig,
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.remoteId).toBe('alert-1');
    expect(alerts[0]!.sourceType).toBe('remoteArchive');
    expect(alerts[0]!.sourceId).toBe('server-1');
    expect(alerts[0]!.projectLocalId).toBe('local-proj-1');
    expect(alerts[0]!.localId).toBe('remoteArchive:server-1:alert-1');
  });

  it('throws when archive returns error', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects`, () =>
        HttpResponse.json(
          { error: { code: 'FORBIDDEN', message: 'No access' } },
          { status: 403 },
        ),
      ),
    );

    await expect(pullProjects('server-1', archiveConfig)).rejects.toThrow();
  });

  it('is idempotent — calling pullProjects twice with same serverId upserts, not duplicates', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects`, () =>
        HttpResponse.json(PROJECTS_RESPONSE),
      ),
    );

    const first = await pullProjects('server-1', archiveConfig);
    const second = await pullProjects('server-1', archiveConfig);

    // Same deterministic localIds
    expect(second.map((p) => p.localId)).toEqual(first.map((p) => p.localId));

    // No duplicates in DB
    const db = getDb();
    const all = await db.projects.toArray();
    expect(all).toHaveLength(2);
  });
});
