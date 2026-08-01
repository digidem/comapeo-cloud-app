import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api-client';
import { syncRemoteArchive } from '@/lib/sync';

const mocks = vi.hoisted(() => ({
  addServer: vi.fn().mockResolvedValue('server-1'),
  getRemoteServer: vi.fn().mockResolvedValue({
    id: 'server-1',
    baseUrl: 'https://archive.example.com',
    status: 'connected',
    lastSyncedAt: '',
  }),
  pullProjectsDetailed: vi.fn(),
  pullObservationsDetailed: vi.fn(),
  pullAlertsDetailed: vi.fn(),
  pullPresetsDetailed: vi.fn(),
  pullTracksDetailed: vi.fn(),
  pullFieldsDetailed: vi.fn(),
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: {
    getState: () => ({ addServer: mocks.addServer }),
  },
}));

vi.mock('@/lib/local-repositories', () => ({
  getRemoteServer: mocks.getRemoteServer,
}));

vi.mock('@/lib/remote-archive', () => ({
  pullProjectsDetailed: mocks.pullProjectsDetailed,
  pullObservationsDetailed: mocks.pullObservationsDetailed,
  pullAlertsDetailed: mocks.pullAlertsDetailed,
  pullPresetsDetailed: mocks.pullPresetsDetailed,
  pullTracksDetailed: mocks.pullTracksDetailed,
  pullFieldsDetailed: mocks.pullFieldsDetailed,
}));

const counts = {
  received: 1,
  upserted: 1,
  explicitTombstones: 0,
  omittedTombstones: 0,
  tombstoned: 0,
  preserved: 0,
};

function result(
  resource:
    'projects' | 'observations' | 'alerts' | 'presets' | 'tracks' | 'fields',
  availability: 'supported' | 'unsupported' = 'supported',
) {
  return {
    rows: [],
    semantics: {
      resource,
      availability,
      mode:
        availability === 'supported'
          ? ('snapshot' as const)
          : ('unknown' as const),
      source:
        availability === 'supported'
          ? ('contract' as const)
          : ('route-404' as const),
    },
    counts,
    warnings:
      availability === 'unsupported' ? [`${resource} is unsupported`] : [],
  };
}

function projects(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    localId: `project-${index + 1}`,
    remoteId: `remote-${index + 1}`,
    name: `Project ${index + 1}`,
    sourceType: 'remoteArchive',
    sourceId: 'server-1',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    dirtyLocal: false,
    deleted: false,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.addServer.mockResolvedValue('server-1');
  mocks.getRemoteServer.mockResolvedValue({
    id: 'server-1',
    baseUrl: 'https://archive.example.com',
    status: 'connected',
    lastSyncedAt: '',
  });
  mocks.pullProjectsDetailed.mockResolvedValue({
    ...result('projects'),
    rows: projects(1),
  });
  mocks.pullObservationsDetailed.mockResolvedValue(result('observations'));
  mocks.pullAlertsDetailed.mockResolvedValue(result('alerts'));
  mocks.pullPresetsDetailed.mockResolvedValue(result('presets'));
  mocks.pullTracksDetailed.mockResolvedValue(result('tracks'));
  mocks.pullFieldsDetailed.mockResolvedValue(result('fields'));
});

describe('sync reconciliation orchestration', () => {
  it('returns structured counts and skips unsupported resources', async () => {
    mocks.pullTracksDetailed.mockResolvedValue(result('tracks', 'unsupported'));

    const sync = await syncRemoteArchive('structured-server', {
      baseUrl: 'https://archive.example.com',
      token: 'test-token',
    });

    expect(sync.status).toBe('ready');
    expect(sync.projects[0]?.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resource: 'observations',
          status: 'success',
          counts,
        }),
        expect.objectContaining({
          resource: 'tracks',
          status: 'skipped',
          semantics: expect.objectContaining({ availability: 'unsupported' }),
        }),
      ]),
    );
    expect(sync.warnings).toContain('Project 1: tracks: tracks is unsupported');
  });

  it('surfaces a missing project as an error outcome', async () => {
    mocks.pullTracksDetailed.mockRejectedValue(
      new ApiError(404, 'NOT_FOUND', 'Project not found', 'missing-project'),
    );

    const sync = await syncRemoteArchive('missing-project-server', {
      baseUrl: 'https://archive.example.com',
      token: 'test-token',
    });

    expect(sync.status).toBe('error');
    expect(sync.projects[0]).toMatchObject({
      status: 'error',
      resources: expect.arrayContaining([
        expect.objectContaining({
          resource: 'tracks',
          status: 'missing-project',
          error: 'Project not found',
        }),
      ]),
    });
  });

  it('enforces the configured resource concurrency bound', async () => {
    let active = 0;
    let maxActive = 0;
    const delayed = async (resource: Parameters<typeof result>[0]) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return result(resource);
    };
    mocks.pullObservationsDetailed.mockImplementation(() =>
      delayed('observations'),
    );
    mocks.pullAlertsDetailed.mockImplementation(() => delayed('alerts'));
    mocks.pullPresetsDetailed.mockImplementation(() => delayed('presets'));
    mocks.pullTracksDetailed.mockImplementation(() => delayed('tracks'));
    mocks.pullFieldsDetailed.mockImplementation(() => delayed('fields'));

    await syncRemoteArchive('bounded-server', {
      baseUrl: 'https://archive.example.com',
      token: 'test-token',
      concurrency: { resources: 2 },
    });

    expect(maxActive).toBe(2);
  });

  it('lets one shared-sync subscriber cancel without cancelling another', async () => {
    const firstController = new AbortController();
    const secondController = new AbortController();
    let resolveObservations!: (value: ReturnType<typeof result>) => void;
    let internalSignal: AbortSignal | undefined;
    mocks.pullObservationsDetailed.mockImplementation(
      (_serverId, _remoteId, _projectLocalId, config) => {
        internalSignal = config.signal;
        return new Promise((resolve) => {
          resolveObservations = resolve;
        });
      },
    );

    const first = syncRemoteArchive('shared-server', {
      baseUrl: 'https://archive.example.com',
      token: 'test-token',
      signal: firstController.signal,
    });
    const second = syncRemoteArchive('shared-server', {
      baseUrl: 'https://archive.example.com',
      token: 'test-token',
      signal: secondController.signal,
    });

    await vi.waitFor(() =>
      expect(mocks.pullObservationsDetailed).toHaveBeenCalledOnce(),
    );
    firstController.abort();

    await expect(first).resolves.toMatchObject({
      status: 'cancelled',
      underlyingAborted: false,
    });
    expect(internalSignal?.aborted).toBe(false);
    resolveObservations(result('observations'));

    await expect(second).resolves.toMatchObject({
      success: true,
      status: 'ready',
    });
    expect(mocks.pullProjectsDetailed).toHaveBeenCalledOnce();
  });

  it('aborts downstream project fan-out', async () => {
    mocks.pullProjectsDetailed.mockResolvedValue({
      ...result('projects'),
      rows: projects(3),
    });
    const controller = new AbortController();
    let startedResolve!: () => void;
    const started = new Promise<void>((resolve) => {
      startedResolve = resolve;
    });
    mocks.pullObservationsDetailed.mockImplementation(
      (_serverId, remoteId, _projectLocalId, config) =>
        new Promise((_, reject) => {
          if (remoteId === 'remote-1') startedResolve();
          config.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
    );

    const syncPromise = syncRemoteArchive('abort-server', {
      baseUrl: 'https://archive.example.com',
      token: 'test-token',
      signal: controller.signal,
      concurrency: { projects: 1, resources: 1 },
    });
    await started;
    controller.abort();

    await expect(syncPromise).resolves.toMatchObject({
      success: false,
      status: 'cancelled',
      error: 'Sync cancelled',
      underlyingAborted: true,
    });
    expect(mocks.pullObservationsDetailed).toHaveBeenCalledTimes(1);
    expect(mocks.pullAlertsDetailed).not.toHaveBeenCalled();
  });
});
