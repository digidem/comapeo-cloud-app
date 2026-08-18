import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import React from 'react';
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useCaseActivity } from '@/hooks/useCaseActivity';
import { getCaseActivity } from '@/lib/data-layer';

vi.mock('@/lib/data-layer', () => ({
  getCaseActivity: vi.fn(),
}));

const mockGetCaseActivity = vi.mocked(getCaseActivity);

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useCaseActivity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not fetch when projectLocalId is null', () => {
    const { result } = renderHook(() => useCaseActivity(null, 'case-1'), {
      wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetCaseActivity).not.toHaveBeenCalled();
  });

  it('does not fetch when caseId is null', () => {
    const { result } = renderHook(() => useCaseActivity('project-1', null), {
      wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetCaseActivity).not.toHaveBeenCalled();
  });

  it('fetches activity when both are provided', async () => {
    const activity = [
      {
        localId: 'a-1',
        caseLocalId: 'case-1',
        event: 'created',
        createdAt: '2024-01-01T00:00:00Z',
      },
      {
        localId: 'a-2',
        caseLocalId: 'case-1',
        event: 'status_changed',
        status: 'active',
        createdAt: '2024-01-02T00:00:00Z',
      },
    ];
    mockGetCaseActivity.mockResolvedValue(activity as never);

    const { result } = renderHook(
      () => useCaseActivity('project-1', 'case-1'),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetCaseActivity).toHaveBeenCalledWith('project-1', 'case-1');
    expect(result.current.data).toEqual(activity);
  });

  it('returns empty array when no activity', async () => {
    mockGetCaseActivity.mockResolvedValue([]);

    const { result } = renderHook(
      () => useCaseActivity('project-1', 'case-1'),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
