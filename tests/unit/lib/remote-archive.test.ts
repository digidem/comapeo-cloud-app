import { server } from '@tests/mocks/node';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { getDb, resetDb } from '@/lib/db';
import {
  deriveAttachmentsFromObservations,
  pullAlerts,
  pullFields,
  pullObservations,
  pullPresets,
  pullProjects,
  pullTracks,
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

  it('keeps basic project info when per-project detail fetch fails', async () => {
    // /projects lists 2 projects; /projects/:id fails for proj-2 with 500
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects`, () =>
        HttpResponse.json({
          data: [
            { projectId: 'proj-1', name: 'Project One' },
            { projectId: 'proj-2', name: 'Project Two' },
          ],
        }),
      ),
      http.get(`${archiveConfig.baseUrl}/projects/proj-1`, () =>
        HttpResponse.json({
          data: {
            projectId: 'proj-1',
            name: 'Project One',
            description: 'first description',
          },
        }),
      ),
      http.get(
        `${archiveConfig.baseUrl}/projects/proj-2`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    const projects = await pullProjects('server-1', archiveConfig);

    expect(projects).toHaveLength(2);
    const byRemoteId = new Map(projects.map((p) => [p.remoteId, p]));
    // proj-1 got the detail
    expect(byRemoteId.get('proj-1')?.description).toBe('first description');
    // proj-2 still saved with basic info only — NOT silently dropped
    expect(byRemoteId.get('proj-2')?.name).toBe('Project Two');
    expect(byRemoteId.get('proj-2')?.description).toBeUndefined();
  });

  it('preserves previously-synced description and iconRef when detail fetch fails on re-sync', async () => {
    const db = getDb();

    // First sync: detail fetch succeeds, stores description and iconRef
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects`, () =>
        HttpResponse.json({
          data: [{ projectId: 'proj-detail', name: 'Detail Project' }],
        }),
      ),
      http.get(`${archiveConfig.baseUrl}/projects/proj-detail`, () =>
        HttpResponse.json({
          data: {
            projectId: 'proj-detail',
            name: 'Detail Project',
            description: 'Important description',
            iconRef: {
              docId: 'icon-1',
              name: 'tree.png',
              contentType: 'image/png',
            },
          },
        }),
      ),
    );
    await pullProjects('server-1', archiveConfig);

    const afterFirst = await db.projects.toArray();
    expect(afterFirst[0]!.description).toBe('Important description');
    expect(afterFirst[0]!.iconRef?.docId).toBe('icon-1');

    // Second sync: detail fetch fails transiently with 500
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects`, () =>
        HttpResponse.json({
          data: [{ projectId: 'proj-detail', name: 'Detail Project' }],
        }),
      ),
      http.get(
        `${archiveConfig.baseUrl}/projects/proj-detail`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    await pullProjects('server-1', archiveConfig);

    const afterSecond = await db.projects.toArray();
    // description and iconRef must be preserved, NOT wiped
    expect(afterSecond[0]!.description).toBe('Important description');
    expect(afterSecond[0]!.iconRef?.docId).toBe('icon-1');
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

  it('stores first-class attachment records while keeping tag compatibility', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-1/observations`, () =>
        HttpResponse.json({
          data: [
            {
              docId: 'obs-attachments-1',
              versionId: 'obs-attachments-1/0',
              originalVersionId: 'obs-attachments-1/0',
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
                  hash: 'hash-1',
                  mimeType: 'image/jpeg',
                  url: '/projects/proj-1/attachments/drive1/photo/img1.jpg',
                },
                {
                  url: '/projects/proj-1/attachments/drive2/audio/rec1.m4a',
                },
              ],
              metadata: { manualLocation: true },
              tags: { species: 'tree' },
              presetRef: {
                docId: 'preset-1',
                versionId: 'preset-1/0',
                url: '/projects/proj-1/preset/preset-1',
              },
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

    const db = getDb();
    const storedObservation = await db.observations.get(
      observations[0]!.localId,
    );
    expect(storedObservation!.metadata).toEqual({ manualLocation: true });
    expect(storedObservation!.presetRefDocId).toBe('preset-1');
    expect(storedObservation!.presetRef?.versionId).toBe('preset-1/0');
    expect(storedObservation!.versionId).toBe('obs-attachments-1/0');

    const attachments = await db.attachments
      .where('observationLocalId')
      .equals(storedObservation!.localId)
      .toArray();
    expect(attachments).toHaveLength(2);
    expect(attachments[0]!).toMatchObject({
      projectLocalId: 'local-proj-1',
      observationLocalId: storedObservation!.localId,
      driveId: 'drive1',
      type: 'photo',
      name: 'img1.jpg',
      hash: 'hash-1',
      mediaType: 'photo',
      contentType: 'image/jpeg',
      downloadStatus: 'remote-only',
      deleted: false,
    });
    expect(attachments[0]!.resolvedUrl).toBe(
      'https://archive.example.com/projects/proj-1/attachments/drive1/photo/img1.jpg',
    );
    expect(storedObservation!.tags?.photoCount).toBe('1');
    expect(storedObservation!.tags?.audioCount).toBe('1');
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

  it('uses stable per-attachment localIds so re-sync preserves identity', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-1/observations`, () =>
        HttpResponse.json({
          data: [
            {
              docId: 'obs-stable-1',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              deleted: false,
              attachments: [
                {
                  driveId: 'driveA',
                  type: 'photo',
                  name: 'first.jpg',
                  url: '/projects/proj-1/attachments/driveA/photo/first.jpg',
                },
                {
                  driveId: 'driveA',
                  type: 'photo',
                  name: 'middle.jpg',
                  url: '/projects/proj-1/attachments/driveA/photo/middle.jpg',
                },
                {
                  driveId: 'driveA',
                  type: 'photo',
                  name: 'last.jpg',
                  url: '/projects/proj-1/attachments/driveA/photo/last.jpg',
                },
              ],
              tags: {},
            },
          ],
        }),
      ),
    );

    await pullObservations('server-1', 'proj-1', 'local-proj-1', archiveConfig);

    const db = getDb();
    const syncedObservationLocalId =
      'remoteArchive:https://archive.example.com:obs-stable-1';
    const before = await db.attachments
      .where('observationLocalId')
      .equals(syncedObservationLocalId)
      .toArray();
    const localIdsBefore = before.map((a) => a.localId).sort();
    expect(before).toHaveLength(3);

    // Re-sync with the middle attachment removed server-side. The other
    // two must keep their localIds and the middle one must be tombstoned.
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-1/observations`, () =>
        HttpResponse.json({
          data: [
            {
              docId: 'obs-stable-1',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              deleted: false,
              attachments: [
                {
                  driveId: 'driveA',
                  type: 'photo',
                  name: 'first.jpg',
                  url: '/projects/proj-1/attachments/driveA/photo/first.jpg',
                },
                {
                  driveId: 'driveA',
                  type: 'photo',
                  name: 'last.jpg',
                  url: '/projects/proj-1/attachments/driveA/photo/last.jpg',
                },
              ],
              tags: {},
            },
          ],
        }),
      ),
    );

    await pullObservations('server-1', 'proj-1', 'local-proj-1', archiveConfig);

    const after = await db.attachments
      .where('observationLocalId')
      .equals(syncedObservationLocalId)
      .toArray();
    const localIdsAfter = after.map((a) => a.localId).sort();
    expect(localIdsAfter).toEqual(localIdsBefore);

    const byName = new Map(after.map((a) => [a.name, a]));
    expect(byName.get('first.jpg')?.deleted).toBe(false);
    expect(byName.get('last.jpg')?.deleted).toBe(false);
    expect(byName.get('middle.jpg')?.deleted).toBe(true);
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
        fieldRefs: [
          {
            docId: 'field-001',
            versionId: 'field-001/0',
            url: '/projects/proj1/field/field-001',
          },
        ],
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

  it('pre-caches category icon blobs during sync', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-remote-1/preset`, () =>
        HttpResponse.json(PRESETS_RESPONSE),
      ),
      // Serve a TypedArray body (undici can stream it in node, unlike a Blob).
      http.get(
        `${archiveConfig.baseUrl}/projects/proj-remote-1/icon/icon-001`,
        () =>
          new HttpResponse(new Uint8Array([60, 115, 118, 103, 47, 62]), {
            status: 200,
            headers: { 'Content-Type': 'image/svg+xml' },
          }),
      ),
    );
    const config = {
      baseUrl: archiveConfig.baseUrl,
      token: archiveConfig.token,
    };
    await pullPresets('server-1', 'proj-remote-1', 'proj-local-1', config);

    // The cache key must match what the UI derives via buildIconUrl, i.e.
    // `${serverUrl}/projects/${projectRemoteId}/icon/${iconDocId}`.
    const { getCachedIconBlob } = await import('@/lib/db');
    const cached = await getCachedIconBlob(
      `${archiveConfig.baseUrl}/projects/proj-remote-1/icon/icon-001`,
    );
    expect(cached).toBeInstanceOf(Blob);
  });

  it('does not fail preset sync when icon pre-fetch fails', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-remote-1/preset`, () =>
        HttpResponse.json(PRESETS_RESPONSE),
      ),
      http.get(
        `${archiveConfig.baseUrl}/projects/proj-remote-1/icon/icon-001`,
        () => new HttpResponse(null, { status: 500 }),
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
    // Preset sync still succeeds despite the icon fetch failing.
    expect(presets).toHaveLength(2);
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

describe('pullTracks', () => {
  it('fetches singular track endpoint and stores tracks including tombstones', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-remote-1/track`, () =>
        HttpResponse.json({
          data: [
            {
              docId: 'track-1',
              versionId: 'track-1/0',
              originalVersionId: 'track-1/0',
              schemaName: 'track',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:10:00Z',
              links: [],
              deleted: false,
              locations: [
                {
                  coords: { latitude: -8.35, longitude: -55.45 },
                  timestamp: '2024-01-01T00:01:00Z',
                  accuracy: 6,
                  altitude: 30,
                },
              ],
              observationRefs: [
                {
                  docId: 'obs-1',
                  versionId: 'obs-1/0',
                  url: '/projects/proj-remote-1/observation/obs-1',
                },
              ],
              tags: { patrol: 'north' },
              presetRef: {
                docId: 'preset-track',
                versionId: 'preset-track/0',
                url: '/projects/proj-remote-1/preset/preset-track',
              },
            },
            {
              docId: 'track-deleted',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:10:00Z',
              deleted: true,
              locations: [],
              observationRefs: [],
              tags: {},
            },
          ],
        }),
      ),
    );

    const tracks = await pullTracks(
      'server-1',
      'proj-remote-1',
      'proj-local-1',
      archiveConfig,
    );

    expect(tracks).toHaveLength(1);
    expect(tracks[0]!.remoteId).toBe('track-1');
    expect(tracks[0]!.presetRefDocId).toBe('preset-track');

    const db = getDb();
    const stored = await db.tracks
      .where('projectLocalId')
      .equals('proj-local-1')
      .toArray();
    expect(stored).toHaveLength(2);
    expect(stored.find((t) => t.remoteId === 'track-deleted')!.deleted).toBe(
      true,
    );
    expect(
      stored.find((t) => t.remoteId === 'track-1')!.locations[0]!.coords,
    ).toEqual({ latitude: -8.35, longitude: -55.45 });
  });

  it('tombstones previously-synced tracks when a later sync returns empty data', async () => {
    // First sync returns track-1
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-remote-1/track`, () =>
        HttpResponse.json({
          data: [
            {
              docId: 'track-1',
              versionId: 'track-1/0',
              originalVersionId: 'track-1/0',
              schemaName: 'track',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              links: [],
              deleted: false,
              tags: {},
              locations: [
                {
                  coords: { latitude: -8.35, longitude: -55.45 },
                  timestamp: '2024-01-01T00:00:00Z',
                },
              ],
              observationRefs: [],
            },
          ],
        }),
      ),
    );
    const first = await pullTracks(
      'srv-1',
      'proj-remote-1',
      'proj-local-1',
      archiveConfig,
    );
    expect(first).toHaveLength(1);
    expect(first[0]!.deleted).toBe(false);

    // Second sync returns empty — track-1 should be tombstoned, not lingering
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-remote-1/track`, () =>
        HttpResponse.json({ data: [] }),
      ),
    );
    const second = await pullTracks(
      'srv-1',
      'proj-remote-1',
      'proj-local-1',
      archiveConfig,
    );

    // Caller-visible: empty result (stale tracks no longer surface)
    expect(second).toEqual([]);

    // Stored: track-1 row now has deleted: true (tombstone, not lingering as live)
    const db = getDb();
    const stored = await db.tracks
      .where('projectLocalId')
      .equals('proj-local-1')
      .toArray();
    const track1 = stored.find((t) => t.remoteId === 'track-1');
    expect(track1).toBeDefined();
    expect(track1!.deleted).toBe(true);
  });
});

describe('pullFields', () => {
  it('fetches singular field endpoint and stores fields including tombstones', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-remote-1/field`, () =>
        HttpResponse.json({
          data: [
            {
              docId: 'field-1',
              versionId: 'field-1/0',
              originalVersionId: 'field-1/0',
              schemaName: 'field',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:10:00Z',
              links: [],
              deleted: false,
              type: 'select_one',
              key: 'condition',
              label: 'Condition',
              placeholder: 'Choose one',
              universal: false,
              options: [{ label: 'Good', value: 'good' }],
            },
            {
              docId: 'field-deleted',
              versionId: 'field-deleted/0',
              originalVersionId: 'field-deleted/0',
              schemaName: 'field',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:10:00Z',
              links: [],
              deleted: true,
              type: 'text',
              key: 'deleted',
              label: 'Deleted',
              universal: false,
            },
          ],
        }),
      ),
    );

    const fields = await pullFields(
      'server-1',
      'proj-remote-1',
      'proj-local-1',
      archiveConfig,
    );

    expect(fields).toHaveLength(1);
    expect(fields[0]!.key).toBe('condition');

    const db = getDb();
    const stored = await db.fields
      .where('projectLocalId')
      .equals('proj-local-1')
      .toArray();
    expect(stored).toHaveLength(2);
    expect(stored.find((f) => f.remoteId === 'field-deleted')!.deleted).toBe(
      true,
    );
    expect(stored.find((f) => f.remoteId === 'field-1')!.options).toEqual([
      { label: 'Good', value: 'good' },
    ]);
  });

  it('tombstones previously-synced fields when a later sync returns empty data', async () => {
    // First sync returns field-1
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-remote-1/field`, () =>
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
              key: 'species',
              label: 'Species',
              universal: true,
            },
          ],
        }),
      ),
    );
    const first = await pullFields(
      'srv-1',
      'proj-remote-1',
      'proj-local-1',
      archiveConfig,
    );
    expect(first).toHaveLength(1);
    expect(first[0]!.deleted).toBe(false);

    // Second sync returns empty — field-1 should be tombstoned
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-remote-1/field`, () =>
        HttpResponse.json({ data: [] }),
      ),
    );
    const second = await pullFields(
      'srv-1',
      'proj-remote-1',
      'proj-local-1',
      archiveConfig,
    );

    expect(second).toEqual([]);

    const db = getDb();
    const stored = await db.fields
      .where('projectLocalId')
      .equals('proj-local-1')
      .toArray();
    const field1 = stored.find((f) => f.remoteId === 'field-1');
    expect(field1).toBeDefined();
    expect(field1!.deleted).toBe(true);
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

  it('coerces non-string tag values to strings in enrichedTags', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-1/observations`, () =>
        HttpResponse.json({
          data: [
            {
              docId: 'obs-nonstringtags',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              deleted: false,
              attachments: [],
              tags: {
                count: 42,
                active: true,
                ratio: 3.14,
                label: 'forest',
              },
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
    // Non-string values must be coerced so enrichedTags stays Record<string,string>
    expect(obs.tags?.count).toBe('42');
    expect(obs.tags?.active).toBe('true');
    expect(obs.tags?.ratio).toBe('3.14');
    expect(obs.tags?.label).toBe('forest');
  });
});

// ---------------------------------------------------------------------------
// pullTracks
// ---------------------------------------------------------------------------

describe('pullTracks', () => {
  const TRACKS_RESPONSE = {
    data: [
      {
        docId: 'track-001',
        versionId: 'track-001/0',
        originalVersionId: 'track-001/0',
        schemaName: 'track' as const,
        createdAt: '2024-03-15T08:00:00Z',
        updatedAt: '2024-03-15T08:30:00Z',
        links: [],
        deleted: false,
        locations: [
          {
            coords: { latitude: -8.35, longitude: -55.45 },
            timestamp: '2024-03-15T08:00:00Z',
          },
          {
            coords: { latitude: -8.36, longitude: -55.44 },
            timestamp: '2024-03-15T08:10:00Z',
          },
        ],
        observationRefs: [
          {
            docId: 'obs-001',
            versionId: 'obs-001/0',
            url: '/projects/proj1/observation/obs-001',
          },
        ],
        tags: { device: 'gps-tracker' },
        presetRef: {
          docId: 'preset-001',
          versionId: 'preset-001/0',
          url: '/projects/proj1/preset/preset-001',
        },
      },
      {
        docId: 'track-002',
        versionId: 'track-002/0',
        originalVersionId: 'track-002/0',
        schemaName: 'track' as const,
        createdAt: '2024-03-14T10:00:00Z',
        updatedAt: '2024-03-14T10:30:00Z',
        links: [],
        deleted: false,
        locations: [
          {
            coords: { latitude: -8.4, longitude: -55.5 },
            timestamp: '2024-03-14T10:00:00Z',
          },
        ],
        observationRefs: [],
        tags: {},
      },
    ],
  };

  it('fetches tracks from API and stores in DB', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-remote-1/track`, () =>
        HttpResponse.json(TRACKS_RESPONSE),
      ),
    );
    const config = {
      baseUrl: archiveConfig.baseUrl,
      token: archiveConfig.token,
    };
    const tracks = await pullTracks(
      'server-1',
      'proj-remote-1',
      'proj-local-1',
      config,
    );
    expect(tracks).toHaveLength(2);
    expect(tracks[0]!.remoteId).toBe('track-001');
    expect(tracks[0]!.projectLocalId).toBe('proj-local-1');
    expect(tracks[0]!.locations).toHaveLength(2);
    expect(tracks[0]!.locations![0]!.coords).toEqual({
      latitude: -8.35,
      longitude: -55.45,
    });
    expect(tracks[0]!.presetRef).toEqual({
      docId: 'preset-001',
      versionId: 'preset-001/0',
      url: '/projects/proj1/preset/preset-001',
    });
    expect(tracks[0]!.observationRefs).toEqual([
      {
        docId: 'obs-001',
        versionId: 'obs-001/0',
        url: '/projects/proj1/observation/obs-001',
      },
    ]);

    const db = getDb();
    const stored = await db.tracks
      .where('projectLocalId')
      .equals('proj-local-1')
      .toArray();
    expect(stored).toHaveLength(2);
    // Assert the persisted DB row keeps the full RemoteDocRef object (not
    // a flattened string/string[]) — verifies lossless storage end-to-end.
    const storedTrack = stored.find((t) => t.remoteId === 'track-001');
    expect(storedTrack?.presetRef).toEqual({
      docId: 'preset-001',
      versionId: 'preset-001/0',
      url: '/projects/proj1/preset/preset-001',
    });
    expect(storedTrack?.observationRefs).toEqual([
      {
        docId: 'obs-001',
        versionId: 'obs-001/0',
        url: '/projects/proj1/observation/obs-001',
      },
    ]);
  });

  it('overwrites existing tracks for the same localId on re-sync', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-remote-1/track`, () =>
        HttpResponse.json(TRACKS_RESPONSE),
      ),
    );
    const config = {
      baseUrl: archiveConfig.baseUrl,
      token: archiveConfig.token,
    };
    await pullTracks('server-1', 'proj-remote-1', 'proj-local-1', config);
    await pullTracks('server-1', 'proj-remote-1', 'proj-local-1', config);
    const db = getDb();
    const stored = await db.tracks
      .where('projectLocalId')
      .equals('proj-local-1')
      .toArray();
    expect(stored).toHaveLength(2);
  });

  it('skips deleted tracks from the return value but stores tombstones', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-remote-1/track`, () =>
        HttpResponse.json({
          data: [
            {
              docId: 'track-del',
              versionId: 'track-del/0',
              originalVersionId: 'track-del/0',
              schemaName: 'track' as const,
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              links: [],
              deleted: true,
              locations: [],
              observationRefs: [],
              tags: {},
            },
          ],
        }),
      ),
    );
    const config = {
      baseUrl: archiveConfig.baseUrl,
      token: archiveConfig.token,
    };
    const tracks = await pullTracks(
      'server-1',
      'proj-remote-1',
      'proj-local-1',
      config,
    );
    expect(tracks).toHaveLength(0);

    const db = getDb();
    const stored = await db.tracks.toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.deleted).toBe(true);
    expect(stored[0]!.remoteId).toBe('track-del');
  });

  it('uses stable localId based on normalized baseUrl', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-remote-1/track`, () =>
        HttpResponse.json(TRACKS_RESPONSE),
      ),
    );
    const config = {
      baseUrl: archiveConfig.baseUrl,
      token: archiveConfig.token,
    };
    const tracks = await pullTracks(
      'server-1',
      'proj-remote-1',
      'proj-local-1',
      config,
    );
    expect(tracks[0]!.localId).toBe(
      'remoteArchive:https://archive.example.com:track-001',
    );
  });
});

// ---------------------------------------------------------------------------
// pullFields
// ---------------------------------------------------------------------------

describe('pullFields', () => {
  const FIELDS_RESPONSE = {
    data: [
      {
        docId: 'field-001',
        versionId: 'field-001/0',
        originalVersionId: 'field-001/0',
        schemaName: 'field' as const,
        createdAt: '2024-03-15T10:00:00Z',
        updatedAt: '2024-03-15T10:00:00Z',
        links: [],
        deleted: false,
        type: 'text' as const,
        key: 'notes',
        label: 'Notes',
        placeholder: 'Enter notes...',
        universal: false,
      },
      {
        docId: 'field-002',
        versionId: 'field-002/0',
        originalVersionId: 'field-002/0',
        schemaName: 'field' as const,
        createdAt: '2024-03-14T14:00:00Z',
        updatedAt: '2024-03-14T14:00:00Z',
        links: [],
        deleted: false,
        type: 'select_one' as const,
        key: 'severity',
        label: 'Severity',
        universal: true,
        options: [
          { label: 'Low', value: 'low' },
          { label: 'High', value: 'high' },
        ],
      },
    ],
  };

  it('fetches fields from API and stores in DB', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-remote-1/field`, () =>
        HttpResponse.json(FIELDS_RESPONSE),
      ),
    );
    const config = {
      baseUrl: archiveConfig.baseUrl,
      token: archiveConfig.token,
    };
    const fields = await pullFields(
      'server-1',
      'proj-remote-1',
      'proj-local-1',
      config,
    );
    expect(fields).toHaveLength(2);
    expect(fields[0]!.key).toBe('notes');
    expect(fields[0]!.type).toBe('text');
    expect(fields[0]!.projectLocalId).toBe('proj-local-1');
    expect(fields[1]!.options).toEqual([
      { label: 'Low', value: 'low' },
      { label: 'High', value: 'high' },
    ]);

    const db = getDb();
    const stored = await db.fields
      .where('projectLocalId')
      .equals('proj-local-1')
      .toArray();
    expect(stored).toHaveLength(2);
  });

  it('overwrites existing fields for the same localId on re-sync', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-remote-1/field`, () =>
        HttpResponse.json(FIELDS_RESPONSE),
      ),
    );
    const config = {
      baseUrl: archiveConfig.baseUrl,
      token: archiveConfig.token,
    };
    await pullFields('server-1', 'proj-remote-1', 'proj-local-1', config);
    await pullFields('server-1', 'proj-remote-1', 'proj-local-1', config);
    const db = getDb();
    const stored = await db.fields
      .where('projectLocalId')
      .equals('proj-local-1')
      .toArray();
    expect(stored).toHaveLength(2);
  });

  it('skips deleted fields from return value but stores tombstones', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-remote-1/field`, () =>
        HttpResponse.json({
          data: [
            {
              docId: 'field-del',
              versionId: 'field-del/0',
              originalVersionId: 'field-del/0',
              schemaName: 'field' as const,
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              links: [],
              deleted: true,
              type: 'text' as const,
              key: 'deleted_field',
              label: 'Deleted Field',
              universal: false,
            },
          ],
        }),
      ),
    );
    const config = {
      baseUrl: archiveConfig.baseUrl,
      token: archiveConfig.token,
    };
    const fields = await pullFields(
      'server-1',
      'proj-remote-1',
      'proj-local-1',
      config,
    );
    expect(fields).toHaveLength(0);

    const db = getDb();
    const stored = await db.fields.toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.deleted).toBe(true);
    expect(stored[0]!.remoteId).toBe('field-del');
  });

  it('uses stable localId based on normalized baseUrl', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-remote-1/field`, () =>
        HttpResponse.json(FIELDS_RESPONSE),
      ),
    );
    const config = {
      baseUrl: archiveConfig.baseUrl,
      token: archiveConfig.token,
    };
    const fields = await pullFields(
      'server-1',
      'proj-remote-1',
      'proj-local-1',
      config,
    );
    expect(fields[0]!.localId).toBe(
      'remoteArchive:https://archive.example.com:field-001',
    );
  });
});

// ---------------------------------------------------------------------------
// deriveAttachmentsFromObservations
// ---------------------------------------------------------------------------

describe('deriveAttachmentsFromObservations', () => {
  it('derives attachment records from observation attachments', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-1/observations`, () =>
        HttpResponse.json({
          data: [
            {
              docId: 'obs-attach-1',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              deleted: false,
              attachments: [
                {
                  url: 'https://archive.example.com/projects/proj1/attachments/drive1/photo/img1',
                },
                {
                  url: 'https://archive.example.com/projects/proj1/attachments/drive2/audio/rec1',
                },
              ],
              tags: {},
            },
          ],
        }),
      ),
    );

    await deriveAttachmentsFromObservations(
      'server-1',
      'proj-1',
      'proj-local-1',
      archiveConfig,
    );

    const db = getDb();
    const attachments = await db.attachments
      .where('projectLocalId')
      .equals('proj-local-1')
      .toArray();
    expect(attachments).toHaveLength(2);

    const photo = attachments.find((a) => a.mediaType === 'photo');
    expect(photo).toBeDefined();
    expect(photo!.observationLocalId).toBe(
      'remoteArchive:https://archive.example.com:obs-attach-1',
    );
    expect(photo!.mediaType).toBe('photo');

    const audio = attachments.find((a) => a.mediaType === 'audio');
    expect(audio).toBeDefined();
    expect(audio!.mediaType).toBe('audio');
  });

  it('skips deleted observations when deriving attachments', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-1/observations`, () =>
        HttpResponse.json({
          data: [
            {
              docId: 'obs-deleted',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              deleted: true,
              attachments: [
                {
                  url: 'https://archive.example.com/projects/proj1/attachments/drive1/photo/img1',
                },
              ],
              tags: {},
            },
          ],
        }),
      ),
    );

    await deriveAttachmentsFromObservations(
      'server-1',
      'proj-1',
      'proj-local-1',
      archiveConfig,
    );

    const db = getDb();
    const attachments = await db.attachments.toArray();
    expect(attachments).toHaveLength(0);
  });

  it('resolves relative attachment URLs against archive baseUrl', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-1/observations`, () =>
        HttpResponse.json({
          data: [
            {
              docId: 'obs-relative',
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

    await deriveAttachmentsFromObservations(
      'server-1',
      'proj-1',
      'proj-local-1',
      archiveConfig,
    );

    const db = getDb();
    const attachments = await db.attachments.toArray();
    expect(attachments).toHaveLength(1);
    expect(attachments[0]!.resolvedUrl).toBe(
      'https://archive.example.com/projects/proj1/attachments/drive1/photo/img1',
    );
  });

  it('handles observations with no attachments gracefully', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-1/observations`, () =>
        HttpResponse.json({
          data: [
            {
              docId: 'obs-no-attach',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              deleted: false,
              attachments: [],
              tags: {},
            },
          ],
        }),
      ),
    );

    await deriveAttachmentsFromObservations(
      'server-1',
      'proj-1',
      'proj-local-1',
      archiveConfig,
    );

    const db = getDb();
    const attachments = await db.attachments.toArray();
    expect(attachments).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tombstone tests (deleted rows preserved)
// ---------------------------------------------------------------------------

describe('tombstone handling across data types', () => {
  it('pullObservations stores deleted=true tombstones in DB', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-1/observations`, () =>
        HttpResponse.json({
          data: [
            {
              docId: 'obs-del-1',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              deleted: true,
              attachments: [],
              tags: {},
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
    expect(observations[0]!.deleted).toBe(true);

    const db = getDb();
    const stored = await db.observations.get(observations[0]!.localId);
    expect(stored).toBeDefined();
    expect(stored!.deleted).toBe(true);
  });

  it('pullAlerts stores deleted=true tombstones in DB', async () => {
    server.use(
      http.get(
        `${archiveConfig.baseUrl}/projects/proj-1/remoteDetectionAlerts`,
        () =>
          HttpResponse.json({
            data: [
              {
                docId: 'alert-del',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
                deleted: true,
                geometry: { type: 'Point', coordinates: [0, 0] },
              },
            ],
          }),
      ),
    );

    const alerts = await pullAlerts(
      'server-1',
      'proj-1',
      'proj-local-1',
      archiveConfig,
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.deleted).toBe(true);

    const db = getDb();
    const stored = await db.alerts.get(alerts[0]!.localId);
    expect(stored).toBeDefined();
    expect(stored!.deleted).toBe(true);
  });

  it('pullPresets stores deleted=true tombstones in DB', async () => {
    server.use(
      http.get(`${archiveConfig.baseUrl}/projects/proj-1/preset`, () =>
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
              name: 'Deleted Preset',
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

    const presets = await pullPresets(
      'server-1',
      'proj-1',
      'proj-local-1',
      archiveConfig,
    );

    expect(presets).toHaveLength(0);

    const db = getDb();
    const stored = await db.presets.toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.deleted).toBe(true);
  });
});
