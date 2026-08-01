import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    }>,
    addServer: vi.fn(),
    updateServerLifecycle: vi.fn().mockResolvedValue(undefined),
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
    mocks.healthCheck.mockReset().mockResolvedValue(true);
    mocks.getProjects.mockReset().mockResolvedValue({ data: [] });
    mocks.syncRemoteArchive.mockReset().mockResolvedValue(readyResult);
    mocks.invalidateQueries.mockClear();
  });

  it('keeps concurrent coordinator callers as independent subscribers', async () => {
    let resolveSync!: (result: SyncResult) => void;
    const sharedRun = new Promise<SyncResult>((resolve) => {
      resolveSync = resolve;
    });
    mocks.syncRemoteArchive.mockReturnValue(sharedRun);

    const first = syncArchive('server-1');
    const second = syncArchive('server-1');

    expect(second).not.toBe(first);
    await vi.waitFor(() => {
      expect(mocks.syncRemoteArchive).toHaveBeenCalledTimes(2);
    });

    resolveSync(readyResult);
    await expect(Promise.all([first, second])).resolves.toEqual([
      readyResult,
      readyResult,
    ]);
    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(2);
    expect(mocks.state.updateServerLifecycle).toHaveBeenLastCalledWith(
      'server-1',
      expect.objectContaining({
        status: 'connected',
        onboardingStatus: 'ready',
        lastSuccessfulSyncAt: expect.any(String),
      }),
    );
  });

  it('does not mark the archive cancelled when another shared subscriber continues', async () => {
    mocks.syncRemoteArchive.mockResolvedValueOnce({
      success: false,
      status: 'cancelled',
      serverId: 'server-1',
      projects: [],
      warnings: [],
      error: 'Sync cancelled',
      underlyingAborted: false,
    });

    await expect(syncArchive('server-1')).resolves.toMatchObject({
      status: 'cancelled',
      underlyingAborted: false,
    });

    expect(mocks.state.updateServerLifecycle).toHaveBeenCalledTimes(1);
    expect(mocks.state.updateServerLifecycle).toHaveBeenLastCalledWith(
      'server-1',
      expect.objectContaining({ status: 'syncing' }),
    );
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
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
    await vi.waitFor(() => {
      const options = mocks.syncRemoteArchive.mock.calls[0]?.[1];
      expect(options?.signal?.aborted).toBe(true);
    });
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
});
