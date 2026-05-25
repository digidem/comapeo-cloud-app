import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Observation } from '@/lib/db';

export interface UseObservationPagesOptions {
  /** Number of observations per page. Default 50. */
  pageSize?: number;
  /**
   * Dependency array that triggers an auto-reset to page 1 when changed.
   * Use this to reset pagination when filters change (e.g., search query,
   * category, date range).
   */
  deps?: unknown[];
}

export interface UseObservationPagesResult {
  /** Observations for the current cumulative set of pages (all loaded so far). */
  paginatedObservations: Observation[];
  /** Current page (1-indexed). */
  currentPage: number;
  /** Total number of pages based on full dataset and pageSize. */
  totalPages: number;
  /** Total number of observations in the full dataset. */
  totalCount: number;
  /** Whether there are more observations to load. */
  hasMore: boolean;
  /** Load the next page (appends to paginatedObservations). */
  loadMore: () => void;
  /** Reset back to page 1. */
  reset: () => void;
  /** 1-indexed start of the currently shown range. */
  showingStart: number;
  /** End of the currently shown range. */
  showingEnd: number;
}

/**
 * Manages client-side pagination for a list of observations.
 * Uses a "load more" pattern: each call to `loadMore()` appends the next page.
 *
 * The `deps` option enables auto-reset: when any value in `deps` changes
 * (by shallow comparison of primitive values), the page resets to 1.
 * This is perfect for resetting pagination when filters change.
 */
export function useObservationPages(
  observations: Observation[],
  options: UseObservationPagesOptions = {},
): UseObservationPagesResult {
  const { pageSize = 50, deps = [] } = options;
  const safePageSize =
    pageSize > 0 ? pageSize : Math.max(observations.length, 1);

  const [currentPage, setCurrentPage] = useState(1);

  // Track deps to detect changes and auto-reset.
  // Uses shallow comparison of deps values (primitives) instead of
  // JSON.stringify to avoid wasteful serialization on every render.
  const prevDepsRef = useRef(deps);

  useEffect(() => {
    const prev = prevDepsRef.current;
    const changed =
      prev.length !== deps.length ||
      deps.some((dep, i) => !Object.is(dep, prev[i]));

    if (changed) {
      prevDepsRef.current = deps;
      setCurrentPage(1);
    }
  }, [deps]);

  const totalCount = observations.length;
  const totalPages = Math.ceil(totalCount / safePageSize);

  const paginatedObservations = useMemo(() => {
    const endIndex = Math.min(currentPage * safePageSize, totalCount);
    return observations.slice(0, endIndex);
  }, [observations, currentPage, safePageSize, totalCount]);

  const hasMore = currentPage < totalPages;

  const showingStart = totalCount > 0 ? 1 : 0;
  const showingEnd = Math.min(currentPage * safePageSize, totalCount);

  const loadMore = useCallback(() => {
    if (hasMore) {
      setCurrentPage((prev) => prev + 1);
    }
  }, [hasMore]);

  const reset = useCallback(() => {
    setCurrentPage(1);
  }, []);

  return {
    paginatedObservations,
    currentPage,
    totalPages,
    totalCount,
    hasMore,
    loadMore,
    reset,
    showingStart,
    showingEnd,
  };
}
