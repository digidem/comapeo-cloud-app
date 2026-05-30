import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { usePaginatedItems } from '@/hooks/usePaginatedItems';
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

// Simple non-Observation type for generic typing tests
interface TestItem {
  id: string;
  label: string;
}

function makeTestItems(count: number): TestItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i + 1}`,
    label: `Item ${i + 1}`,
  }));
}

describe('usePaginatedItems', () => {
  describe('initial state', () => {
    it('returns page 1 on first render', () => {
      const obs = makeObservations(100);
      const { result } = renderHook(() =>
        usePaginatedItems(obs, { pageSize: 10 }),
      );

      expect(result.current.currentPage).toBe(1);
      expect(result.current.totalPages).toBe(10);
      expect(result.current.totalCount).toBe(100);
      expect(result.current.hasMore).toBe(true);
    });

    it('returns first page of observations', () => {
      const obs = makeObservations(100);
      const { result } = renderHook(() =>
        usePaginatedItems(obs, { pageSize: 10 }),
      );

      expect(result.current.paginatedItems).toHaveLength(10);
      expect(result.current.paginatedItems[0]!.localId).toBe('obs-1');
      expect(result.current.paginatedItems[9]!.localId).toBe('obs-10');
    });

    it('hasMore is false when observations fit on one page', () => {
      const obs = makeObservations(5);
      const { result } = renderHook(() =>
        usePaginatedItems(obs, { pageSize: 10 }),
      );

      expect(result.current.hasMore).toBe(false);
      expect(result.current.totalPages).toBe(1);
    });
  });

  describe('loadMore', () => {
    it('increments page and appends observations', () => {
      const obs = makeObservations(30);
      const { result } = renderHook(() =>
        usePaginatedItems(obs, { pageSize: 10 }),
      );

      // Page 1: 10 items
      expect(result.current.currentPage).toBe(1);
      expect(result.current.paginatedItems).toHaveLength(10);

      act(() => {
        result.current.loadMore();
      });

      // Page 2: 20 items total
      expect(result.current.currentPage).toBe(2);
      expect(result.current.paginatedItems).toHaveLength(20);
      expect(result.current.paginatedItems[0]!.localId).toBe('obs-1');
      expect(result.current.paginatedItems[10]!.localId).toBe('obs-11');
    });

    it('loadMore does nothing when hasMore is false', () => {
      const obs = makeObservations(5);
      const { result } = renderHook(() =>
        usePaginatedItems(obs, { pageSize: 10 }),
      );

      expect(result.current.hasMore).toBe(false);

      act(() => {
        result.current.loadMore();
      });

      expect(result.current.currentPage).toBe(1);
      expect(result.current.paginatedItems).toHaveLength(5);
    });
  });

  describe('reset', () => {
    it('resets to page 1', () => {
      const obs = makeObservations(30);
      const { result } = renderHook(() =>
        usePaginatedItems(obs, { pageSize: 10 }),
      );

      act(() => {
        result.current.loadMore();
        result.current.loadMore();
      });

      expect(result.current.currentPage).toBe(3);
      expect(result.current.paginatedItems).toHaveLength(30);

      act(() => {
        result.current.reset();
      });

      expect(result.current.currentPage).toBe(1);
      expect(result.current.paginatedItems).toHaveLength(10);
    });
  });

  describe('auto-reset on dependency change', () => {
    it('resets to page 1 when deps change', async () => {
      const obs = makeObservations(30);
      const { result, rerender } = renderHook(
        ({ deps }: { deps: unknown[] }) =>
          usePaginatedItems(obs, { pageSize: 10, deps }),
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
      expect(result.current.paginatedItems).toHaveLength(10);
    });

    it('does not reset when deps do not change', () => {
      const obs = makeObservations(30);
      const { result, rerender } = renderHook(
        ({ deps }: { deps: unknown[] }) =>
          usePaginatedItems(obs, { pageSize: 10, deps }),
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
        usePaginatedItems([], { pageSize: 10 }),
      );

      expect(result.current.paginatedItems).toHaveLength(0);
      expect(result.current.currentPage).toBe(1);
      expect(result.current.totalPages).toBe(0);
      expect(result.current.totalCount).toBe(0);
      expect(result.current.hasMore).toBe(false);
    });

    it('handles exact page boundary', () => {
      const obs = makeObservations(10);
      const { result } = renderHook(() =>
        usePaginatedItems(obs, { pageSize: 10 }),
      );

      expect(result.current.paginatedItems).toHaveLength(10);
      expect(result.current.totalPages).toBe(1);
      expect(result.current.hasMore).toBe(false);
    });

    it('handles pageSize larger than total', () => {
      const obs = makeObservations(3);
      const { result } = renderHook(() =>
        usePaginatedItems(obs, { pageSize: 10 }),
      );

      expect(result.current.paginatedItems).toHaveLength(3);
      expect(result.current.totalPages).toBe(1);
      expect(result.current.hasMore).toBe(false);
    });

    it('handles last page with partial items', () => {
      const obs = makeObservations(25);
      const { result } = renderHook(() =>
        usePaginatedItems(obs, { pageSize: 10 }),
      );

      act(() => {
        result.current.loadMore();
      });
      expect(result.current.currentPage).toBe(2);
      expect(result.current.paginatedItems).toHaveLength(20);

      act(() => {
        result.current.loadMore();
      });
      expect(result.current.currentPage).toBe(3);
      expect(result.current.paginatedItems).toHaveLength(25);
      expect(result.current.hasMore).toBe(false);
    });

    it('returns correct showing range text data', () => {
      const obs = makeObservations(55);
      const { result } = renderHook(() =>
        usePaginatedItems(obs, { pageSize: 20 }),
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
        usePaginatedItems(obs, { pageSize: 0 }),
      );

      // Should default to something sensible — all items shown
      expect(result.current.paginatedItems).toHaveLength(5);
    });
  });

  describe('generic typing', () => {
    it('works with non-Observation types', () => {
      const items = makeTestItems(8);
      const { result } = renderHook(() =>
        usePaginatedItems(items, { pageSize: 3 }),
      );

      // First page: 3 items
      expect(result.current.paginatedItems).toHaveLength(3);
      expect(result.current.paginatedItems[0]!.label).toBe('Item 1');
      expect(result.current.paginatedItems[2]!.label).toBe('Item 3');
      expect(result.current.hasMore).toBe(true);
      expect(result.current.totalPages).toBe(3);

      act(() => {
        result.current.loadMore();
      });

      // Second page: 6 items
      expect(result.current.paginatedItems).toHaveLength(6);
      expect(result.current.paginatedItems[3]!.label).toBe('Item 4');

      act(() => {
        result.current.loadMore();
      });

      // Third page: all 8 items, no more
      expect(result.current.paginatedItems).toHaveLength(8);
      expect(result.current.hasMore).toBe(false);
    });

    it('returns correct types for string arrays', () => {
      const items = ['a', 'b', 'c', 'd', 'e'];
      const { result } = renderHook(() =>
        usePaginatedItems(items, { pageSize: 2 }),
      );

      expect(result.current.paginatedItems).toEqual(['a', 'b']);
    });
  });
});
