import { server } from '@tests/mocks/node';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api-client';
import { getDb, resetDb } from '@/lib/db';
import {
  pullFieldsDetailed,
  pullObservationsDetailed,
  pullPresetsDetailed,
  pullProjectsDetailed,
  pullTracksDetailed,
} from '@/lib/remote-archive';

const config = {
  baseUrl: 'https://archive.example.com',
  token: 'test-token',
};
const projectLocalId = 'remoteArchive:https://archive.example.com:p1';

async function seedTrack(): Promise<void> {
  await getDb().tracks.put({
    localId: 'remoteArchive:https://archive.example.com:track-1',
    projectLocalId,
    sourceType: 'remoteArchive',
    sourceId: 'server-1',
    remoteId: 'track-1',
    locations: [],
    observationRefs: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    dirtyLocal: false,
    deleted: false,
  });
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await resetDb();
});

describe('remote archive reconciliation contracts', () => {
  it('preserves local rows for an unsupported legacy route', async () => {
    await seedTrack();
    server.use(
      http.get(`${config.baseUrl}/projects/p1/track`, () =>
        HttpResponse.json(
          {
            message: 'Route GET:/projects/p1/track not found',
            error: 'Not Found',
            statusCode: 404,
          },
          { status: 404 },
        ),
      ),
    );

    const result = await pullTracksDetailed(
      'server-1',
      'p1',
      projectLocalId,
      config,
    );

    expect(result.semantics.availability).toBe('unsupported');
    expect(result.counts.preserved).toBe(1);
    expect(
      (
        await getDb().tracks.get(
          'remoteArchive:https://archive.example.com:track-1',
        )
      )?.deleted,
    ).toBe(false);
  });

  it('preserves local fields for an unsupported legacy route', async () => {
    const localId = 'remoteArchive:https://archive.example.com:field-1';
    await getDb().fields.put({
      localId,
      projectLocalId,
      sourceType: 'remoteArchive',
      sourceId: 'server-1',
      remoteId: 'field-1',
      type: 'text',
      key: 'notes',
      label: 'Notes',
      universal: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });
    server.use(
      http.get(`${config.baseUrl}/projects/p1/field`, () =>
        HttpResponse.json(
          {
            message: 'Route GET:/projects/p1/field not found',
            error: 'Not Found',
            statusCode: 404,
          },
          { status: 404 },
        ),
      ),
    );

    const result = await pullFieldsDetailed(
      'server-1',
      'p1',
      projectLocalId,
      config,
    );

    expect(result.counts.preserved).toBe(1);
    expect((await getDb().fields.get(localId))?.deleted).toBe(false);
  });

  it('preserves local presets for an unsupported legacy route', async () => {
    const localId = 'remoteArchive:https://archive.example.com:preset-1';
    await getDb().presets.put({
      localId,
      projectLocalId,
      sourceType: 'remoteArchive',
      sourceId: 'server-1',
      remoteId: 'preset-1',
      name: 'Forest',
      terms: [],
      fieldRefs: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });
    server.use(
      http.get(`${config.baseUrl}/projects/p1/preset`, () =>
        HttpResponse.json(
          {
            message: 'Route GET:/projects/p1/preset not found',
            error: 'Not Found',
            statusCode: 404,
          },
          { status: 404 },
        ),
      ),
    );

    const result = await pullPresetsDetailed(
      'server-1',
      'p1',
      projectLocalId,
      config,
    );

    expect(result.counts.preserved).toBe(1);
    expect((await getDb().presets.get(localId))?.deleted).toBe(false);
  });

  it('tombstones omitted rows for a confirmed empty snapshot', async () => {
    await seedTrack();
    server.use(
      http.get(`${config.baseUrl}/projects/p1/track`, () =>
        HttpResponse.json({ data: [] }),
      ),
    );

    const result = await pullTracksDetailed(
      'server-1',
      'p1',
      projectLocalId,
      config,
    );

    expect(result.semantics.mode).toBe('snapshot');
    expect(result.counts.omittedTombstones).toBe(1);
    expect(
      (
        await getDb().tracks.get(
          'remoteArchive:https://archive.example.com:track-1',
        )
      )?.deleted,
    ).toBe(true);
  });

  it('preserves omitted rows for a declared delta response', async () => {
    await seedTrack();
    server.use(
      http.get(`${config.baseUrl}/projects/p1/track`, () =>
        HttpResponse.json(
          { data: [] },
          { headers: { 'x-comapeo-reconciliation-mode': 'delta' } },
        ),
      ),
    );

    const result = await pullTracksDetailed(
      'server-1',
      'p1',
      projectLocalId,
      config,
    );

    expect(result.semantics.mode).toBe('delta');
    expect(result.counts.preserved).toBe(1);
    expect(
      (
        await getDb().tracks.get(
          'remoteArchive:https://archive.example.com:track-1',
        )
      )?.deleted,
    ).toBe(false);
  });

  it('tombstones children when a project disappears from a snapshot', async () => {
    await getDb().projects.put({
      localId: projectLocalId,
      remoteId: 'p1',
      name: 'Project 1',
      sourceType: 'remoteArchive',
      sourceId: 'server-1',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });
    const observationLocalId =
      'remoteArchive:https://archive.example.com:observation-project-child';
    await getDb().observations.put({
      localId: observationLocalId,
      projectLocalId,
      sourceType: 'remoteArchive',
      sourceId: 'server-1',
      remoteId: 'observation-project-child',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });
    server.use(
      http.get(`${config.baseUrl}/projects`, () =>
        HttpResponse.json({ data: [] }),
      ),
    );

    const result = await pullProjectsDetailed('server-1', config);

    expect(result.counts.omittedTombstones).toBe(1);
    expect((await getDb().projects.get(projectLocalId))?.deleted).toBe(true);
    expect((await getDb().observations.get(observationLocalId))?.deleted).toBe(
      true,
    );
  });

  it('cleans dependent attachments when a snapshot removes an observation', async () => {
    const observationLocalId =
      'remoteArchive:https://archive.example.com:observation-1';
    await getDb().observations.put({
      localId: observationLocalId,
      projectLocalId,
      sourceType: 'remoteArchive',
      sourceId: 'server-1',
      remoteId: 'observation-1',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });
    await getDb().attachments.put({
      localId: 'remoteArchive:https://archive.example.com:attachment-1',
      projectLocalId,
      observationLocalId,
      sourceType: 'remoteArchive',
      sourceId: 'server-1',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });
    server.use(
      http.get(`${config.baseUrl}/projects/p1/observations`, () =>
        HttpResponse.json({ data: [] }),
      ),
    );

    const result = await pullObservationsDetailed(
      'server-1',
      'p1',
      projectLocalId,
      config,
    );

    expect(result.counts.omittedTombstones).toBe(1);
    expect((await getDb().observations.get(observationLocalId))?.deleted).toBe(
      true,
    );
    expect(
      (
        await getDb().attachments.get(
          'remoteArchive:https://archive.example.com:attachment-1',
        )
      )?.deleted,
    ).toBe(true);
  });

  it('does not complete preset sync before owned icon prefetch settles', async () => {
    server.use(
      http.get(`${config.baseUrl}/projects/p1/preset`, () =>
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
              fieldRefs: [],
              iconRef: { docId: 'icon-1', versionId: 'icon-1/0' },
              terms: [],
            },
          ],
        }),
      ),
    );
    let resolveIcon!: (blob: Blob) => void;
    const iconPromise = new Promise<Blob>((resolve) => {
      resolveIcon = resolve;
    });
    vi.spyOn(apiClient, 'getIcon').mockReturnValue(iconPromise);
    let settled = false;

    const pull = pullPresetsDetailed(
      'server-1',
      'p1',
      projectLocalId,
      config,
    ).finally(() => {
      settled = true;
    });

    await vi.waitFor(() => expect(apiClient.getIcon).toHaveBeenCalledOnce());
    expect(settled).toBe(false);
    resolveIcon(new Blob(['icon'], { type: 'image/png' }));

    await expect(pull).resolves.toMatchObject({ warnings: [] });
    expect(settled).toBe(true);
  });
});
