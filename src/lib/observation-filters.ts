import type { Observation } from '@/lib/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ObservationSort = 'newest' | 'oldest' | 'category';

export interface ObservationFilters {
  search: string;
  startDate: string | null;
  endDate: string | null;
  category: string | null;
  sort: ObservationSort;
}

export const DEFAULT_FILTERS: ObservationFilters = {
  search: '',
  startDate: null,
  endDate: null,
  category: null,
  sort: 'newest',
};

// ---------------------------------------------------------------------------
// extractCategories
// ---------------------------------------------------------------------------

/**
 * Returns distinct, sorted, non-empty `tags.category` values across all
 * observations. Sort is case-insensitive alphabetical.
 */
export function extractCategories(observations: Observation[]): string[] {
  const seen = new Set<string>();
  for (const obs of observations) {
    const cat = obs.tags?.category;
    if (cat && cat.trim() !== '') {
      seen.add(cat.trim());
    }
  }
  return Array.from(seen).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );
}

// ---------------------------------------------------------------------------
// filterObservations
// ---------------------------------------------------------------------------

function matchesSearch(obs: Observation, term: string): boolean {
  const tags = obs.tags ?? {};
  const lower = term.toLowerCase();
  for (const value of Object.values(tags)) {
    if (String(value).toLowerCase().includes(lower)) {
      return true;
    }
  }
  return false;
}

function matchesDateRange(
  obs: Observation,
  startDate: string | null,
  endDate: string | null,
): boolean {
  const obsDate = new Date(obs.createdAt);
  if (Number.isNaN(obsDate.getTime())) return false;

  if (startDate) {
    const start = new Date(startDate);
    start.setUTCHours(0, 0, 0, 0);
    if (obsDate < start) return false;
  }

  if (endDate) {
    const end = new Date(endDate);
    end.setUTCHours(23, 59, 59, 999);
    if (obsDate > end) return false;
  }

  return true;
}

function matchesCategory(obs: Observation, category: string | null): boolean {
  if (category === null) return true;
  return (obs.tags?.category?.trim() ?? null) === category;
}

function sortObservations(
  obs: Observation[],
  sort: ObservationSort,
): Observation[] {
  const sorted = [...obs];
  switch (sort) {
    case 'newest':
      sorted.sort((a, b) => {
        const da = new Date(a.createdAt).getTime();
        const db = new Date(b.createdAt).getTime();
        if (Number.isNaN(da) && Number.isNaN(db)) return 0;
        if (Number.isNaN(da)) return 1;
        if (Number.isNaN(db)) return -1;
        return db - da;
      });
      break;
    case 'oldest':
      sorted.sort((a, b) => {
        const da = new Date(a.createdAt).getTime();
        const db = new Date(b.createdAt).getTime();
        if (Number.isNaN(da) && Number.isNaN(db)) return 0;
        if (Number.isNaN(da)) return 1;
        if (Number.isNaN(db)) return -1;
        return da - db;
      });
      break;
    case 'category':
      sorted.sort((a, b) => {
        const catA = a.tags?.category ?? '';
        const catB = b.tags?.category ?? '';
        // Empty categories sort last
        if (catA === '' && catB !== '') return 1;
        if (catA !== '' && catB === '') return -1;
        const cmp = catA.localeCompare(catB, undefined, {
          sensitivity: 'base',
        });
        if (cmp !== 0) return cmp;
        // Secondary sort by createdAt desc
        const da = new Date(a.createdAt).getTime();
        const db = new Date(b.createdAt).getTime();
        if (Number.isNaN(da) && Number.isNaN(db)) return 0;
        if (Number.isNaN(da)) return 1;
        if (Number.isNaN(db)) return -1;
        return db - da;
      });
      break;
  }
  return sorted;
}

/**
 * Applies search, date range, and category filters, then sorts.
 * Pure function — does not mutate the input array.
 */
export function filterObservations(
  observations: Observation[],
  filters: ObservationFilters,
): Observation[] {
  let result = observations;

  // Search filter
  const term = filters.search.trim();
  if (term !== '') {
    result = result.filter((obs) => matchesSearch(obs, term));
  }

  // Date range filter
  if (filters.startDate || filters.endDate) {
    result = result.filter((obs) =>
      matchesDateRange(obs, filters.startDate, filters.endDate),
    );
  }

  // Category filter
  if (filters.category !== null) {
    result = result.filter((obs) => matchesCategory(obs, filters.category));
  }

  // Sort
  return sortObservations(result, filters.sort);
}
