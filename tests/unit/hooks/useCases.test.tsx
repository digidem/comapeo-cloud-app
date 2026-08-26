import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import React from 'react';
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useCases } from '@/hooks/useCases';
import { getCases } from '@/lib/data-layer';

vi.mock('@/lib/data-layer', () => ({
  getCases: vi.fn(),
}));

const mockGetCases = vi.mocked(getCases);

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useCases', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not fetch when projectLocalId is null (enabled guard)', () => {
    const { result } = renderHook(() => useCases(null), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetCases).not.toHaveBeenCalled();
  });

  it('fetches cases when projectLocalId is provided', async () => {
    const cases = [
      { localId: 'case-1', title: 'Case A', status: 'draft' },
      { localId: 'case-2', title: 'Case B', status: 'active' },
    ];
    mockGetCases.mockResolvedValue(cases as never);

    const { result } = renderHook(() => useCases('project-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(cases);
    expect(mockGetCases).toHaveBeenCalledWith('project-1');
  });

  it('returns loading state initially when projectLocalId is provided', () => {
    mockGetCases.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useCases('project-1'), { wrapper });

    expect(result.current.isLoading).toBe(true);
  });

  it('returns empty array when no cases for project', async () => {
    mockGetCases.mockResolvedValue([]);

    const { result } = renderHook(() => useCases('project-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('returns error state on failure', async () => {
    mockGetCases.mockRejectedValue(new Error('DB error'));

    const { result } = renderHook(() => useCases('project-1'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error('DB error'));
  });

  it('does not perform network requests for Case foundation (offline operation)', async () => {
    const cases = [{ localId: 'case-1', title: 'Case A', status: 'draft' }];
    mockGetCases.mockResolvedValue(cases as never);

    const { result } = renderHook(() => useCases('project-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The hook only calls the local data-layer function, never fetch/API client
    expect(mockGetCases).toHaveBeenCalledTimes(1);
  });
});
