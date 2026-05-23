import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type ReactNode, act } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useAutoSync } from '@/hooks/useAutoSync';
import { syncRemoteArchive } from '@/lib/data-layer';
import * as localRepos from '@/lib/local-repositories';
import { useAuthStore } from '@/stores/auth-store';

vi.mock('@/lib/data-layer', () => ({
  syncRemoteArchive: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/local-repositories', () => ({
  getRemoteServers: vi.fn().mockResolvedValue([]),
}));

const mockSyncRemoteArchive = vi.mocked(syncRemoteArchive);

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

describe('useAutoSync', () => {
  it('does not sync when no servers are in IndexedDB', async () => {
    vi.spyOn(localRepos, 'getRemoteServers').mockResolvedValue([]);

    renderHook(() => useAutoSync(), { wrapper });

    // Wait for async getRemoteServers to resolve
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(mockSyncRemoteArchive).not.toHaveBeenCalled();
  });

  it('syncs all servers with credentials from IndexedDB on mount', async () => {
    vi.spyOn(localRepos, 'getRemoteServers').mockResolvedValue([
      {
        id: 'server-1',
        baseUrl: 'https://archive1.example.com',
        label: 'Server 1',
        token: 'token-1',
        status: 'idle',
        lastSyncedAt: '',
      },
      {
        id: 'server-2',
        baseUrl: 'https://archive2.example.com',
        label: 'Server 2',
        token: 'token-2',
        status: 'idle',
        lastSyncedAt: '',
      },
    ]);

    renderHook(() => useAutoSync(), { wrapper });

    await waitFor(() => {
      expect(mockSyncRemoteArchive).toHaveBeenCalledTimes(2);
    });

    expect(mockSyncRemoteArchive).toHaveBeenCalledWith('server-1', {
      baseUrl: 'https://archive1.example.com',
      token: 'token-1',
    });
    expect(mockSyncRemoteArchive).toHaveBeenCalledWith('server-2', {
      baseUrl: 'https://archive2.example.com',
      token: 'token-2',
    });
  });

  it('skips servers without token in IndexedDB', async () => {
    vi.spyOn(localRepos, 'getRemoteServers').mockResolvedValue([
      {
        id: 'server-1',
        baseUrl: 'https://archive1.example.com',
        label: 'Server 1',
        token: 'token-1',
        status: 'idle',
        lastSyncedAt: '',
      },
      {
        id: 'server-2',
        baseUrl: 'https://archive2.example.com',
        label: 'Server 2',
        status: 'idle',
        lastSyncedAt: '',
      },
    ]);

    renderHook(() => useAutoSync(), { wrapper });

    await waitFor(() => {
      expect(mockSyncRemoteArchive).toHaveBeenCalledTimes(1);
    });

    expect(mockSyncRemoteArchive).toHaveBeenCalledWith('server-1', {
      baseUrl: 'https://archive1.example.com',
      token: 'token-1',
    });
  });

  it('hydrates auth store from IndexedDB on mount', async () => {
    vi.spyOn(localRepos, 'getRemoteServers').mockResolvedValue([
      {
        id: 'server-1',
        baseUrl: 'https://archive1.example.com',
        label: 'Server 1',
        token: 'token-1',
        status: 'idle',
        lastSyncedAt: '',
      },
    ]);

    renderHook(() => useAutoSync(), { wrapper });

    await waitFor(() => {
      expect(useAuthStore.getState().servers.length).toBe(1);
    });

    const server = useAuthStore.getState().servers[0]!;
    expect(server.id).toBe('server-1');
    expect(server.token).toBe('token-1');
    expect(server.baseUrl).toBe('https://archive1.example.com');
  });

  it('invalidates queries after successful sync', async () => {
    vi.spyOn(localRepos, 'getRemoteServers').mockResolvedValue([
      {
        id: 'server-1',
        baseUrl: 'https://archive1.example.com',
        label: 'Server 1',
        token: 'token-1',
        status: 'idle',
        lastSyncedAt: '',
      },
    ]);

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const invalidateSpyBind = vi.spyOn(qc, 'invalidateQueries');

    renderHook(() => useAutoSync(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      ),
    });

    await waitFor(() => {
      expect(mockSyncRemoteArchive).toHaveBeenCalledTimes(1);
    });

    // Wait for the .then() to execute
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(invalidateSpyBind).toHaveBeenCalledWith({
      queryKey: ['projects'],
    });
    expect(invalidateSpyBind).toHaveBeenCalledWith({
      queryKey: ['observations'],
    });
    expect(invalidateSpyBind).toHaveBeenCalledWith({
      queryKey: ['alerts'],
    });
  });

  it('only syncs once on mount (not on re-renders)', async () => {
    vi.spyOn(localRepos, 'getRemoteServers').mockResolvedValue([
      {
        id: 'server-1',
        baseUrl: 'https://archive1.example.com',
        label: 'Server 1',
        token: 'token-1',
        status: 'idle',
        lastSyncedAt: '',
      },
    ]);

    const { rerender } = renderHook(() => useAutoSync(), { wrapper });

    await waitFor(() => {
      expect(mockSyncRemoteArchive).toHaveBeenCalledTimes(1);
    });

    rerender();

    // Should still be 1 — no re-sync on re-render
    expect(mockSyncRemoteArchive).toHaveBeenCalledTimes(1);
  });

  it('handles sync errors gracefully without throwing', async () => {
    mockSyncRemoteArchive.mockRejectedValueOnce(new Error('Network error'));

    vi.spyOn(localRepos, 'getRemoteServers').mockResolvedValue([
      {
        id: 'server-1',
        baseUrl: 'https://archive1.example.com',
        label: 'Server 1',
        token: 'token-1',
        status: 'idle',
        lastSyncedAt: '',
      },
    ]);

    // Should not throw
    expect(() => {
      renderHook(() => useAutoSync(), { wrapper });
    }).not.toThrow();

    await waitFor(() => {
      expect(mockSyncRemoteArchive).toHaveBeenCalledTimes(1);
    });
  });
});

describe('useAutoSync polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    useAuthStore.setState({
      servers: [],
      activeServerId: null,
      token: null,
      baseUrl: null,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    // Restore visibility state
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
      writable: true,
    });
  });

  /**
   * Helper: flush microtasks + any tiny timers so that Promises resolve
   * and effects settle. Does NOT advance far enough to trigger polls.
   */
  async function flushMicrotasks() {
    await act(async () => {
      // advanceTimersByTimeAsync processes microtasks even with 0ms.
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  it('polls every pollIntervalMs while tab is visible', async () => {
    vi.spyOn(localRepos, 'getRemoteServers').mockResolvedValue([
      {
        id: 'server-1',
        baseUrl: 'https://archive1.example.com',
        label: 'Server 1',
        token: 'token-1',
        status: 'idle',
        lastSyncedAt: '',
      },
    ]);

    renderHook(() => useAutoSync({ pollIntervalMs: 5 * 60 * 1000 }), {
      wrapper,
    });

    // Flush microtasks so initial mount sync completes
    await flushMicrotasks();
    expect(mockSyncRemoteArchive).toHaveBeenCalledTimes(1);

    // Advance 5 min — first poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });
    expect(mockSyncRemoteArchive).toHaveBeenCalledTimes(2);

    // Advance another 5 min — second poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });
    expect(mockSyncRemoteArchive).toHaveBeenCalledTimes(3);

    // Advance another 5 min — third poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });
    // 1 mount + 3 polls = 4 calls
    expect(mockSyncRemoteArchive).toHaveBeenCalledTimes(4);
  });

  it('does not poll while document is hidden', async () => {
    vi.spyOn(localRepos, 'getRemoteServers').mockResolvedValue([
      {
        id: 'server-1',
        baseUrl: 'https://archive1.example.com',
        label: 'Server 1',
        token: 'token-1',
        status: 'idle',
        lastSyncedAt: '',
      },
    ]);

    renderHook(() => useAutoSync({ pollIntervalMs: 5 * 60 * 1000 }), {
      wrapper,
    });

    // Flush microtasks so initial mount sync completes
    await flushMicrotasks();
    expect(mockSyncRemoteArchive).toHaveBeenCalledTimes(1);

    // Hide the tab
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
      writable: true,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Advance 10 min — should NOT poll while hidden
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    });

    expect(mockSyncRemoteArchive).toHaveBeenCalledTimes(1);
  });

  it('resumes polling when tab becomes visible', async () => {
    vi.spyOn(localRepos, 'getRemoteServers').mockResolvedValue([
      {
        id: 'server-1',
        baseUrl: 'https://archive1.example.com',
        label: 'Server 1',
        token: 'token-1',
        status: 'idle',
        lastSyncedAt: '',
      },
    ]);

    renderHook(() => useAutoSync({ pollIntervalMs: 5 * 60 * 1000 }), {
      wrapper,
    });

    // Flush microtasks so initial mount sync completes
    await flushMicrotasks();
    expect(mockSyncRemoteArchive).toHaveBeenCalledTimes(1);

    // Hide the tab
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
      writable: true,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Advance 10 min while hidden — no polls
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    });
    expect(mockSyncRemoteArchive).toHaveBeenCalledTimes(1);

    // Make tab visible again
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
      writable: true,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Advance 5 min — should poll again
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });
    // 1 mount + 1 resumed poll = 2
    expect(mockSyncRemoteArchive).toHaveBeenCalledTimes(2);
  });

  it('skips poll when previous sync still in flight', async () => {
    let resolveSync!: (value: { success: boolean }) => void;
    mockSyncRemoteArchive.mockImplementation(
      () =>
        new Promise<{ success: boolean }>((resolve) => {
          resolveSync = resolve;
        }),
    );

    vi.spyOn(localRepos, 'getRemoteServers').mockResolvedValue([
      {
        id: 'server-1',
        baseUrl: 'https://archive1.example.com',
        label: 'Server 1',
        token: 'token-1',
        status: 'idle',
        lastSyncedAt: '',
      },
    ]);

    renderHook(() => useAutoSync({ pollIntervalMs: 5 * 60 * 1000 }), {
      wrapper,
    });

    // Flush microtasks — initial sync starts but is pending (promise not resolved)
    await flushMicrotasks();

    // The sync was called but has not resolved yet. The mock was called once.
    expect(mockSyncRemoteArchive).toHaveBeenCalledTimes(1);

    // Advance 5 min — poll should be skipped because previous sync is in flight
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });

    // Still only 1 call — the poll was skipped
    expect(mockSyncRemoteArchive).toHaveBeenCalledTimes(1);

    // Now resolve the pending sync
    await act(async () => {
      resolveSync({ success: true });
      // flush the microtask that settles the promise chain
      await vi.advanceTimersByTimeAsync(0);
    });

    // Advance another 5 min — now it should poll again
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });

    expect(mockSyncRemoteArchive).toHaveBeenCalledTimes(2);
  });

  it('clears interval on unmount', async () => {
    vi.spyOn(localRepos, 'getRemoteServers').mockResolvedValue([
      {
        id: 'server-1',
        baseUrl: 'https://archive1.example.com',
        label: 'Server 1',
        token: 'token-1',
        status: 'idle',
        lastSyncedAt: '',
      },
    ]);

    const { unmount } = renderHook(
      () => useAutoSync({ pollIntervalMs: 5 * 60 * 1000 }),
      { wrapper },
    );

    // Flush microtasks so initial mount sync completes
    await flushMicrotasks();
    expect(mockSyncRemoteArchive).toHaveBeenCalledTimes(1);

    unmount();

    // Advance 10 min after unmount — no additional calls
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    });

    expect(mockSyncRemoteArchive).toHaveBeenCalledTimes(1);
  });

  it('uses custom pollIntervalMs when provided', async () => {
    // Reset mock explicitly — the "skips poll" test's mockImplementation
    // can leave residual state even after vi.clearAllMocks().
    mockSyncRemoteArchive.mockResolvedValue({ success: true });

    vi.spyOn(localRepos, 'getRemoteServers').mockResolvedValue([
      {
        id: 'server-1',
        baseUrl: 'https://archive1.example.com',
        label: 'Server 1',
        token: 'token-1',
        status: 'idle',
        lastSyncedAt: '',
      },
    ]);

    renderHook(() => useAutoSync({ pollIntervalMs: 60_000 }), { wrapper });

    // Flush microtasks so initial mount sync completes
    await flushMicrotasks();
    expect(mockSyncRemoteArchive).toHaveBeenCalledTimes(1);

    // Advance 60s — should trigger a poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    await flushMicrotasks();

    expect(mockSyncRemoteArchive).toHaveBeenCalledTimes(2);
  });
});
