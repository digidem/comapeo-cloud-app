import { describe, expect, it } from 'vitest';

import type { Observation } from '@/lib/db';
import {
  DEFAULT_FILTERS,
  extractCategories,
  filterObservations,
} from '@/lib/observation-filters';

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

// --- extractCategories ---

describe('extractCategories', () => {
  it('returns empty array for empty input', () => {
    expect(extractCategories([])).toEqual([]);
  });

  it('returns sorted distinct non-empty category values', () => {
    const observations = [
      makeObs({ localId: '1', tags: { category: 'forest' } }),
      makeObs({ localId: '2', tags: { category: 'water' } }),
      makeObs({ localId: '3', tags: { category: 'forest' } }),
    ];
    expect(extractCategories(observations)).toEqual(['forest', 'water']);
  });

  it('drops observations with no tags.category', () => {
    const observations = [
      makeObs({ localId: '1', tags: { notes: 'something' } }),
      makeObs({ localId: '2' }), // no tags at all
    ];
    expect(extractCategories(observations)).toEqual([]);
  });

  it('drops empty-string category values', () => {
    const observations = [
      makeObs({ localId: '1', tags: { category: '' } }),
      makeObs({ localId: '2', tags: { category: 'forest' } }),
    ];
    expect(extractCategories(observations)).toEqual(['forest']);
  });

  it('sorts case-insensitively', () => {
    const observations = [
      makeObs({ localId: '1', tags: { category: 'Zebra' } }),
      makeObs({ localId: '2', tags: { category: 'apple' } }),
      makeObs({ localId: '3', tags: { category: 'Banana' } }),
    ];
    expect(extractCategories(observations)).toEqual([
      'apple',
      'Banana',
      'Zebra',
    ]);
  });
});

// --- filterObservations: search ---

describe('filterObservations — search', () => {
  const observations = [
    makeObs({
      localId: '1',
      tags: { category: 'forest', notes: 'Deforestation detected' },
    }),
    makeObs({
      localId: '2',
      tags: { category: 'water', notes: 'Water quality test' },
    }),
    makeObs({
      localId: '3',
      tags: { notes: 'No category here', customField: 'special value' },
    }),
    makeObs({ localId: '4' }), // no tags
  ];

  it('returns all observations when search is empty', () => {
    const result = filterObservations(observations, {
      ...DEFAULT_FILTERS,
      search: '',
    });
    expect(result).toHaveLength(4);
  });

  it('returns all observations when search is whitespace only', () => {
    const result = filterObservations(observations, {
      ...DEFAULT_FILTERS,
      search: '   ',
    });
    expect(result).toHaveLength(4);
  });

  it('matches case-insensitively on category', () => {
    const result = filterObservations(observations, {
      ...DEFAULT_FILTERS,
      search: 'FOREST',
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.localId).toBe('1');
  });

  it('matches on notes', () => {
    const result = filterObservations(observations, {
      ...DEFAULT_FILTERS,
      search: 'quality',
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.localId).toBe('2');
  });

  it('matches on arbitrary tag values', () => {
    const result = filterObservations(observations, {
      ...DEFAULT_FILTERS,
      search: 'special',
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.localId).toBe('3');
  });

  it('trims search term', () => {
    const result = filterObservations(observations, {
      ...DEFAULT_FILTERS,
      search: '  forest  ',
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.localId).toBe('1');
  });

  it('returns empty when nothing matches', () => {
    const result = filterObservations(observations, {
      ...DEFAULT_FILTERS,
      search: 'nonexistent',
    });
    expect(result).toHaveLength(0);
  });
});

// --- filterObservations: date range ---

describe('filterObservations — date range', () => {
  const observations = [
    makeObs({ localId: '1', createdAt: '2024-03-15T10:30:00Z' }),
    makeObs({ localId: '2', createdAt: '2024-03-14T08:00:00Z' }),
    makeObs({ localId: '3', createdAt: '2024-03-16T23:59:59Z' }),
  ];

  it('filters by startDate only (inclusive)', () => {
    const result = filterObservations(observations, {
      ...DEFAULT_FILTERS,
      startDate: '2024-03-15',
    });
    expect(result).toHaveLength(2);
    expect(result.map((o) => o.localId).sort()).toEqual(['1', '3']);
  });

  it('filters by endDate only (inclusive)', () => {
    const result = filterObservations(observations, {
      ...DEFAULT_FILTERS,
      endDate: '2024-03-15',
    });
    expect(result).toHaveLength(2);
    expect(result.map((o) => o.localId).sort()).toEqual(['1', '2']);
  });

  it('filters by both start and end date (inclusive)', () => {
    const result = filterObservations(observations, {
      ...DEFAULT_FILTERS,
      startDate: '2024-03-14',
      endDate: '2024-03-15',
    });
    expect(result).toHaveLength(2);
    expect(result.map((o) => o.localId).sort()).toEqual(['1', '2']);
  });

  it('returns empty when date range excludes all', () => {
    const result = filterObservations(observations, {
      ...DEFAULT_FILTERS,
      startDate: '2024-04-01',
      endDate: '2024-04-30',
    });
    expect(result).toHaveLength(0);
  });

  it('includes observation exactly on endDate boundary', () => {
    const result = filterObservations(observations, {
      ...DEFAULT_FILTERS,
      endDate: '2024-03-16',
    });
    expect(result).toHaveLength(3);
  });

  it('startDate after endDate yields empty set', () => {
    const result = filterObservations(observations, {
      ...DEFAULT_FILTERS,
      startDate: '2024-03-16',
      endDate: '2024-03-14',
    });
    expect(result).toHaveLength(0);
  });
});

// --- filterObservations: category ---

describe('filterObservations — category', () => {
  const observations = [
    makeObs({ localId: '1', tags: { category: 'forest' } }),
    makeObs({ localId: '2', tags: { category: 'water' } }),
    makeObs({ localId: '3', tags: { notes: 'no category' } }),
  ];

  it('returns all when categories array is empty', () => {
    const result = filterObservations(observations, {
      ...DEFAULT_FILTERS,
      categories: [],
    });
    expect(result).toHaveLength(3);
  });

  it('filters by single category match', () => {
    const result = filterObservations(observations, {
      ...DEFAULT_FILTERS,
      categories: ['forest'],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.localId).toBe('1');
  });

  it('filters by multiple categories (OR logic)', () => {
    const result = filterObservations(observations, {
      ...DEFAULT_FILTERS,
      categories: ['forest', 'water'],
    });
    expect(result).toHaveLength(2);
    expect(result.map((o) => o.localId).sort()).toEqual(['1', '2']);
  });

  it('returns empty when no observation matches any selected category', () => {
    const result = filterObservations(observations, {
      ...DEFAULT_FILTERS,
      categories: ['nonexistent'],
    });
    expect(result).toHaveLength(0);
  });

  it('excludes observations without tags when filtering by categories', () => {
    const result = filterObservations(observations, {
      ...DEFAULT_FILTERS,
      categories: ['water'],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.localId).toBe('2');
  });

  it('matches even when observation category has whitespace padding', () => {
    const obs = [
      makeObs({ localId: '1', tags: { category: '  forest  ' } }),
      makeObs({ localId: '2', tags: { category: 'forest' } }),
    ];
    // Both should match the trimmed category value 'forest'
    const result = filterObservations(obs, {
      ...DEFAULT_FILTERS,
      categories: ['forest'],
    });
    expect(result).toHaveLength(2);
    expect(result.map((o) => o.localId).sort()).toEqual(['1', '2']);
  });
});

// --- filterObservations: sort ---

describe('filterObservations — sort', () => {
  const observations = [
    makeObs({
      localId: '1',
      createdAt: '2024-03-15T10:00:00Z',
      tags: { category: 'forest' },
    }),
    makeObs({
      localId: '2',
      createdAt: '2024-03-16T10:00:00Z',
      tags: { category: 'water' },
    }),
    makeObs({
      localId: '3',
      createdAt: '2024-03-14T10:00:00Z',
      tags: { category: 'animal' },
    }),
  ];

  it('sorts by newest first (default)', () => {
    const result = filterObservations(observations, {
      ...DEFAULT_FILTERS,
      sort: 'newest',
    });
    expect(result.map((o) => o.localId)).toEqual(['2', '1', '3']);
  });

  it('sorts by oldest first', () => {
    const result = filterObservations(observations, {
      ...DEFAULT_FILTERS,
      sort: 'oldest',
    });
    expect(result.map((o) => o.localId)).toEqual(['3', '1', '2']);
  });

  it('sorts by category alphabetically (case-insensitive)', () => {
    const result = filterObservations(observations, {
      ...DEFAULT_FILTERS,
      sort: 'category',
    });
    expect(result.map((o) => o.localId)).toEqual(['3', '1', '2']);
  });

  it('category sort uses createdAt desc as tiebreaker', () => {
    const tied = [
      makeObs({
        localId: '1',
        createdAt: '2024-03-15T10:00:00Z',
        tags: { category: 'forest' },
      }),
      makeObs({
        localId: '2',
        createdAt: '2024-03-16T10:00:00Z',
        tags: { category: 'forest' },
      }),
    ];
    const result = filterObservations(tied, {
      ...DEFAULT_FILTERS,
      sort: 'category',
    });
    // Same category → secondary sort by createdAt desc
    expect(result.map((o) => o.localId)).toEqual(['2', '1']);
  });

  it('category sort places empty-category observations last', () => {
    const mixed = [
      makeObs({
        localId: '1',
        createdAt: '2024-03-15T10:00:00Z',
        tags: { category: 'forest' },
      }),
      makeObs({
        localId: '2',
        createdAt: '2024-03-16T10:00:00Z',
        tags: { notes: 'no cat' },
      }),
      makeObs({
        localId: '3',
        createdAt: '2024-03-14T10:00:00Z',
        tags: { category: 'animal' },
      }),
    ];
    const result = filterObservations(mixed, {
      ...DEFAULT_FILTERS,
      sort: 'category',
    });
    // 'animal' < 'forest' < '' (empty sorts last)
    expect(result.map((o) => o.localId)).toEqual(['3', '1', '2']);
  });
});

// --- filterObservations: combined filters ---

describe('filterObservations — combined filters', () => {
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

  it('search + category combined', () => {
    const result = filterObservations(observations, {
      ...DEFAULT_FILTERS,
      search: 'deforestation',
      categories: ['forest'],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.localId).toBe('1');
  });

  it('search + date range + category combined', () => {
    const result = filterObservations(observations, {
      ...DEFAULT_FILTERS,
      search: 'deforestation',
      startDate: '2024-03-15',
      endDate: '2024-03-16',
      categories: ['forest'],
    });
    // obs-1 matches search ("Deforestation"), date, and category
    // obs-3 matches date and category but not search ("Reforestation effort" does not contain "deforestation")
    expect(result).toHaveLength(1);
    expect(result[0]!.localId).toBe('1');
  });
});

// --- filterObservations: no mutation ---

describe('filterObservations — immutability', () => {
  it('does not mutate the input array', () => {
    const original = [
      makeObs({ localId: '1', tags: { category: 'forest' } }),
      makeObs({ localId: '2', tags: { category: 'water' } }),
    ];
    const copy = [...original];
    filterObservations(original, { ...DEFAULT_FILTERS, search: 'forest' });
    expect(original).toEqual(copy);
    expect(original).toHaveLength(2);
  });
});
