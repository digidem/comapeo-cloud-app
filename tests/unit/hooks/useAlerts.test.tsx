import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import React from 'react';
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useAlerts } from '@/hooks/useAlerts';
import { getAlerts } from '@/lib/data-layer';

vi.mock('@/lib/data-layer', () => ({
  getAlerts: vi.fn(),
}));

const mockGetAlerts = vi.mocked(getAlerts);

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useAlerts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not fetch when projectLocalId is null (enabled guard)', () => {
    const { result } = renderHook(() => useAlerts(null), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetAlerts).not.toHaveBeenCalled();
  });

  it('fetches alerts when projectLocalId is provided', async () => {
    const alerts = [{ docId: 'alert-1', createdAt: '2024-01-01T00:00:00Z' }];
    mockGetAlerts.mockResolvedValue(alerts as never);

    const { result } = renderHook(() => useAlerts('project-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(alerts);
    expect(mockGetAlerts).toHaveBeenCalledWith('project-1');
  });
});
