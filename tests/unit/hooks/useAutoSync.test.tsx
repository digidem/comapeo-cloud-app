import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type ReactNode, act } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useAutoSync } from '@/hooks/useAutoSync';
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

describe('useAutoSync', () => {
  it('does not sync when no servers are configured', () => {
    renderHook(() => useAutoSync(), { wrapper });

    expect(mockSyncRemoteArchive).not.toHaveBeenCalled();
  });

  it('syncs all configured servers with credentials on mount', async () => {
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

  it('skips servers without credentials', async () => {
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
          token: '',
          status: 'idle',
        },
      ],
    });

    renderHook(() => useAutoSync(), { wrapper });

    await waitFor(() => {
      expect(mockSyncRemoteArchive).toHaveBeenCalledTimes(1);
    });

    expect(mockSyncRemoteArchive).toHaveBeenCalledWith('server-1', {
      baseUrl: 'https://archive1.example.com',
      token: 'token-1',
    });
  });

  it('invalidates queries after successful sync', async () => {
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

    // Should not throw
    expect(() => {
      renderHook(() => useAutoSync(), { wrapper });
    }).not.toThrow();

    await waitFor(() => {
      expect(mockSyncRemoteArchive).toHaveBeenCalledTimes(1);
    });
  });
});
