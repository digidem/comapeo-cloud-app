import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SyncResult } from '@/lib/sync';
import {
  cancelArchiveOnboarding,
  onboardArchive,
  resetSyncCoordinatorForTests,
  syncArchive,
} from '@/lib/sync-coordinator';

const TEST_CREDENTIAL = '[REDACTED_SECRET]';

const mocks = vi.hoisted(() => {
  const state = {
    servers: [] as Array<{
      id: string;
      label: string;
      baseUrl: string;
      token: string;
      status: string;
      onboardingStatus?: string;
      accessScope?:
        { type: 'archive' } | { type: 'project'; projectId: string };
    }>,
    addServer: vi.fn(),
    updateServerLifecycle: vi.fn().mockResolvedValue(undefined),
    consolidateScopedServersForArchive: vi.fn().mockResolvedValue(undefined),
  };

  return {
    state,
    healthCheck: vi.fn().mockResolvedValue(true),
    getProjects: vi.fn().mockResolvedValue({ data: [] }),
    syncRemoteArchive: vi.fn(),
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    healthCheck: mocks.healthCheck,
    getProjects: mocks.getProjects,
  },
}));

vi.mock('@/lib/query-client', () => ({
  queryClient: {
    invalidateQueries: mocks.invalidateQueries,
  },
}));

vi.mock('@/lib/sync', () => ({
  syncRemoteArchive: mocks.syncRemoteArchive,
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: {
    getState: () => mocks.state,
  },
}));

const readyResult: SyncResult = {
  success: true,
  status: 'ready',
  serverId: 'server-1',
  projects: [],
  warnings: [],
};

describe('sync coordinator', () => {
  beforeEach(() => {
    resetSyncCoordinatorForTests();
    mocks.state.servers = [
      {
        id: 'server-1',
        label: 'Archive',
        baseUrl: 'https://archive.example.com',
        token: TEST_CREDENTIAL,
        status: 'pending',
        onboardingStatus: 'pending',
      },
    ];
    mocks.state.addServer.mockReset().mockResolvedValue('server-1');
    mocks.state.updateServerLifecycle.mockClear();
    mocks.state.consolidateScopedServersForArchive.mockClear();
    mocks.healthCheck.mockReset().mockResolvedValue(true);
    mocks.getProjects.mockReset().mockResolvedValue({ data: [] });
    mocks.syncRemoteArchive.mockReset().mockResolvedValue(readyResult);
    mocks.invalidateQueries.mockClear();
  });

  it('shares one underlying sync run for concurrent archive requests', async () => {
    let resolveSync!: (result: SyncResult) => void;
    mocks.syncRemoteArchive.mockReturnValue(
      new Promise<SyncResult>((resolve) => {
        resolveSync = resolve;
      }),
    );

    const first = syncArchive('server-1');
    const second = syncArchive('server-1');

    expect(second).toBe(first);
    await vi.waitFor(() => {
      expect(mocks.syncRemoteArchive).toHaveBeenCalledOnce();
    });

    resolveSync(readyResult);
    await expect(first).resolves.toEqual(readyResult);
    expect(mocks.invalidateQueries).toHaveBeenCalledOnce();
    expect(mocks.state.updateServerLifecycle).toHaveBeenLastCalledWith(
      'server-1',
      expect.objectContaining({
        status: 'connected',
        onboardingStatus: 'ready',
        lastSuccessfulSyncAt: expect.any(String),
      }),
    );
  });

  it('marks partial results without advancing the successful-sync timestamp', async () => {
    const partialResult: SyncResult = {
      success: false,
      status: 'partial',
      serverId: 'server-1',
      projects: [],
      warnings: ['Project A: observations unavailable'],
      error: 'Partial sync',
    };
    mocks.syncRemoteArchive.mockResolvedValueOnce(partialResult);

    await expect(syncArchive('server-1')).resolves.toEqual(partialResult);

    expect(mocks.state.updateServerLifecycle).toHaveBeenLastCalledWith(
      'server-1',
      {
        status: 'partial',
        onboardingStatus: 'partial',
        errorMessage: 'Partial sync',
      },
    );
    expect(mocks.invalidateQueries).toHaveBeenCalledOnce();
  });

  it('uses the same explicit lifecycle for manual and invite onboarding', async () => {
    const manualStates: string[] = [];
    const inviteStates: string[] = [];

    await onboardArchive({
      baseUrl: 'https://archive.example.com',
      token: TEST_CREDENTIAL,
      label: 'Manual',
      source: 'manual',
      onStateChange: (state) => manualStates.push(state),
    });

    resetSyncCoordinatorForTests();
    await onboardArchive({
      baseUrl: 'https://archive.example.com',
      token: TEST_CREDENTIAL,
      label: 'Invite',
      source: 'invite',
      onStateChange: (state) => inviteStates.push(state),
    });

    expect(manualStates).toEqual(['validating', 'pending', 'syncing', 'ready']);
    expect(inviteStates).toEqual(manualStates);
  });

  it('retries through the existing resumable archive record', async () => {
    mocks.state.servers[0] = {
      ...mocks.state.servers[0]!,
      status: 'error',
      onboardingStatus: 'error',
    };

    const result = await onboardArchive({
      baseUrl: 'https://archive.example.com',
      token: TEST_CREDENTIAL,
      label: 'Retry',
      source: 'manual',
    });

    expect(result.serverId).toBe('server-1');
    expect(mocks.state.addServer).toHaveBeenCalledWith(
      expect.objectContaining({ allowDuplicate: true }),
    );
    expect(mocks.syncRemoteArchive).toHaveBeenCalledWith(
      'server-1',
      expect.objectContaining({ token: TEST_CREDENTIAL }),
    );
  });

  it('manual onboarding creates an archive candidate instead of treating same-base project-scoped records as duplicates', async () => {
    mocks.state.servers = [
      {
        id: 'scoped-project',
        label: 'Scoped Project',
        baseUrl: 'https://archive.example.com',
        token: 'project-token',
        status: 'connected',
        onboardingStatus: 'ready',
        accessScope: { type: 'project', projectId: 'project-a' },
      },
    ];
    mocks.state.addServer.mockResolvedValueOnce('archive-candidate');

    const result = await onboardArchive({
      baseUrl: 'https://archive.example.com/',
      token: TEST_CREDENTIAL,
      label: 'Archive',
      source: 'manual',
    });

    expect(result).toMatchObject({ success: true, status: 'ready' });
    expect(mocks.state.addServer).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://archive.example.com',
        token: TEST_CREDENTIAL,
        accessScope: { type: 'archive' },
        allowDuplicate: true,
      }),
    );
    expect(mocks.syncRemoteArchive).toHaveBeenCalledWith(
      'archive-candidate',
      expect.objectContaining({ accessScope: { type: 'archive' } }),
    );
  });

  it('manual onboarding still reports duplicate for an existing connected archive-wide same-base server', async () => {
    mocks.state.servers = [
      {
        id: 'archive-wide',
        label: 'Archive',
        baseUrl: 'https://archive.example.com',
        token: TEST_CREDENTIAL,
        status: 'connected',
        onboardingStatus: 'ready',
        accessScope: { type: 'archive' },
      },
    ];

    await expect(
      onboardArchive({
        baseUrl: 'https://archive.example.com/',
        token: TEST_CREDENTIAL,
        label: 'Archive',
        source: 'manual',
      }),
    ).resolves.toMatchObject({
      success: false,
      errorCode: 'duplicate',
    });
    expect(mocks.state.addServer).not.toHaveBeenCalled();
    expect(mocks.syncRemoteArchive).not.toHaveBeenCalled();
  });

  it('consolidates same-base project-scoped credentials only after a successful full archive sync', async () => {
    await expect(
      syncArchive('server-1', {
        baseUrl: 'https://archive.example.com',
        token: TEST_CREDENTIAL,
        accessScope: { type: 'archive' },
      }),
    ).resolves.toEqual(readyResult);

    expect(mocks.state.consolidateScopedServersForArchive).toHaveBeenCalledWith(
      'server-1',
    );
  });

  it.each([
    [
      'failed',
      {
        success: false,
        status: 'error',
        serverId: 'server-1',
        projects: [],
        warnings: [],
        error: 'Sync failed',
      } satisfies SyncResult,
    ],
    [
      'partial',
      {
        success: false,
        status: 'partial',
        serverId: 'server-1',
        projects: [],
        warnings: ['Partial'],
        error: 'Partial sync',
      } satisfies SyncResult,
    ],
  ])(
    'does not consolidate scoped records after a %s broad sync',
    async (_name, result) => {
      mocks.syncRemoteArchive.mockResolvedValueOnce(result);

      await expect(
        syncArchive('server-1', {
          baseUrl: 'https://archive.example.com',
          token: TEST_CREDENTIAL,
          accessScope: { type: 'archive' },
        }),
      ).resolves.toEqual(result);

      expect(
        mocks.state.consolidateScopedServersForArchive,
      ).not.toHaveBeenCalled();
    },
  );

  it('does not consolidate scoped records when a broad sync is cancelled', async () => {
    await syncArchive(
      'server-1',
      {
        baseUrl: 'https://archive.example.com',
        token: TEST_CREDENTIAL,
        accessScope: { type: 'archive' },
      },
      { isCancelled: () => true },
    );

    expect(
      mocks.state.consolidateScopedServersForArchive,
    ).not.toHaveBeenCalled();
  });

  it('can defer scoped credential consolidation until the caller commits onboarding', async () => {
    await expect(
      syncArchive(
        'server-1',
        {
          baseUrl: 'https://archive.example.com',
          token: TEST_CREDENTIAL,
          accessScope: { type: 'archive' },
        },
        { deferScopedConsolidation: true },
      ),
    ).resolves.toEqual(readyResult);

    expect(
      mocks.state.consolidateScopedServersForArchive,
    ).not.toHaveBeenCalled();
  });

  it('stops before sync when cancellation happens during persistence', async () => {
    let resolveAdd!: (serverId: string) => void;
    mocks.state.addServer.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        resolveAdd = resolve;
      }),
    );
    let cancelled = false;

    const onboarding = onboardArchive({
      baseUrl: 'https://archive.example.com',
      token: TEST_CREDENTIAL,
      label: 'Cancelled Archive',
      source: 'manual',
      isCancelled: () => cancelled,
    });

    await vi.waitFor(() => {
      expect(mocks.state.addServer).toHaveBeenCalledOnce();
    });
    cancelled = true;
    resolveAdd('server-1');

    await expect(onboarding).resolves.toMatchObject({
      success: false,
      serverId: 'server-1',
      errorCode: 'cancelled',
    });
    expect(mocks.syncRemoteArchive).not.toHaveBeenCalled();
    expect(mocks.state.updateServerLifecycle).toHaveBeenLastCalledWith(
      'server-1',
      {
        status: 'cancelled',
        onboardingStatus: 'cancelled',
        errorMessage: undefined,
      },
    );
  });

  it('keeps cancellation authoritative when sync finishes later', async () => {
    let resolveSync!: (result: SyncResult) => void;
    mocks.syncRemoteArchive.mockReturnValueOnce(
      new Promise<SyncResult>((resolve) => {
        resolveSync = resolve;
      }),
    );
    let cancelled = false;

    const onboarding = onboardArchive({
      baseUrl: 'https://archive.example.com',
      token: TEST_CREDENTIAL,
      label: 'Cancelled During Sync',
      source: 'manual',
      isCancelled: () => cancelled,
    });

    await vi.waitFor(() => {
      expect(mocks.syncRemoteArchive).toHaveBeenCalledOnce();
    });
    cancelled = true;
    resolveSync(readyResult);

    await expect(onboarding).resolves.toMatchObject({
      success: false,
      serverId: 'server-1',
      errorCode: 'cancelled',
    });
    expect(mocks.state.updateServerLifecycle).toHaveBeenLastCalledWith(
      'server-1',
      {
        status: 'cancelled',
        onboardingStatus: 'cancelled',
        errorMessage: undefined,
      },
    );
    expect(mocks.invalidateQueries).toHaveBeenCalledOnce();
  });

  it('persists cancellation as a resumable lifecycle state', async () => {
    await cancelArchiveOnboarding('server-1');

    expect(mocks.state.updateServerLifecycle).toHaveBeenCalledWith('server-1', {
      status: 'cancelled',
      onboardingStatus: 'cancelled',
      errorMessage: undefined,
    });
  });

  describe('abort bridge and cancellation polling', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('aborts the bridged AbortSignal when isCancelled() is already true before sync starts', async () => {
      let capturedSignal: AbortSignal | undefined;
      mocks.syncRemoteArchive.mockImplementationOnce((_id, opts) => {
        capturedSignal = (opts as { signal?: AbortSignal }).signal;
        return Promise.resolve(readyResult);
      });

      await syncArchive('server-1', undefined, { isCancelled: () => true });

      expect(capturedSignal).toBeDefined();
      expect(capturedSignal!.aborted).toBe(true);
    });

    it('threads the bridged AbortSignal through to syncRemoteArchive when using explicit options', async () => {
      let capturedSignal: AbortSignal | undefined;
      mocks.syncRemoteArchive.mockImplementationOnce((_id, opts) => {
        capturedSignal = (opts as { signal?: AbortSignal }).signal;
        return Promise.resolve(readyResult);
      });

      await syncArchive('server-1', {
        baseUrl: 'https://archive.example.com',
        token: TEST_CREDENTIAL,
      });

      expect(capturedSignal).toBeInstanceOf(AbortSignal);
      expect(capturedSignal!.aborted).toBe(false);
    });

    it('includes stored server accessScope when resolving sync options without explicit options', async () => {
      mocks.state.servers[0] = {
        ...mocks.state.servers[0]!,
        accessScope: { type: 'project', projectId: 'project-a' },
      };
      let capturedOptions: unknown;
      mocks.syncRemoteArchive.mockImplementationOnce((_id, opts) => {
        capturedOptions = opts;
        return Promise.resolve(readyResult);
      });

      await syncArchive('server-1');

      expect(capturedOptions).toMatchObject({
        baseUrl: 'https://archive.example.com',
        token: TEST_CREDENTIAL,
        accessScope: { type: 'project', projectId: 'project-a' },
      });
    });

    it('fires the ~2s cancellation poller and aborts the in-flight sync once isCancelled() flips true', async () => {
      vi.useFakeTimers();
      let capturedSignal: AbortSignal | undefined;
      mocks.syncRemoteArchive.mockImplementationOnce((_id, opts) => {
        capturedSignal = (opts as { signal?: AbortSignal }).signal;
        return new Promise((_resolve, reject) => {
          capturedSignal!.addEventListener('abort', () => {
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      });

      let cancelled = false;
      const run = syncArchive('server-1', undefined, {
        isCancelled: () => cancelled,
      });

      // Let the run() IIFE start and register the poller before advancing.
      await vi.advanceTimersByTimeAsync(0);
      expect(capturedSignal!.aborted).toBe(false);

      // Poller hasn't fired yet at just under 2s.
      cancelled = true;
      await vi.advanceTimersByTimeAsync(1_999);
      expect(capturedSignal!.aborted).toBe(false);

      // Poller fires at the 2s mark and aborts the in-flight sync.
      await vi.advanceTimersByTimeAsync(1);
      expect(capturedSignal!.aborted).toBe(true);

      await expect(run).resolves.toMatchObject({
        error: 'Onboarding cancelled',
      });
      expect(mocks.state.updateServerLifecycle).toHaveBeenLastCalledWith(
        'server-1',
        {
          status: 'cancelled',
          onboardingStatus: 'cancelled',
          errorMessage: undefined,
        },
      );
    });

    it('registers a second caller on the existing poller instead of starting a duplicate sync', async () => {
      vi.useFakeTimers();
      let capturedSignal: AbortSignal | undefined;
      mocks.syncRemoteArchive.mockImplementationOnce((_id, opts) => {
        capturedSignal = (opts as { signal?: AbortSignal }).signal;
        return new Promise((_resolve, reject) => {
          capturedSignal!.addEventListener('abort', () => {
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      });

      const first = syncArchive('server-1', undefined, {
        isCancelled: () => false,
      });
      await vi.advanceTimersByTimeAsync(0);

      let secondCancelled = false;
      const second = syncArchive('server-1', undefined, {
        isCancelled: () => secondCancelled,
      });

      // Dedup: no duplicate sync started for the second caller.
      expect(second).toBe(first);
      expect(mocks.syncRemoteArchive).toHaveBeenCalledOnce();

      // The first caller's isCancelled always returns false; only the
      // second caller's callback flips. The shared poller must still pick
      // it up since it was registered onto the same poller list.
      secondCancelled = true;
      await vi.advanceTimersByTimeAsync(2_000);

      expect(capturedSignal!.aborted).toBe(true);
      await expect(first).resolves.toMatchObject({
        error: 'Onboarding cancelled',
      });
    });
  });
});
