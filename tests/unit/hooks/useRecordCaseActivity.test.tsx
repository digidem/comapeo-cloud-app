import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import React from 'react';
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useRecordCaseActivity } from '@/hooks/useRecordCaseActivity';
import * as dataLayer from '@/lib/data-layer';

vi.mock('@/lib/data-layer', () => ({
  recordCaseActivity: vi.fn(),
}));

const mockRecordCaseActivity = vi.mocked(dataLayer.recordCaseActivity);

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

describe('useRecordCaseActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastClient = null;
  });

  it('calls recordCaseActivity with input and invalidates the caseActivity query for that project/case', async () => {
    const activity = {
      localId: 'act-1',
      caseLocalId: 'case-1',
      projectLocalId: 'proj-1',
      event: 'status_changed',
      status: 'active',
      createdAt: '2024-01-01T00:00:00Z',
    };
    mockRecordCaseActivity.mockResolvedValue(activity as never);

    const { result } = renderHook(() => useRecordCaseActivity(), { wrapper });
    const invalidateSpy = vi.spyOn(lastClient!, 'invalidateQueries');

    result.current.mutate({
      projectLocalId: 'proj-1',
      caseLocalId: 'case-1',
      event: 'status_changed',
      status: 'active',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockRecordCaseActivity).toHaveBeenCalledWith({
      caseLocalId: 'case-1',
      projectLocalId: 'proj-1',
      event: 'status_changed',
      status: 'active',
      agency: undefined,
      count: undefined,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['caseActivity', 'proj-1', 'case-1'],
    });
  });

  it('propagates errors from recordCaseActivity', async () => {
    mockRecordCaseActivity.mockRejectedValue(new Error('DB error'));

    const { result } = renderHook(() => useRecordCaseActivity(), { wrapper });
    result.current.mutate({
      projectLocalId: 'proj-1',
      caseLocalId: 'case-1',
      event: 'created',
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error('DB error'));
  });

  it('does not perform network requests — calls only the local data-layer function', async () => {
    mockRecordCaseActivity.mockResolvedValue({ localId: 'act-1' } as never);

    const { result } = renderHook(() => useRecordCaseActivity(), { wrapper });
    result.current.mutate({
      projectLocalId: 'proj-1',
      caseLocalId: 'case-1',
      event: 'created',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockRecordCaseActivity).toHaveBeenCalledTimes(1);
  });
});
