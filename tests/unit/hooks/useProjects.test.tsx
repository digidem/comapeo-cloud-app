import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import React from 'react';
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useProjects } from '@/hooks/useProjects';
import { getProjects } from '@/lib/data-layer';

vi.mock('@/lib/data-layer', () => ({
  getProjects: vi.fn(),
}));

const mockGetProjects = vi.mocked(getProjects);

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useProjects', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns projects list when data available', async () => {
    const projects = [{ localId: '1', name: 'Project A' }];
    mockGetProjects.mockResolvedValue(projects as never);

    const { result } = renderHook(() => useProjects(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(projects);
  });

  it('returns loading state initially', () => {
    mockGetProjects.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useProjects(), { wrapper });

    expect(result.current.isLoading).toBe(true);
  });

  it('returns empty array when no projects', async () => {
    mockGetProjects.mockResolvedValue([]);

    const { result } = renderHook(() => useProjects(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('returns error state on failure', async () => {
    mockGetProjects.mockRejectedValue(new Error('DB error'));

    const { result } = renderHook(() => useProjects(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
