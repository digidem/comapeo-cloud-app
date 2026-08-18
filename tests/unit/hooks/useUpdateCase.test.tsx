import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import React from 'react';
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useUpdateCase } from '@/hooks/useUpdateCase';
import { updateCase } from '@/lib/data-layer';

vi.mock('@/lib/data-layer', () => ({
  updateCase: vi.fn(),
}));

const mockUpdateCase = vi.mocked(updateCase);

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

describe('useUpdateCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastClient = null;
  });

  it('calls updateCase with scoped projectLocalId and localId, invalidates scoped queries', async () => {
    const updated = {
      localId: 'case-1',
      title: 'Updated Case',
      status: 'active',
    };
    mockUpdateCase.mockResolvedValue(updated as never);

    const { result } = renderHook(() => useUpdateCase(), { wrapper });
    const invalidateSpy = vi.spyOn(lastClient!, 'invalidateQueries');

    result.current.mutate({
      projectLocalId: 'proj-1',
      localId: 'case-1',
      updates: { title: 'Updated Case', status: 'active' },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockUpdateCase).toHaveBeenCalledWith('proj-1', 'case-1', {
      title: 'Updated Case',
      status: 'active',
    });
    // Invalidates both the detail and the list query for that project
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['cases', 'proj-1'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['case', 'proj-1', 'case-1'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['caseActivity', 'proj-1', 'case-1'],
    });
  });

  it('propagates errors from updateCase', async () => {
    mockUpdateCase.mockRejectedValue(new Error('Update failed'));

    const { result } = renderHook(() => useUpdateCase(), { wrapper });
    result.current.mutate({
      projectLocalId: 'proj-1',
      localId: 'case-1',
      updates: { status: 'closed' },
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error('Update failed'));
  });
});
