import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import React from 'react';
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useCreateAlert } from '@/hooks/useCreateAlert';
import { createAlertForProject } from '@/lib/data-layer';
import type { Alert } from '@/lib/db';

vi.mock('@/lib/data-layer', () => ({
  createAlertForProject: vi.fn(),
}));

const mockCreateAlertForProject = vi.mocked(createAlertForProject);

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
    // Used by createAlertForProject's exported-signal tests below.
    mockCreateAlertForProject.mockResolvedValue({
      kind: 'local',
      alert: { localId: 'alert-l' } as Alert,
    });
  });

  it('successful mutation calls createAlertForProject and invalidates alerts query', async () => {
    const input = {
      projectLocalId: 'proj-1',
      geometry: { type: 'Point', coordinates: [0, 0] },
      metadata: { severity: 'high' },
      detectionDateStart: '2024-01-01T00:00:00Z',
      detectionDateEnd: '2024-01-31T00:00:00Z',
      sourceId: 'source-1',
    };

    const { result } = renderHook(() => useCreateAlert(), { wrapper });
    const invalidateSpy = vi.spyOn(lastClient!, 'invalidateQueries');
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockCreateAlertForProject).toHaveBeenCalledWith(input);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['alerts', 'proj-1'],
    });
  });

  it('mutation passes geometry, metadata, and date fields through to createAlertForProject', async () => {
    mockCreateAlertForProject.mockResolvedValue({ kind: 'archive' });

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
      metadata: {},
      detectionDateStart: '2024-02-01T00:00:00Z',
      detectionDateEnd: '2024-02-02T23:59:59Z',
      sourceId: 'source-2',
    };

    const { result } = renderHook(() => useCreateAlert(), { wrapper });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ kind: 'archive' });
    expect(mockCreateAlertForProject).toHaveBeenCalledWith(input);
  });

  it('surfaces a mutation failure when createAlertForProject rejects', async () => {
    mockCreateAlertForProject.mockRejectedValue(
      new Error('archive unreachable'),
    );

    const { result } = renderHook(() => useCreateAlert(), { wrapper });
    result.current.mutate({
      projectLocalId: 'proj-3',
      geometry: { type: 'Point', coordinates: [1, 2] },
      metadata: {},
      detectionDateStart: '2024-01-01T00:00:00Z',
      detectionDateEnd: '2024-01-01T23:59:59Z',
      sourceId: 's3',
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});
