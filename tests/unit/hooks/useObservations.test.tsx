import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import React from 'react';
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useObservations } from '@/hooks/useObservations';
import { getObservations } from '@/lib/data-layer';

vi.mock('@/lib/data-layer', () => ({
  getObservations: vi.fn(),
}));

const mockGetObservations = vi.mocked(getObservations);

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useObservations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not fetch when projectLocalId is null (enabled guard)', () => {
    const { result } = renderHook(() => useObservations(null), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetObservations).not.toHaveBeenCalled();
  });

  it('fetches observations when projectLocalId is provided', async () => {
    const observations = [
      { docId: 'obs-1', createdAt: '2024-01-01T00:00:00Z' },
    ];
    mockGetObservations.mockResolvedValue(observations as never);

    const { result } = renderHook(() => useObservations('project-1'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(observations);
    expect(mockGetObservations).toHaveBeenCalledWith('project-1');
  });
});
