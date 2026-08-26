import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import React from 'react';
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useCaseReportStates } from '@/hooks/useCaseReportStates';
import { getCaseReportStates } from '@/lib/data-layer';

vi.mock('@/lib/data-layer', () => ({
  getCaseReportStates: vi.fn(),
}));

const mockGetCaseReportStates = vi.mocked(getCaseReportStates);

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useCaseReportStates', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not fetch when projectLocalId is null', () => {
    const { result } = renderHook(() => useCaseReportStates(null, 'case-1'), {
      wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetCaseReportStates).not.toHaveBeenCalled();
  });

  it('does not fetch when caseId is null', () => {
    const { result } = renderHook(
      () => useCaseReportStates('project-1', null),
      { wrapper },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetCaseReportStates).not.toHaveBeenCalled();
  });

  it('fetches report states when both are provided', async () => {
    const states = [
      {
        localId: 'rs-1',
        caseLocalId: 'case-1',
        agency: 'FUNAI',
        status: 'incomplete',
        revision: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      {
        localId: 'rs-2',
        caseLocalId: 'case-1',
        agency: 'IBAMA',
        status: 'incomplete',
        revision: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      {
        localId: 'rs-3',
        caseLocalId: 'case-1',
        agency: 'MPF',
        status: 'incomplete',
        revision: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      {
        localId: 'rs-4',
        caseLocalId: 'case-1',
        agency: 'PF',
        status: 'incomplete',
        revision: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ];
    mockGetCaseReportStates.mockResolvedValue(states as never);

    const { result } = renderHook(
      () => useCaseReportStates('project-1', 'case-1'),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetCaseReportStates).toHaveBeenCalledWith('project-1', 'case-1');
    expect(result.current.data).toEqual(states);
  });

  it('returns empty array when no report states', async () => {
    mockGetCaseReportStates.mockResolvedValue([]);

    const { result } = renderHook(
      () => useCaseReportStates('project-1', 'case-1'),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
