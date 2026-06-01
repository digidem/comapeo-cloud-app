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
  toggleCategory: (v: string) => void;
  setCategories: (v: string[]) => void;
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

  const toggleCategory = useCallback((v: string) => {
    setFilters((prev) => {
      const alreadySelected = prev.categories.includes(v);
      return {
        ...prev,
        categories: alreadySelected
          ? prev.categories.filter((c) => c !== v)
          : [...prev.categories, v],
      };
    });
  }, []);

  const setCategories = useCallback((v: string[]) => {
    setFilters((prev) => ({ ...prev, categories: v }));
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

  // isFiltering: any actual filter deviates from DEFAULT_FILTERS (sort is excluded
  // because changing sort order is not "filtering" — it doesn't affect which
  // observations appear, only their order)
  const isFiltering = useMemo(() => {
    return (
      filters.search !== DEFAULT_FILTERS.search ||
      filters.startDate !== DEFAULT_FILTERS.startDate ||
      filters.endDate !== DEFAULT_FILTERS.endDate ||
      filters.categories.length > 0
    );
  }, [filters]);

  return {
    filters,
    setSearch,
    setStartDate,
    setEndDate,
    toggleCategory,
    setCategories,
    setSort,
    reset,
    filteredObservations,
    availableCategories,
    isFiltering,
  };
}
