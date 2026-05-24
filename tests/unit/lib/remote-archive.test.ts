import { server } from '@tests/mocks/node';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { getDb, resetDb } from '@/lib/db';
import {
  pullAlerts,
  pullObservations,
  pullPresets,
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
    expect(projects[0]!.localId).toBe(
      'remoteArchive:https://archive.example.com:proj-1',
    );
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
    expect(observations[0]!.localId).toBe(
      'remoteArchive:https://archive.example.com:obs-1',
    );
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
    expect(alerts[0]!.localId).toBe(
      'remoteArchive:https://archive.example.com:alert-1',
    );
    // Geometry is now properly preserved
    expect(alerts[0]!.geometry).toEqual({ type: 'Point', coordinates: [0, 0] });
  });

  it('pullAlerts persists metadata, geometry, detection dates, and remote sourceId', async () => {
    const fullAlertResponse = {
      data: [
        {
          docId: 'alert-full',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          deleted: false,
          geometry: { type: 'Point', coordinates: [102.0, 0.5] },
          metadata: { severity: 'high', type: 'deforestation' },
          detectionDateStart: '2024-03-14T00:00:00Z',
          detectionDateEnd: '2024-03-15T00:00:00Z',
          sourceId: 'source-1',
        },
      ],
    };

    server.use(
      http.get(
        `${archiveConfig.baseUrl}/projects/proj-1/remoteDetectionAlerts`,
        () => HttpResponse.json(fullAlertResponse),
      ),
    );

    const alerts = await pullAlerts(
      'server-1',
      'proj-1',
      'local-proj-1',
      archiveConfig,
    );

    expect(alerts).toHaveLength(1);
    const alert = alerts[0]!;

    // Persisted to DB via bulkPut
    const db = getDb();
    const stored = await db.alerts.get(alert.localId);
    expect(stored).toBeTruthy();

    expect(stored!.geometry).toEqual({
      type: 'Point',
      coordinates: [102.0, 0.5],
    });
    expect(stored!.metadata).toEqual({
      severity: 'high',
      type: 'deforestation',
    });
    expect(stored!.detectionDateStart).toBe('2024-03-14T00:00:00Z');
    expect(stored!.detectionDateEnd).toBe('2024-03-15T00:00:00Z');
    expect((stored! as unknown as Record<string, unknown>).remoteSourceId).toBe(
      'source-1',
    );
    // sourceId should still be serverId (not overwritten by API's sourceId)
    expect(stored!.sourceId).toBe('server-1');
  });

  it('pullAlerts tolerates alerts without optional fields', async () => {
    const minimalAlertResponse = {
      data: [
        {
          docId: 'alert-minimal',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          deleted: false,
          geometry: { type: 'Point', coordinates: [0, 0] },
        },
      ],
    };

    server.use(
      http.get(
        `${archiveConfig.baseUrl}/projects/proj-1/remoteDetectionAlerts`,
        () => HttpResponse.json(minimalAlertResponse),
      ),
    );

    const alerts = await pullAlerts(
      'server-1',
      'proj-1',
      'local-proj-1',
      archiveConfig,
    );

    expect(alerts).toHaveLength(1);
    const alert = alerts[0]!;

    // Must not throw when optional fields are absent
    expect(alert.metadata).toBeUndefined();
    expect(alert.detectionDateStart).toBeUndefined();
    expect(alert.detectionDateEnd).toBeUndefined();
    expect(
      (alert as unknown as Record<string, unknown>).remoteSourceId,
    ).toBeUndefined();
    // Geometry is required by schema, so it must be present
    expect(alert.geometry).toEqual({ type: 'Point', coordinates: [0, 0] });
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

  it('produces same localIds regardless of serverId — prevents duplicates from re-adding same server', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects`, () =>
        HttpResponse.json(PROJECTS_RESPONSE),
      ),
    );

    // Simulate first connection with server-1
    const first = await pullProjects('server-1', archiveConfig);

    // Simulate re-adding the same server (gets a new ID: server-2)
    // but same baseUrl — should produce the same localIds
    const second = await pullProjects('server-2', archiveConfig);

    // Same localIds despite different serverIds
    expect(second.map((p) => p.localId)).toEqual(first.map((p) => p.localId));

    // No duplicates in DB — upsert replaces, not duplicates
    const db = getDb();
    const all = await db.projects.toArray();
    expect(all).toHaveLength(2);
  });

  it('preserves createdAt across repeated syncs', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects`, () =>
        HttpResponse.json(PROJECTS_RESPONSE),
      ),
    );

    const db = getDb();

    // First pull
    await pullProjects('server-1', archiveConfig);
    const afterFirst = await db.projects.toArray();
    const firstCreatedAt = afterFirst[0]!.createdAt;

    // Wait a bit so new Date().toISOString() would differ
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Second pull with same data
    await pullProjects('server-1', archiveConfig);
    const afterSecond = await db.projects.toArray();

    // createdAt must NOT change on subsequent syncs
    expect(afterSecond[0]!.createdAt).toBe(firstCreatedAt);
  });

  it('preserves updatedAt when project data has not changed', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects`, () =>
        HttpResponse.json(PROJECTS_RESPONSE),
      ),
    );

    const db = getDb();

    // First pull
    await pullProjects('server-1', archiveConfig);
    const afterFirst = await db.projects.toArray();
    const firstUpdatedAt = afterFirst[0]!.updatedAt;

    // Wait a bit so new Date().toISOString() would differ
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Second pull with same data
    await pullProjects('server-1', archiveConfig);
    const afterSecond = await db.projects.toArray();

    // updatedAt must NOT change when name is the same
    expect(afterSecond[0]!.updatedAt).toBe(firstUpdatedAt);
  });

  it('parses attachment URLs and stores media counts in observation tags', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-1/observations`, () =>
        HttpResponse.json({
          data: [
            {
              docId: 'obs-media-1',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              deleted: false,
              lat: -8.35,
              lon: -55.45,
              attachments: [
                {
                  url: 'https://archive.example.com/projects/proj1/attachments/drive1/photo/img1',
                },
                {
                  url: 'https://archive.example.com/projects/proj1/attachments/drive2/photo/img2',
                },
                {
                  url: 'https://archive.example.com/projects/proj1/attachments/drive3/audio/rec1',
                },
              ],
              tags: { species: 'tree' },
            },
          ],
        }),
      ),
    );

    const observations = await pullObservations(
      'server-1',
      'proj-1',
      'local-proj-1',
      archiveConfig,
    );

    expect(observations).toHaveLength(1);
    const obs = observations[0]!;
    // Original tags preserved
    expect(obs.tags?.species).toBe('tree');
    // Media counts stored as strings
    expect(obs.tags?.photoCount).toBe('2');
    expect(obs.tags?.audioCount).toBe('1');
    // Photo URLs stored as comma-separated string
    expect(obs.tags?.photoUrls).toContain('drive1/photo/img1');
    expect(obs.tags?.photoUrls).toContain('drive2/photo/img2');
  });

  it('resolves relative photo attachment URLs against the archive base URL before storing', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-1/observations`, () =>
        HttpResponse.json({
          data: [
            {
              docId: 'obs-relative-media',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              deleted: false,
              attachments: [
                {
                  url: '/projects/proj1/attachments/drive1/photo/img1',
                },
              ],
              tags: {},
            },
          ],
        }),
      ),
    );

    const observations = await pullObservations(
      'server-1',
      'proj-1',
      'local-proj-1',
      archiveConfig,
    );

    expect(observations[0]!.tags?.photoUrls).toBe(
      'https://archive.example.com/projects/proj1/attachments/drive1/photo/img1',
    );
  });

  it('handles observations with no attachments', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-1/observations`, () =>
        HttpResponse.json({
          data: [
            {
              docId: 'obs-no-media',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              deleted: false,
              attachments: [],
              tags: { notes: 'No media' },
            },
          ],
        }),
      ),
    );

    const observations = await pullObservations(
      'server-1',
      'proj-1',
      'local-proj-1',
      archiveConfig,
    );

    expect(observations).toHaveLength(1);
    const obs = observations[0]!;
    expect(obs.tags?.notes).toBe('No media');
    expect(obs.tags?.photoCount).toBeUndefined();
    expect(obs.tags?.audioCount).toBeUndefined();
    expect(obs.tags?.photoUrls).toBeUndefined();
  });

  it('limits stored photo URLs to 4', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-1/observations`, () =>
        HttpResponse.json({
          data: [
            {
              docId: 'obs-many-photos',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              deleted: false,
              attachments: [
                { url: 'https://example.com/attachments/d1/photo/a' },
                { url: 'https://example.com/attachments/d2/photo/b' },
                { url: 'https://example.com/attachments/d3/photo/c' },
                { url: 'https://example.com/attachments/d4/photo/d' },
                { url: 'https://example.com/attachments/d5/photo/e' },
              ],
              tags: {},
            },
          ],
        }),
      ),
    );

    const observations = await pullObservations(
      'server-1',
      'proj-1',
      'local-proj-1',
      archiveConfig,
    );

    const obs = observations[0]!;
    expect(obs.tags?.photoCount).toBe('5');
    const urls = obs.tags?.photoUrls?.split(',').length;
    expect(urls).toBe(4); // Only first 4 stored
  });

  it('updates updatedAt when project name changes', async () => {
    const db = getDb();

    // First pull with name "Forest Monitoring"
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects`, () =>
        HttpResponse.json({
          data: [{ projectId: 'proj-1', name: 'Forest Monitoring' }],
        }),
      ),
    );
    await pullProjects('server-1', archiveConfig);
    const afterFirst = await db.projects.toArray();
    const firstUpdatedAt = afterFirst[0]!.updatedAt;

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Second pull with changed name
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects`, () =>
        HttpResponse.json({
          data: [{ projectId: 'proj-1', name: 'Updated Forest Name' }],
        }),
      ),
    );
    await pullProjects('server-1', archiveConfig);
    const afterSecond = await db.projects.toArray();

    // updatedAt should change when name changed
    expect(afterSecond[0]!.updatedAt).not.toBe(firstUpdatedAt);
    expect(afterSecond[0]!.name).toBe('Updated Forest Name');
  });
});

describe('pullPresets', () => {
  const PRESETS_RESPONSE = {
    data: [
      {
        docId: 'preset-001',
        versionId: 'preset-001/0',
        originalVersionId: 'preset-001/0',
        schemaName: 'preset' as const,
        createdAt: '2024-03-15T10:00:00Z',
        updatedAt: '2024-03-15T10:00:00Z',
        links: [],
        deleted: false,
        name: 'Deforestation',
        geometry: ['point', 'area'] as const,
        tags: { category: 'forest-risk' },
        addTags: {},
        removeTags: {},
        fieldRefs: ['field-001'],
        iconRef: {
          docId: 'icon-001',
          versionId: 'icon-001/0',
          url: '/presets/icon-001',
        },
        color: '#FF5733',
        terms: ['logging', 'clear-cut'],
      },
      {
        docId: 'preset-002',
        versionId: 'preset-002/0',
        originalVersionId: 'preset-002/0',
        schemaName: 'preset' as const,
        createdAt: '2024-03-14T14:00:00Z',
        updatedAt: '2024-03-14T14:00:00Z',
        links: [],
        deleted: false,
        name: 'Water Contamination',
        geometry: ['point'] as const,
        tags: { category: 'water-risk' },
        addTags: {},
        removeTags: {},
        fieldRefs: [],
        color: '#3357FF',
        terms: ['river', 'pollution'],
      },
    ],
  };

  it('fetches presets from API and stores in DB', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-remote-1/preset`, () =>
        HttpResponse.json(PRESETS_RESPONSE),
      ),
    );
    const config = {
      baseUrl: archiveConfig.baseUrl,
      token: archiveConfig.token,
    };
    const presets = await pullPresets(
      'server-1',
      'proj-remote-1',
      'proj-local-1',
      config,
    );
    expect(presets).toHaveLength(2);
    expect(presets[0]!.name).toBe('Deforestation');
    expect(presets[0]!.projectLocalId).toBe('proj-local-1');

    const db = getDb();
    const stored = await db.presets
      .where('projectLocalId')
      .equals('proj-local-1')
      .toArray();
    expect(stored).toHaveLength(2);
  });

  it('overwrites existing presets for the same localId on re-sync', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-remote-1/preset`, () =>
        HttpResponse.json(PRESETS_RESPONSE),
      ),
    );
    const config = {
      baseUrl: archiveConfig.baseUrl,
      token: archiveConfig.token,
    };
    await pullPresets('server-1', 'proj-remote-1', 'proj-local-1', config);
    await pullPresets('server-1', 'proj-remote-1', 'proj-local-1', config);
    const db = getDb();
    const stored = await db.presets
      .where('projectLocalId')
      .equals('proj-local-1')
      .toArray();
    expect(stored).toHaveLength(2); // not duplicated
  });

  it('skips deleted presets', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-remote-1/preset`, () =>
        HttpResponse.json({
          data: [
            {
              docId: 'preset-del',
              versionId: 'preset-del/0',
              originalVersionId: 'preset-del/0',
              schemaName: 'preset' as const,
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              links: [],
              deleted: true,
              name: 'Deleted',
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
    const config = {
      baseUrl: archiveConfig.baseUrl,
      token: archiveConfig.token,
    };
    const presets = await pullPresets(
      'server-1',
      'proj-remote-1',
      'proj-local-1',
      config,
    );
    expect(presets).toHaveLength(0);
  });
});

describe('pullObservations with presetRef', () => {
  it('preserves presetRef on stored observations', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-1/observations`, () =>
        HttpResponse.json({
          data: [
            {
              docId: 'obs-preset-1',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              deleted: false,
              attachments: [],
              tags: { category: 'forest' },
              presetRef: {
                docId: 'preset-forest',
                versionId: 'v1',
                url: '/projects/proj-1/preset/preset-forest',
              },
            },
          ],
        }),
      ),
    );

    const observations = await pullObservations(
      'server-1',
      'proj-1',
      'proj-local-1',
      archiveConfig,
    );

    expect(observations).toHaveLength(1);
    const obs = observations[0]!;
    expect(obs.tags?.category).toBe('forest');
    expect(obs.tags?.presetRefDocId).toBe('preset-forest');
  });
});
