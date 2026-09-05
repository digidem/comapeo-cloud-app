import { renderHook } from '@testing-library/react';
import { createQueryWrapper } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactNode } from 'react';
import { act } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { syncRemoteArchive } from '@/lib/data-layer';
import type { SyncResult } from '@/lib/sync';
import { useAuthStore } from '@/stores/auth-store';

vi.mock('@/lib/data-layer', () => ({
  syncRemoteArchive: vi.fn().mockResolvedValue({
    success: true,
    status: 'ready',
    serverId: 'server-1',
    projects: [],
    warnings: [],
  }),
}));

const mockSyncRemoteArchive = vi.mocked(syncRemoteArchive);

function readyResult(serverId = 'server-1'): SyncResult {
  return {
    success: true,
    status: 'ready',
    serverId,
    projects: [],
    warnings: [],
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    servers: [],
    activeServerId: null,
    token: null,
    baseUrl: null,
  });
});

describe('useSyncAll', () => {
  it('returns isSyncing=false initially', async () => {
    const { useSyncAll } = await import('@/hooks/useSyncAll');
    const { result } = renderHook(() => useSyncAll(), { wrapper });
    expect(result.current.isSyncing).toBe(false);
  });

  it('sets isSyncing=true while syncing', async () => {
    let resolveSync!: (value: SyncResult) => void;
    mockSyncRemoteArchive.mockReturnValue(
      new Promise((resolve) => {
        resolveSync = resolve;
      }),
    );

    useAuthStore.setState({
      servers: [
        {
          id: 'server-1',
          label: 'Server 1',
          baseUrl: 'https://archive1.example.com',
          token: 'token-1',
          status: 'idle',
        },
      ],
    });

    const { useSyncAll } = await import('@/hooks/useSyncAll');
    const { result } = renderHook(() => useSyncAll(), { wrapper });

    act(() => {
      void result.current.sync();
    });

    expect(result.current.isSyncing).toBe(true);

    await act(async () => {
      resolveSync(readyResult());
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.isSyncing).toBe(false);
  });

  it('resets isSyncing=false after success', async () => {
    mockSyncRemoteArchive.mockResolvedValue(readyResult());

    useAuthStore.setState({
      servers: [
        {
          id: 'server-1',
          label: 'Server 1',
          baseUrl: 'https://archive1.example.com',
          token: 'token-1',
          status: 'idle',
        },
      ],
    });

    const { useSyncAll } = await import('@/hooks/useSyncAll');
    const { result } = renderHook(() => useSyncAll(), { wrapper });

    await act(async () => {
      await result.current.sync();
    });

    expect(result.current.isSyncing).toBe(false);
  });

  it('resets isSyncing=false after error', async () => {
    mockSyncRemoteArchive.mockRejectedValue(new Error('Network error'));

    useAuthStore.setState({
      servers: [
        {
          id: 'server-1',
          label: 'Server 1',
          baseUrl: 'https://archive1.example.com',
          token: 'token-1',
          status: 'idle',
        },
      ],
    });

    const { useSyncAll } = await import('@/hooks/useSyncAll');
    const { result } = renderHook(() => useSyncAll(), { wrapper });

    await act(async () => {
      await result.current.sync();
    });

    expect(result.current.isSyncing).toBe(false);
  });

  it('leaves cache invalidation to the sync coordinator', async () => {
    mockSyncRemoteArchive.mockResolvedValue(readyResult());

    useAuthStore.setState({
      servers: [
        {
          id: 'server-1',
          label: 'Server 1',
          baseUrl: 'https://archive1.example.com',
          token: 'token-1',
          status: 'idle',
        },
      ],
    });

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { useSyncAll } = await import('@/hooks/useSyncAll');
    renderHook(() => useSyncAll(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      ),
    });

    // Get the sync function from the store via the hook result
    const { result } = renderHook(() => useSyncAll(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      ),
    });

    await act(async () => {
      await result.current.sync();
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('ignores concurrent sync() calls while one is in flight', async () => {
    let resolveSync!: (value: SyncResult) => void;
    mockSyncRemoteArchive.mockReturnValue(
      new Promise((resolve) => {
        resolveSync = resolve;
      }),
    );

    useAuthStore.setState({
      servers: [
        {
          id: 'server-1',
          label: 'Server 1',
          baseUrl: 'https://archive1.example.com',
          token: 'token-1',
          status: 'idle',
        },
      ],
    });

    const { useSyncAll } = await import('@/hooks/useSyncAll');
    const { result } = renderHook(() => useSyncAll(), { wrapper });

    // Fire two rapid sync calls
    act(() => {
      void result.current.sync();
      void result.current.sync();
    });

    // Only one syncRemoteArchive call should have been made
    expect(mockSyncRemoteArchive).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSync(readyResult());
      await new Promise((r) => setTimeout(r, 0));
    });
  });

  it('syncs all servers from auth store', async () => {
    mockSyncRemoteArchive.mockResolvedValue(readyResult());

    useAuthStore.setState({
      servers: [
        {
          id: 'server-1',
          label: 'Server 1',
          baseUrl: 'https://archive1.example.com',
          token: 'token-1',
          status: 'idle',
        },
        {
          id: 'server-2',
          label: 'Server 2',
          baseUrl: 'https://archive2.example.com',
          token: 'token-2',
          status: 'idle',
        },
      ],
    });

    const { useSyncAll } = await import('@/hooks/useSyncAll');
    const { result } = renderHook(() => useSyncAll(), { wrapper });

    await act(async () => {
      await result.current.sync();
    });

    expect(mockSyncRemoteArchive).toHaveBeenCalledTimes(2);
    expect(mockSyncRemoteArchive).toHaveBeenCalledWith('server-1', {
      baseUrl: 'https://archive1.example.com',
      token: 'token-1',
    });
    expect(mockSyncRemoteArchive).toHaveBeenCalledWith('server-2', {
      baseUrl: 'https://archive2.example.com',
      token: 'token-2',
    });
  });

  it('skips servers whose onboardingStatus is "cancelled"', async () => {
    mockSyncRemoteArchive.mockResolvedValue(readyResult());

    useAuthStore.setState({
      servers: [
        {
          id: 'server-1',
          label: 'Cancelled Server',
          baseUrl: 'https://archive1.example.com',
          token: 'token-1',
          status: 'cancelled',
          onboardingStatus: 'cancelled',
        },
        {
          id: 'server-2',
          label: 'Active Server',
          baseUrl: 'https://archive2.example.com',
          token: 'token-2',
          status: 'idle',
          onboardingStatus: 'ready',
        },
      ],
    });

    const { useSyncAll } = await import('@/hooks/useSyncAll');
    const { result } = renderHook(() => useSyncAll(), { wrapper });

    await act(async () => {
      await result.current.sync();
    });

    expect(mockSyncRemoteArchive).toHaveBeenCalledTimes(1);
    expect(mockSyncRemoteArchive).toHaveBeenCalledWith('server-2', {
      baseUrl: 'https://archive2.example.com',
      token: 'token-2',
    });
    expect(mockSyncRemoteArchive).not.toHaveBeenCalledWith(
      'server-1',
      expect.anything(),
    );
  });

  it('syncs servers with any non-cancelled onboardingStatus, including undefined', async () => {
    mockSyncRemoteArchive.mockResolvedValue(readyResult());

    useAuthStore.setState({
      servers: [
        {
          id: 'server-1',
          label: 'No onboardingStatus set',
          baseUrl: 'https://archive1.example.com',
          token: 'token-1',
          status: 'idle',
        },
        {
          id: 'server-2',
          label: 'Partial',
          baseUrl: 'https://archive2.example.com',
          token: 'token-2',
          status: 'partial',
          onboardingStatus: 'partial',
        },
      ],
    });

    const { useSyncAll } = await import('@/hooks/useSyncAll');
    const { result } = renderHook(() => useSyncAll(), { wrapper });

    await act(async () => {
      await result.current.sync();
    });

    expect(mockSyncRemoteArchive).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// SyncAllSummary — the promise result consumed by SyncAllButton
// ---------------------------------------------------------------------------

describe('useSyncAll summary', () => {
  it('resolves an all-ready summary with one entry per eligible server', async () => {
    mockSyncRemoteArchive.mockImplementation(async (serverId: string) =>
      readyResult(serverId),
    );

    useAuthStore.setState({
      servers: [
        {
          id: 'server-1',
          label: 'Server 1',
          baseUrl: 'https://archive1.example.com',
          token: 'token-1',
          status: 'idle',
        },
        {
          id: 'server-2',
          label: 'Server 2',
          baseUrl: 'https://archive2.example.com',
          token: 'token-2',
          status: 'idle',
        },
      ],
    });

    const { useSyncAll } = await import('@/hooks/useSyncAll');
    const { result } = renderHook(() => useSyncAll(), { wrapper });

    let summary!: Awaited<ReturnType<typeof result.current.sync>>;
    await act(async () => {
      summary = await result.current.sync();
    });

    expect(summary).toEqual({
      total: 2,
      results: [
        {
          serverId: 'server-1',
          label: 'Server 1',
          success: true,
          status: 'ready',
        },
        {
          serverId: 'server-2',
          label: 'Server 2',
          success: true,
          status: 'ready',
        },
      ],
    });
    for (const entry of summary.results) {
      expect(Object.prototype.hasOwnProperty.call(entry, 'errorCode')).toBe(
        false,
      );
    }
  });

  it('maps a fulfilled partial result through verbatim', async () => {
    mockSyncRemoteArchive.mockResolvedValue({
      ...readyResult(),
      success: false,
      status: 'partial',
      errorCode: 'partial',
    });

    useAuthStore.setState({
      servers: [
        {
          id: 'server-1',
          label: 'Server 1',
          baseUrl: 'https://archive1.example.com',
          token: 'token-1',
          status: 'idle',
        },
      ],
    });

    const { useSyncAll } = await import('@/hooks/useSyncAll');
    const { result } = renderHook(() => useSyncAll(), { wrapper });

    let summary!: Awaited<ReturnType<typeof result.current.sync>>;
    await act(async () => {
      summary = await result.current.sync();
    });

    expect(summary).toEqual({
      total: 1,
      results: [
        {
          serverId: 'server-1',
          label: 'Server 1',
          success: false,
          status: 'partial',
          errorCode: 'partial',
        },
      ],
    });
  });

  it('normalizes a rejected server promise to status error without an errorCode', async () => {
    mockSyncRemoteArchive.mockImplementation(async (serverId: string) => {
      if (serverId === 'server-2') throw new Error('Network down');
      return readyResult(serverId);
    });

    useAuthStore.setState({
      servers: [
        {
          id: 'server-1',
          label: 'Server 1',
          baseUrl: 'https://archive1.example.com',
          token: 'token-1',
          status: 'idle',
        },
        {
          id: 'server-2',
          label: 'Server 2',
          baseUrl: 'https://archive2.example.com',
          token: 'token-2',
          status: 'idle',
        },
      ],
    });

    const { useSyncAll } = await import('@/hooks/useSyncAll');
    const { result } = renderHook(() => useSyncAll(), { wrapper });

    let summary!: Awaited<ReturnType<typeof result.current.sync>>;
    await act(async () => {
      summary = await result.current.sync();
    });

    expect(summary.total).toBe(2);
    expect(summary.results).toHaveLength(2);
    const failed = summary.results.find((r) => r.serverId === 'server-2');
    expect(failed).toEqual({
      serverId: 'server-2',
      label: 'Server 2',
      success: false,
      status: 'error',
    });
    expect(Object.prototype.hasOwnProperty.call(failed, 'errorCode')).toBe(
      false,
    );
    // The other server still reports its real outcome.
    expect(
      summary.results.find((r) => r.serverId === 'server-1'),
    ).toMatchObject({ success: true, status: 'ready' });
  });

  it('returns an error summary when the sync call throws before settling', async () => {
    mockSyncRemoteArchive.mockImplementation(() => {
      throw new Error('boom');
    });

    useAuthStore.setState({
      servers: [
        {
          id: 'server-1',
          label: 'Server 1',
          baseUrl: 'https://archive1.example.com',
          token: 'token-1',
          status: 'idle',
        },
        {
          id: 'server-2',
          label: 'Server 2',
          baseUrl: 'https://archive2.example.com',
          token: 'token-2',
          status: 'idle',
        },
      ],
    });

    const { useSyncAll } = await import('@/hooks/useSyncAll');
    const { result } = renderHook(() => useSyncAll(), { wrapper });

    let summary!: Awaited<ReturnType<typeof result.current.sync>>;
    await act(async () => {
      summary = await result.current.sync();
    });

    expect(summary).toEqual({
      total: 2,
      results: [
        {
          serverId: 'server-1',
          label: 'Server 1',
          success: false,
          status: 'error',
        },
        {
          serverId: 'server-2',
          label: 'Server 2',
          success: false,
          status: 'error',
        },
      ],
    });
  });

  it('resolves an empty summary without calling the data layer when nothing is eligible', async () => {
    useAuthStore.setState({
      servers: [
        {
          id: 'server-1',
          label: 'No token',
          baseUrl: 'https://archive1.example.com',
          token: null,
          status: 'idle',
        },
      ],
    });

    const { useSyncAll } = await import('@/hooks/useSyncAll');
    const { result } = renderHook(() => useSyncAll(), { wrapper });

    let summary!: Awaited<ReturnType<typeof result.current.sync>>;
    await act(async () => {
      summary = await result.current.sync();
    });

    expect(summary).toEqual({ total: 0, results: [] });
    expect(mockSyncRemoteArchive).not.toHaveBeenCalled();
    expect(result.current.isSyncing).toBe(false);
  });

  it('resolves an empty summary without toasting on a re-entrant call', async () => {
    let resolveSync!: (value: SyncResult) => void;
    mockSyncRemoteArchive.mockReturnValue(
      new Promise((resolve) => {
        resolveSync = resolve;
      }),
    );

    useAuthStore.setState({
      servers: [
        {
          id: 'server-1',
          label: 'Server 1',
          baseUrl: 'https://archive1.example.com',
          token: 'token-1',
          status: 'idle',
        },
      ],
    });

    const { useSyncAll } = await import('@/hooks/useSyncAll');
    const { result } = renderHook(() => useSyncAll(), {
      wrapper: createQueryWrapper(),
    });

    let first!: Awaited<ReturnType<typeof result.current.sync>>;
    let second!: Awaited<ReturnType<typeof result.current.sync>>;
    await act(async () => {
      const pending = result.current.sync();
      second = await result.current.sync();
      resolveSync(readyResult());
      first = await pending;
    });

    expect(first).toEqual({
      total: 1,
      results: [
        {
          serverId: 'server-1',
          label: 'Server 1',
          success: true,
          status: 'ready',
        },
      ],
    });
    // Re-entry resolves empty rather than reporting a "0 of 0" outcome.
    expect(second).toEqual({ total: 0, results: [] });
    expect(mockSyncRemoteArchive).toHaveBeenCalledTimes(1);
  });
});
