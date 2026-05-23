import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactNode } from 'react';
import { act } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { syncRemoteArchive } from '@/lib/data-layer';
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

describe('useSyncAll', () => {
  it('returns isSyncing=false initially', async () => {
    const { useSyncAll } = await import('@/hooks/useSyncAll');
    const { result } = renderHook(() => useSyncAll(), { wrapper });
    expect(result.current.isSyncing).toBe(false);
  });

  it('sets isSyncing=true while syncing', async () => {
    let resolveSync!: (value: { success: boolean; error?: string }) => void;
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
      resolveSync({ success: true });
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.isSyncing).toBe(false);
  });

  it('resets isSyncing=false after success', async () => {
    mockSyncRemoteArchive.mockResolvedValue({ success: true });

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

  it('invalidates projects/observations/alerts queries after sync', async () => {
    mockSyncRemoteArchive.mockResolvedValue({ success: true });

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

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['observations'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['alerts'] });
  });

  it('ignores concurrent sync() calls while one is in flight', async () => {
    let resolveSync!: (value: { success: boolean; error?: string }) => void;
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
      resolveSync({ success: true });
      await new Promise((r) => setTimeout(r, 0));
    });
  });

  it('syncs all servers from auth store', async () => {
    mockSyncRemoteArchive.mockResolvedValue({ success: true });

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
});
