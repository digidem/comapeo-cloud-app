import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import React from 'react';
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useUpsertCaseReportState } from '@/hooks/useUpsertCaseReportState';
import * as dataLayer from '@/lib/data-layer';

vi.mock('@/lib/data-layer', () => ({
  upsertCaseReportState: vi.fn(),
}));

const mockUpsertCaseReportState = vi.mocked(dataLayer.upsertCaseReportState);

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

describe('useUpsertCaseReportState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastClient = null;
  });

  it('calls upsertCaseReportState with input and invalidates scoped report-state queries', async () => {
    const state = {
      localId: 'rs-1',
      caseLocalId: 'case-1',
      projectLocalId: 'proj-1',
      agency: 'FUNAI',
      status: 'complete',
      revision: 1,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    mockUpsertCaseReportState.mockResolvedValue(state as never);

    const { result } = renderHook(() => useUpsertCaseReportState(), {
      wrapper,
    });
    const invalidateSpy = vi.spyOn(lastClient!, 'invalidateQueries');

    result.current.mutate({
      projectLocalId: 'proj-1',
      caseLocalId: 'case-1',
      agency: 'FUNAI',
      status: 'complete',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockUpsertCaseReportState).toHaveBeenCalledWith({
      caseLocalId: 'case-1',
      projectLocalId: 'proj-1',
      agency: 'FUNAI',
      status: 'complete',
      count: undefined,
      revision: undefined,
    });
    // Invalidates both the report-states list and the single agency query
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['caseReportStates', 'proj-1', 'case-1'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['caseReportState', 'proj-1', 'case-1', 'FUNAI'],
    });
  });

  it('propagates errors from upsertCaseReportState', async () => {
    mockUpsertCaseReportState.mockRejectedValue(new Error('DB error'));

    const { result } = renderHook(() => useUpsertCaseReportState(), {
      wrapper,
    });
    result.current.mutate({
      projectLocalId: 'proj-1',
      caseLocalId: 'case-1',
      agency: 'FUNAI',
      status: 'incomplete',
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error('DB error'));
  });

  it('does not perform network requests — calls only the local data-layer function', async () => {
    mockUpsertCaseReportState.mockResolvedValue({ localId: 'rs-1' } as never);

    const { result } = renderHook(() => useUpsertCaseReportState(), {
      wrapper,
    });
    result.current.mutate({
      projectLocalId: 'proj-1',
      caseLocalId: 'case-1',
      agency: 'IBAMA',
      status: 'incomplete',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockUpsertCaseReportState).toHaveBeenCalledTimes(1);
  });
});
