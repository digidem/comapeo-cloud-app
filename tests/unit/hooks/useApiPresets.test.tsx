import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useApiPresets } from '@/hooks/useApiPresets';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getPresets: vi.fn(),
  },
}));

const getPresets = vi.mocked(apiClient.getPresets);

const REMOTE_ID = '4ymf7qmcafhpbmcrpdx6yxubstk66ipfq5ek5bporosi7594z8ty';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useApiPresets', () => {
  beforeEach(() => {
    getPresets.mockReset();
    getPresets.mockResolvedValue({ data: [] });
    useAuthStore.getState().clearAll();
  });

  it('passes the active server RequestConfig (baseUrl + token) to getPresets', async () => {
    useAuthStore.setState({
      baseUrl: 'https://archive.example.org',
      token: 'secret-token',
    });

    const { result } = renderHook(() => useApiPresets(REMOTE_ID), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getPresets).toHaveBeenCalledWith(REMOTE_ID, {
      baseUrl: 'https://archive.example.org',
      token: 'secret-token',
    });
  });

  it('is disabled (never fetches) when no active server is configured', async () => {
    // No baseUrl set — clearAll() leaves baseUrl null.
    const { result } = renderHook(() => useApiPresets(REMOTE_ID), { wrapper });

    // Give the query a chance to run if it were enabled.
    await Promise.resolve();

    expect(result.current.fetchStatus).toBe('idle');
    expect(getPresets).not.toHaveBeenCalled();
  });

  it('is disabled when projectRemoteId is null', async () => {
    useAuthStore.setState({
      baseUrl: 'https://archive.example.org',
      token: 'secret-token',
    });

    const { result } = renderHook(() => useApiPresets(null), { wrapper });

    await Promise.resolve();

    expect(result.current.fetchStatus).toBe('idle');
    expect(getPresets).not.toHaveBeenCalled();
  });

  it('exposes only the inner data array via select', async () => {
    useAuthStore.setState({
      baseUrl: 'https://archive.example.org',
      token: 'secret-token',
    });
    getPresets.mockResolvedValue({
      data: [{ docId: 'p1', name: 'Forest', tags: {}, fieldRefs: [] }],
    } as never);

    const { result } = renderHook(() => useApiPresets(REMOTE_ID), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([
      { docId: 'p1', name: 'Forest', tags: {}, fieldRefs: [] },
    ]);
  });
});
