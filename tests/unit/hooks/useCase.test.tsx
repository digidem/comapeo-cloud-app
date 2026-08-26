import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import React from 'react';
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useCase } from '@/hooks/useCase';
import { getCase } from '@/lib/data-layer';

vi.mock('@/lib/data-layer', () => ({
  getCase: vi.fn(),
}));

const mockGetCase = vi.mocked(getCase);

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useCase', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not fetch when projectLocalId is null', () => {
    const { result } = renderHook(() => useCase(null, 'case-1'), {
      wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetCase).not.toHaveBeenCalled();
  });

  it('does not fetch when caseId is null', () => {
    const { result } = renderHook(() => useCase('project-1', null), {
      wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetCase).not.toHaveBeenCalled();
  });

  it('does not fetch when both are absent', () => {
    const { result } = renderHook(() => useCase(null, null), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetCase).not.toHaveBeenCalled();
  });

  it('fetches when both projectLocalId and caseId are provided', async () => {
    const caseData = {
      localId: 'case-1',
      title: 'Case A',
      status: 'draft',
    };
    mockGetCase.mockResolvedValue(caseData as never);

    const { result } = renderHook(() => useCase('project-1', 'case-1'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetCase).toHaveBeenCalledWith('project-1', 'case-1');
    expect(result.current.data).toEqual(caseData);
  });

  it('resolves to null when Case is missing for that project (cross-project/missing = null)', async () => {
    mockGetCase.mockResolvedValue(undefined);

    const { result } = renderHook(() => useCase('project-1', 'missing-case'), {
      wrapper,
    });

    // A missing Case resolves to null so consumers can distinguish it from a
    // loaded Case object; getCase returns undefined for missing/cross-project.
    await waitFor(() => {
      expect(result.current.fetchStatus).toBe('idle');
      expect(result.current.isSuccess).toBe(true);
    });
    expect(mockGetCase).toHaveBeenCalledWith('project-1', 'missing-case');
    expect(result.current.data).toBeNull();
  });
});
