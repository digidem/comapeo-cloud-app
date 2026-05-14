import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type ReactNode, act } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useAutoSync } from '@/hooks/useAutoSync';
import { syncRemoteArchive } from '@/lib/data-layer';
import * as localRepos from '@/lib/local-repositories';
import { useAuthStore } from '@/stores/auth-store';

vi.mock('@/lib/data-layer', () => ({
  syncRemoteArchive: vi.fn().mockResolvedValue({ success: true }),
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
