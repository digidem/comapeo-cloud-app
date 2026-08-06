import { renderHook, waitFor } from '@testing-library/react';
import { createQueryWrapper } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useObservationCategoryMetadata } from '@/hooks/useObservationCategoryMetadata';
import type { Observation, Preset } from '@/lib/db';

const mockGetPresets = vi.fn();
vi.mock('@/lib/data-layer', () => ({
  getPresets: (...args: unknown[]) => mockGetPresets(...args),
}));

const FOREST_PRESET: Preset = {
  localId: 'preset-1',
  projectLocalId: 'proj-1',
  sourceType: 'remote',
  sourceId: 'proj-1',
  name: 'Forest',
  tags: { type: 'forest' },
  terms: [],
  fieldRefs: [],
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  dirtyLocal: false,
  deleted: false,
};

function makeObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    localId: 'obs-1',
    projectLocalId: 'proj-1',
    sourceType: 'remote',
    sourceId: 'proj-1',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    dirtyLocal: false,
    deleted: false,
    tags: { type: 'forest' },
    ...overrides,
  };
}

describe('useObservationCategoryMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty metadata when there are no observations and no presets', async () => {
    mockGetPresets.mockResolvedValue([]);

    const { result } = renderHook(
      () =>
        useObservationCategoryMetadata({
          observations: [],
          projectLocalId: 'proj-1',
        }),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.categories).toEqual([]);
    expect(result.current.categoryByObservationId.size).toBe(0);
    expect(result.current.displayNamesByObservationId.size).toBe(0);
  });

  it('reports isLoading while presets are still being fetched', async () => {
    let resolvePresets: (presets: Preset[]) => void;
    mockGetPresets.mockReturnValue(
      new Promise<Preset[]>((resolve) => {
        resolvePresets = resolve;
      }),
    );

    const { result } = renderHook(
      () =>
        useObservationCategoryMetadata({
          observations: [makeObservation()],
          projectLocalId: 'proj-1',
        }),
      { wrapper: createQueryWrapper() },
    );

    expect(result.current.isLoading).toBe(true);

    resolvePresets!([FOREST_PRESET]);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.categoryByObservationId.get('obs-1')?.name).toBe(
      'Forest',
    );
  });

  it('is not loading when the presets query is disabled', () => {
    mockGetPresets.mockResolvedValue([]);

    const { result } = renderHook(
      () =>
        useObservationCategoryMetadata({
          observations: [],
          projectLocalId: null,
        }),
      { wrapper: createQueryWrapper() },
    );

    expect(result.current.isLoading).toBe(false);
    expect(mockGetPresets).not.toHaveBeenCalled();
  });

  it('keeps the same metadata reference across re-renders when inputs are unchanged', async () => {
    mockGetPresets.mockResolvedValue([FOREST_PRESET]);
    const observations = [makeObservation()];

    const { result, rerender } = renderHook(
      (props: { observations: Observation[] }) =>
        useObservationCategoryMetadata({
          observations: props.observations,
          projectLocalId: 'proj-1',
        }),
      { wrapper: createQueryWrapper(), initialProps: { observations } },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const firstCategoryByObservationId = result.current.categoryByObservationId;

    rerender({ observations });

    expect(result.current.categoryByObservationId).toBe(
      firstCategoryByObservationId,
    );
  });
});
