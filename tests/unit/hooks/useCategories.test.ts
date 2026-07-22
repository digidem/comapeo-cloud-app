import { describe, expect, it } from 'vitest';

import { normalizeCategories } from '@/hooks/useCategories';

const PRESETS_WITH_TYPES = [
  {
    docId: 'p1',
    name: 'Deforestation',
    tags: { type: 'environment', category: 'forest' },
    fieldRefs: [{ docId: 'f1', label: 'Severity' }],
  },
  {
    docId: 'p2',
    name: 'Water Pollution',
    tags: { type: 'water', category: 'pollution' },
    fieldRefs: [],
  },
  {
    docId: 'p3',
    name: 'Illegal Logging',
    tags: { type: 'environment', category: 'forest' },
    fieldRefs: [{ docId: 'f2', label: 'Area' }],
  },
];

const PRESETS_WITHOUT_TYPES = [
  {
    docId: 'p4',
    name: 'Mystery Sighting',
    tags: {},
    fieldRefs: [],
  },
  {
    docId: 'p5',
    name: 'Unknown Event',
    tags: { type: '' },
    fieldRefs: [],
  },
];

const PRESETS_WITH_LOCALE = [
  {
    docId: 'p6',
    name: 'Deforestation',
    tags: { type: 'env', 'name:en': 'Deforestation', 'name:pt': 'Desmatamento' },
    fieldRefs: [],
  },
  {
    docId: 'p7',
    name: 'Water',
    tags: { type: 'env', 'name:en': 'Water', 'name:es': 'Agua' },
    fieldRefs: [],
  },
];

describe('normalizeCategories', () => {
  it('groups presets by tags.type', () => {
    const result = normalizeCategories(PRESETS_WITH_TYPES, 'en', '');

    expect(result).toHaveLength(2);
    const envGroup = result.find((g) => g.type === 'environment');
    const waterGroup = result.find((g) => g.type === 'water');

    expect(envGroup).toBeDefined();
    expect(envGroup!.categories).toHaveLength(2);
    expect(waterGroup).toBeDefined();
    expect(waterGroup!.categories).toHaveLength(1);
  });

  it('resolves locale fallback (current locale → English → source value)', () => {
    const result = normalizeCategories(PRESETS_WITH_LOCALE, 'pt', '');

    const envGroup = result.find((g) => g.type === 'env');
    expect(envGroup).toBeDefined();

    const deforestation = envGroup!.categories.find(
      (c) => c.docId === 'p6',
    );
    expect(deforestation!.label).toBe('Desmatamento');

    const water = envGroup!.categories.find((c) => c.docId === 'p7');
    expect(water!.label).toBe('Water');
  });

  it('falls back to English when current locale not available', () => {
    const result = normalizeCategories(PRESETS_WITH_LOCALE, 'fr', '');

    const envGroup = result.find((g) => g.type === 'env');
    expect(envGroup).toBeDefined();

    const deforestation = envGroup!.categories.find(
      (c) => c.docId === 'p6',
    );
    expect(deforestation!.label).toBe('Deforestation');
  });

  it('filters by search query (case insensitive)', () => {
    const result = normalizeCategories(PRESETS_WITH_TYPES, 'en', 'deforestation');

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('environment');
    expect(result[0]!.categories).toHaveLength(1);
    expect(result[0]!.categories[0]!.label).toBe('Deforestation');
  });

  it('filters by search query (diacritic insensitive)', () => {
    const result = normalizeCategories(PRESETS_WITH_LOCALE, 'pt', 'desmatamento');

    expect(result).toHaveLength(1);
    expect(result[0]!.categories[0]!.label).toBe('Desmatamento');
  });

  it('searches across field labels', () => {
    const result = normalizeCategories(PRESETS_WITH_TYPES, 'en', 'severity');

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('environment');
    expect(result[0]!.categories).toHaveLength(1);
    expect(result[0]!.categories[0]!.label).toBe('Deforestation');
  });

  it('assigns "Uncategorized" group for missing tags.type', () => {
    const result = normalizeCategories(PRESETS_WITHOUT_TYPES, 'en', '');

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('Uncategorized');
    expect(result[0]!.categories).toHaveLength(2);
  });

  it('assigns "Uncategorized" group for blank tags.type', () => {
    const result = normalizeCategories(
      [{ docId: 'p8', name: 'Test', tags: { type: '' }, fieldRefs: [] }],
      'en',
      '',
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('Uncategorized');
  });

  it('returns stable alphabetical ordering within groups', () => {
    const result = normalizeCategories(PRESETS_WITH_TYPES, 'en', '');

    const envGroup = result.find((g) => g.type === 'environment');
    expect(envGroup!.categories[0]!.label).toBe('Deforestation');
    expect(envGroup!.categories[1]!.label).toBe('Illegal Logging');
  });

  it('returns stable alphabetical ordering of groups', () => {
    const result = normalizeCategories(PRESETS_WITH_TYPES, 'en', '');

    expect(result[0]!.type).toBe('environment');
    expect(result[1]!.type).toBe('water');
  });

  it('returns empty array for empty input', () => {
    const result = normalizeCategories([], 'en', '');
    expect(result).toEqual([]);
  });

  it('returns empty groups when search matches nothing', () => {
    const result = normalizeCategories(PRESETS_WITH_TYPES, 'en', 'nonexistent');
    expect(result).toEqual([]);
  });
});
