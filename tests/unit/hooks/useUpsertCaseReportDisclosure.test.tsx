import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useUpsertCaseReportDisclosure } from '@/hooks/useUpsertCaseReportDisclosure';
import * as dataLayer from '@/lib/data-layer';

vi.mock('@/lib/data-layer', () => ({
  upsertCaseReportDisclosure: vi.fn(),
}));

const mockUpsertCaseReportDisclosure = vi.mocked(
  dataLayer.upsertCaseReportDisclosure,
);
let lastClient: QueryClient | null = null;

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  lastClient = queryClient;
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useUpsertCaseReportDisclosure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastClient = null;
  });

  it('invalidates the canonical Case activity query after saving disclosure', async () => {
    mockUpsertCaseReportDisclosure.mockResolvedValue({
      localId: 'disclosure-1',
    } as never);

    const { result } = renderHook(() => useUpsertCaseReportDisclosure(), {
      wrapper,
    });
    const invalidateSpy = vi.spyOn(lastClient!, 'invalidateQueries');

    result.current.mutate({
      projectLocalId: 'project-1',
      caseLocalId: 'case-1',
      agency: 'FUNAI',
      disclosure: {
        reporterIdentity: 'omit',
        locationMode: 'omit',
        people: [],
        media: [],
        sensitiveFields: [],
      },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['case-report-disclosure', 'project-1', 'case-1', 'FUNAI'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['caseActivity', 'project-1', 'case-1'],
    });
  });
});
