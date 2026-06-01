import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useObservationFilters } from '@/hooks/useObservationFilters';
import type { Observation } from '@/lib/db';
import { DEFAULT_FILTERS } from '@/lib/observation-filters';

// --- Helpers ---

function makeObs(
  overrides: Partial<Observation> & { localId: string },
): Observation {
  return {
    projectLocalId: 'proj-1',
    sourceType: 'local',
    sourceId: 'src-1',
    createdAt: '2024-03-15T10:30:00Z',
    updatedAt: '2024-03-15T10:30:00Z',
    dirtyLocal: false,
    deleted: false,
    ...overrides,
  };
}

const observations = [
  makeObs({
    localId: '1',
    createdAt: '2024-03-15T10:00:00Z',
    tags: { category: 'forest', notes: 'Deforestation detected' },
  }),
  makeObs({
    localId: '2',
    createdAt: '2024-03-14T10:00:00Z',
    tags: { category: 'water', notes: 'Water quality test' },
  }),
  makeObs({
    localId: '3',
    createdAt: '2024-03-16T10:00:00Z',
    tags: { category: 'forest', notes: 'Reforestation effort' },
  }),
];

describe('useObservationFilters', () => {
  it('returns DEFAULT_FILTERS as initial state', () => {
    const { result } = renderHook(() => useObservationFilters(observations));
    expect(result.current.filters).toEqual(DEFAULT_FILTERS);
  });

  it('returns all observations sorted newest by default', () => {
    const { result } = renderHook(() => useObservationFilters(observations));
    expect(result.current.filteredObservations.map((o) => o.localId)).toEqual([
      '3',
      '1',
      '2',
    ]);
  });

  it('setSearch narrows filteredObservations', () => {
    const { result } = renderHook(() => useObservationFilters(observations));
    act(() => {
      result.current.setSearch('water');
    });
    expect(result.current.filteredObservations).toHaveLength(1);
    expect(result.current.filteredObservations[0]!.localId).toBe('2');
  });

  it('toggleCategory adds and removes categories', () => {
    const { result } = renderHook(() => useObservationFilters(observations));

    // Add 'forest'
    act(() => {
      result.current.toggleCategory('forest');
    });
    expect(result.current.filters.categories).toEqual(['forest']);
    expect(result.current.filteredObservations).toHaveLength(2);
    expect(result.current.isFiltering).toBe(true);

    // Add 'water' — should have both (OR logic)
    act(() => {
      result.current.toggleCategory('water');
    });
    expect(result.current.filters.categories).toEqual(['forest', 'water']);
    expect(result.current.filteredObservations).toHaveLength(3);

    // Remove 'forest'
    act(() => {
      result.current.toggleCategory('forest');
    });
    expect(result.current.filters.categories).toEqual(['water']);
    expect(result.current.filteredObservations).toHaveLength(1);
    expect(result.current.filteredObservations[0]!.localId).toBe('2');

    // Remove 'water' — back to empty
    act(() => {
      result.current.toggleCategory('water');
    });
    expect(result.current.filters.categories).toEqual([]);
    expect(result.current.isFiltering).toBe(false);
    expect(result.current.filteredObservations).toHaveLength(3);
  });

  it('setCategories replaces entire category array', () => {
    const { result } = renderHook(() => useObservationFilters(observations));
    act(() => {
      result.current.setCategories(['forest']);
    });
    expect(result.current.filters.categories).toEqual(['forest']);
    expect(result.current.filteredObservations).toHaveLength(2);

    act(() => {
      result.current.setCategories(['water']);
    });
    expect(result.current.filters.categories).toEqual(['water']);
    expect(result.current.filteredObservations).toHaveLength(1);

    act(() => {
      result.current.setCategories([]);
    });
    expect(result.current.filters.categories).toEqual([]);
  });

  it('setStartDate updates filters and derived list', () => {
    const { result } = renderHook(() => useObservationFilters(observations));
    act(() => {
      result.current.setStartDate('2024-03-15');
    });
    expect(result.current.filters.startDate).toBe('2024-03-15');
    expect(result.current.filteredObservations).toHaveLength(2);
  });

  it('setEndDate updates filters and derived list', () => {
    const { result } = renderHook(() => useObservationFilters(observations));
    act(() => {
      result.current.setEndDate('2024-03-15');
    });
    expect(result.current.filters.endDate).toBe('2024-03-15');
    expect(result.current.filteredObservations).toHaveLength(2);
  });

  it('setSort updates sort order', () => {
    const { result } = renderHook(() => useObservationFilters(observations));
    act(() => {
      result.current.setSort('oldest');
    });
    expect(result.current.filters.sort).toBe('oldest');
    expect(result.current.filteredObservations.map((o) => o.localId)).toEqual([
      '2',
      '1',
      '3',
    ]);
  });

  it('availableCategories stays constant after filtering (derived from full list)', () => {
    const { result } = renderHook(() => useObservationFilters(observations));
    const initialCategories = result.current.availableCategories;
    act(() => {
      result.current.setSearch('water');
    });
    expect(result.current.availableCategories).toEqual(initialCategories);
  });

  it('isFiltering is false initially', () => {
    const { result } = renderHook(() => useObservationFilters(observations));
    expect(result.current.isFiltering).toBe(false);
  });

  it('isFiltering flips true on any change', () => {
    const { result } = renderHook(() => useObservationFilters(observations));
    act(() => {
      result.current.setSearch('test');
    });
    expect(result.current.isFiltering).toBe(true);
  });

  it('isFiltering is unaffected by sort changes', () => {
    const { result } = renderHook(() => useObservationFilters(observations));
    expect(result.current.isFiltering).toBe(false);
    act(() => {
      result.current.setSort('oldest');
    });
    // Sort is not a filter — isFiltering should stay false
    expect(result.current.isFiltering).toBe(false);
  });

  it('reset restores defaults', () => {
    const { result } = renderHook(() => useObservationFilters(observations));
    act(() => {
      result.current.setSearch('test');
      result.current.toggleCategory('forest');
      result.current.setSort('oldest');
    });
    expect(result.current.isFiltering).toBe(true);

    act(() => {
      result.current.reset();
    });
    expect(result.current.filters).toEqual(DEFAULT_FILTERS);
    expect(result.current.isFiltering).toBe(false);
    expect(result.current.filteredObservations).toHaveLength(3);
  });

  it('resets filters when projectId changes', () => {
    const { result, rerender } = renderHook(
      ({ projectId }: { projectId: string }) =>
        useObservationFilters(observations, projectId),
      { initialProps: { projectId: 'proj-1' } },
    );

    act(() => {
      result.current.setSearch('test');
    });
    expect(result.current.isFiltering).toBe(true);

    // Change projectId → should reset
    rerender({ projectId: 'proj-2' });
    expect(result.current.filters).toEqual(DEFAULT_FILTERS);
    expect(result.current.isFiltering).toBe(false);
  });
});
