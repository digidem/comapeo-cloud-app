import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Observation } from '@/lib/db';
import {
  DEFAULT_FILTERS,
  type ObservationFilters,
  type ObservationSort,
  extractCategories,
  filterObservations,
} from '@/lib/observation-filters';

export interface UseObservationFiltersResult {
  filters: ObservationFilters;
  setSearch: (v: string) => void;
  setStartDate: (v: string | null) => void;
  setEndDate: (v: string | null) => void;
  setCategory: (v: string | null) => void;
  setSort: (v: ObservationSort) => void;
  reset: () => void;
  filteredObservations: Observation[];
  availableCategories: string[];
  isFiltering: boolean;
}

export function useObservationFilters(
  observations: Observation[],
  projectId?: string,
): UseObservationFiltersResult {
  const [filters, setFilters] = useState<ObservationFilters>(DEFAULT_FILTERS);
  const prevProjectIdRef = useRef(projectId);

  // Reset filters when projectId changes
  useEffect(() => {
    if (projectId !== prevProjectIdRef.current) {
      prevProjectIdRef.current = projectId;
      setFilters(DEFAULT_FILTERS);
    }
  }, [projectId]);

  const setSearch = useCallback((v: string) => {
    setFilters((prev) => ({ ...prev, search: v }));
  }, []);

  const setStartDate = useCallback((v: string | null) => {
    setFilters((prev) => ({ ...prev, startDate: v }));
  }, []);

  const setEndDate = useCallback((v: string | null) => {
    setFilters((prev) => ({ ...prev, endDate: v }));
  }, []);

  const setCategory = useCallback((v: string | null) => {
    setFilters((prev) => ({ ...prev, category: v }));
  }, []);

  const setSort = useCallback((v: ObservationSort) => {
    setFilters((prev) => ({ ...prev, sort: v }));
  }, []);

  const reset = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  // availableCategories from the FULL (unfiltered) list
  const availableCategories = useMemo(
    () => extractCategories(observations),
    [observations],
  );

  // filteredObservations: apply filters + sort
  const filteredObservations = useMemo(
    () => filterObservations(observations, filters),
    [observations, filters],
  );

  // isFiltering: any filter deviates from DEFAULT_FILTERS
  const isFiltering = useMemo(() => {
    return (
      filters.search !== DEFAULT_FILTERS.search ||
      filters.startDate !== DEFAULT_FILTERS.startDate ||
      filters.endDate !== DEFAULT_FILTERS.endDate ||
      filters.category !== DEFAULT_FILTERS.category ||
      filters.sort !== DEFAULT_FILTERS.sort
    );
  }, [filters]);

  return {
    filters,
    setSearch,
    setStartDate,
    setEndDate,
    setCategory,
    setSort,
    reset,
    filteredObservations,
    availableCategories,
    isFiltering,
  };
}
