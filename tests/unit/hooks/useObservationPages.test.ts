import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useObservationPages } from '@/hooks/useObservationPages';
import type { Observation } from '@/lib/db';

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

function makeObservations(count: number): Observation[] {
  return Array.from({ length: count }, (_, i) =>
    makeObs({
      localId: `obs-${i + 1}`,
      createdAt: `2024-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
    }),
  );
}

describe('useObservationPages', () => {
  describe('initial state', () => {
    it('returns page 1 on first render', () => {
      const obs = makeObservations(100);
      const { result } = renderHook(() =>
        useObservationPages(obs, { pageSize: 10 }),
      );

      expect(result.current.currentPage).toBe(1);
      expect(result.current.totalPages).toBe(10);
      expect(result.current.totalCount).toBe(100);
      expect(result.current.hasMore).toBe(true);
    });

    it('returns first page of observations', () => {
      const obs = makeObservations(100);
      const { result } = renderHook(() =>
        useObservationPages(obs, { pageSize: 10 }),
      );

      expect(result.current.paginatedObservations).toHaveLength(10);
      expect(result.current.paginatedObservations[0]!.localId).toBe('obs-1');
      expect(result.current.paginatedObservations[9]!.localId).toBe('obs-10');
    });

    it('hasMore is false when observations fit on one page', () => {
      const obs = makeObservations(5);
      const { result } = renderHook(() =>
        useObservationPages(obs, { pageSize: 10 }),
      );

      expect(result.current.hasMore).toBe(false);
      expect(result.current.totalPages).toBe(1);
    });
  });

  describe('loadMore', () => {
    it('increments page and appends observations', () => {
      const obs = makeObservations(30);
      const { result } = renderHook(() =>
        useObservationPages(obs, { pageSize: 10 }),
      );

      // Page 1: 10 items
      expect(result.current.currentPage).toBe(1);
      expect(result.current.paginatedObservations).toHaveLength(10);

      act(() => {
        result.current.loadMore();
      });

      // Page 2: 20 items total
      expect(result.current.currentPage).toBe(2);
      expect(result.current.paginatedObservations).toHaveLength(20);
      expect(result.current.paginatedObservations[0]!.localId).toBe('obs-1');
      expect(result.current.paginatedObservations[10]!.localId).toBe('obs-11');
    });

    it('loadMore does nothing when hasMore is false', () => {
      const obs = makeObservations(5);
      const { result } = renderHook(() =>
        useObservationPages(obs, { pageSize: 10 }),
      );

      expect(result.current.hasMore).toBe(false);

      act(() => {
        result.current.loadMore();
      });

      expect(result.current.currentPage).toBe(1);
      expect(result.current.paginatedObservations).toHaveLength(5);
    });
  });

  describe('reset', () => {
    it('resets to page 1', () => {
      const obs = makeObservations(30);
      const { result } = renderHook(() =>
        useObservationPages(obs, { pageSize: 10 }),
      );

      act(() => {
        result.current.loadMore();
        result.current.loadMore();
      });

      expect(result.current.currentPage).toBe(3);
      expect(result.current.paginatedObservations).toHaveLength(30);

      act(() => {
        result.current.reset();
      });

      expect(result.current.currentPage).toBe(1);
      expect(result.current.paginatedObservations).toHaveLength(10);
    });
  });

  describe('auto-reset on dependency change', () => {
    it('resets to page 1 when deps change', async () => {
      const obs = makeObservations(30);
      const { result, rerender } = renderHook(
        ({ deps }: { deps: unknown[] }) =>
          useObservationPages(obs, { pageSize: 10, deps }),
        { initialProps: { deps: ['filter-1'] } },
      );

      act(() => {
        result.current.loadMore();
      });
      expect(result.current.currentPage).toBe(2);

      // Change deps → should auto-reset
      rerender({ deps: ['filter-2'] });
      await waitFor(() => {
        expect(result.current.currentPage).toBe(1);
      });
      expect(result.current.paginatedObservations).toHaveLength(10);
    });

    it('does not reset when deps do not change', () => {
      const obs = makeObservations(30);
      const { result, rerender } = renderHook(
        ({ deps }: { deps: unknown[] }) =>
          useObservationPages(obs, { pageSize: 10, deps }),
        { initialProps: { deps: ['filter-1'] } },
      );

      act(() => {
        result.current.loadMore();
      });
      expect(result.current.currentPage).toBe(2);

      // Same deps → should NOT reset
      rerender({ deps: ['filter-1'] });
      expect(result.current.currentPage).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('handles empty observations array', () => {
      const { result } = renderHook(() =>
        useObservationPages([], { pageSize: 10 }),
      );

      expect(result.current.paginatedObservations).toHaveLength(0);
      expect(result.current.currentPage).toBe(1);
      expect(result.current.totalPages).toBe(0);
      expect(result.current.totalCount).toBe(0);
      expect(result.current.hasMore).toBe(false);
    });

    it('handles exact page boundary', () => {
      const obs = makeObservations(10);
      const { result } = renderHook(() =>
        useObservationPages(obs, { pageSize: 10 }),
      );

      expect(result.current.paginatedObservations).toHaveLength(10);
      expect(result.current.totalPages).toBe(1);
      expect(result.current.hasMore).toBe(false);
    });

    it('handles pageSize larger than total', () => {
      const obs = makeObservations(3);
      const { result } = renderHook(() =>
        useObservationPages(obs, { pageSize: 10 }),
      );

      expect(result.current.paginatedObservations).toHaveLength(3);
      expect(result.current.totalPages).toBe(1);
      expect(result.current.hasMore).toBe(false);
    });

    it('handles last page with partial items', () => {
      const obs = makeObservations(25);
      const { result } = renderHook(() =>
        useObservationPages(obs, { pageSize: 10 }),
      );

      act(() => {
        result.current.loadMore();
      });
      expect(result.current.currentPage).toBe(2);
      expect(result.current.paginatedObservations).toHaveLength(20);

      act(() => {
        result.current.loadMore();
      });
      expect(result.current.currentPage).toBe(3);
      expect(result.current.paginatedObservations).toHaveLength(25);
      expect(result.current.hasMore).toBe(false);
    });

    it('returns correct showing range text data', () => {
      const obs = makeObservations(55);
      const { result } = renderHook(() =>
        useObservationPages(obs, { pageSize: 20 }),
      );

      // Page 1: showing 1–20 of 55
      expect(result.current.showingStart).toBe(1);
      expect(result.current.showingEnd).toBe(20);
      expect(result.current.totalCount).toBe(55);

      act(() => {
        result.current.loadMore();
      });

      // Page 2: showing 1–40 of 55
      expect(result.current.showingStart).toBe(1);
      expect(result.current.showingEnd).toBe(40);

      act(() => {
        result.current.loadMore();
      });

      // Page 3: showing 1–55 of 55
      expect(result.current.showingStart).toBe(1);
      expect(result.current.showingEnd).toBe(55);
      expect(result.current.hasMore).toBe(false);
    });

    it('handles zero pageSize gracefully', () => {
      const obs = makeObservations(5);
      const { result } = renderHook(() =>
        useObservationPages(obs, { pageSize: 0 }),
      );

      // Should default to something sensible — all items shown
      expect(result.current.paginatedObservations).toHaveLength(5);
    });
  });
});
