import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import React from 'react';
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useCreateAlert } from '@/hooks/useCreateAlert';
import { createAlert } from '@/lib/data-layer';
import type { Alert } from '@/lib/db';

vi.mock('@/lib/data-layer', () => ({
  createAlert: vi.fn(),
}));

const mockCreateAlert = vi.mocked(createAlert);

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

describe('useCreateAlert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastClient = null;
  });

  it('successful mutation calls createAlert and invalidates alerts query', async () => {
    mockCreateAlert.mockResolvedValue(undefined as unknown as Alert);

    const input = {
      projectLocalId: 'proj-1',
      geometry: { type: 'Point', coordinates: [0, 0] },
      metadata: { severity: 'high' },
      detectionDateStart: '2024-01-01T00:00:00Z',
      detectionDateEnd: '2024-01-31T00:00:00Z',
    };

    const { result } = renderHook(() => useCreateAlert(), { wrapper });
    const invalidateSpy = vi.spyOn(lastClient!, 'invalidateQueries');
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockCreateAlert).toHaveBeenCalledWith(input);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['alerts', 'proj-1'],
    });
  });

  it('mutation passes geometry, metadata, and date fields through to createAlert', async () => {
    mockCreateAlert.mockResolvedValue(undefined as unknown as Alert);

    const input = {
      projectLocalId: 'proj-2',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      },
      metadata: undefined,
      detectionDateStart: undefined,
      detectionDateEnd: undefined,
    };

    const { result } = renderHook(() => useCreateAlert(), { wrapper });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockCreateAlert).toHaveBeenCalledWith(input);
  });
});
