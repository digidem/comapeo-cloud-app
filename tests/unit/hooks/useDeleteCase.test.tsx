import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import React from 'react';
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useDeleteCase } from '@/hooks/useDeleteCase';
import { deleteCase } from '@/lib/data-layer';

vi.mock('@/lib/data-layer', () => ({
  deleteCase: vi.fn(),
}));

const mockDeleteCase = vi.mocked(deleteCase);

let lastClient: QueryClient | null = null;

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  lastClient = qc;
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useDeleteCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastClient = null;
  });

  it('calls deleteCase with scoped projectLocalId and localId, invalidates scoped queries', async () => {
    mockDeleteCase.mockResolvedValue(true);

    const { result } = renderHook(() => useDeleteCase(), { wrapper });
    const invalidateSpy = vi.spyOn(lastClient!, 'invalidateQueries');

    result.current.mutate({
      projectLocalId: 'proj-1',
      localId: 'case-1',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockDeleteCase).toHaveBeenCalledWith('proj-1', 'case-1');
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['cases', 'proj-1'],
    });
  });

  it('propagates errors from deleteCase', async () => {
    mockDeleteCase.mockRejectedValue(new Error('Delete failed'));

    const { result } = renderHook(() => useDeleteCase(), { wrapper });
    result.current.mutate({
      projectLocalId: 'proj-1',
      localId: 'case-1',
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error('Delete failed'));
  });

  it('does not perform network requests — calls only local data-layer function', async () => {
    mockDeleteCase.mockResolvedValue(true);

    const { result } = renderHook(() => useDeleteCase(), { wrapper });
    result.current.mutate({
      projectLocalId: 'proj-1',
      localId: 'case-1',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDeleteCase).toHaveBeenCalledTimes(1);
  });
});
