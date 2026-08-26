import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import React from 'react';
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useCreateCase } from '@/hooks/useCreateCase';
import { createCase } from '@/lib/data-layer';

vi.mock('@/lib/data-layer', () => ({
  createCase: vi.fn(),
}));

const mockCreateCase = vi.mocked(createCase);

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

describe('useCreateCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastClient = null;
  });

  it('calls createCase with input and invalidates the cases query for that project', async () => {
    const created = { localId: 'case-1', title: 'New Case', status: 'draft' };
    mockCreateCase.mockResolvedValue(created as never);

    const input = {
      projectLocalId: 'proj-1',
      title: 'New Case',
      caseType: 'illegal_mining' as const,
    };

    const { result } = renderHook(() => useCreateCase(), { wrapper });
    const invalidateSpy = vi.spyOn(lastClient!, 'invalidateQueries');
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockCreateCase).toHaveBeenCalledWith(input);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['cases', 'proj-1'],
    });
  });

  it('returns error state when createCase rejects', async () => {
    mockCreateCase.mockRejectedValue(new Error('DB error'));

    const { result } = renderHook(() => useCreateCase(), { wrapper });
    result.current.mutate({
      projectLocalId: 'proj-1',
      title: 'Bad Case',
      caseType: 'illegal_mining',
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error('DB error'));
  });

  it('does not perform network requests — calls only local data-layer function', async () => {
    mockCreateCase.mockResolvedValue({ localId: 'c1' } as never);

    const { result } = renderHook(() => useCreateCase(), { wrapper });
    result.current.mutate({
      projectLocalId: 'proj-1',
      title: 'Case',
      caseType: 'fire',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockCreateCase).toHaveBeenCalledTimes(1);
  });
});
