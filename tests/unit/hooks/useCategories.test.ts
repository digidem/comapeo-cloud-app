import { describe, expect, it } from 'vitest';

import { normalizeCategories } from '@/hooks/useCategories';

const PRESETS_WITH_TYPES = [
  {
    docId: 'p1',
    name: 'Deforestation',
    tags: { type: 'environment', category: 'forest' },
    fieldRefs: [{ docId: 'f1' }],
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
    fieldRefs: [{ docId: 'f2' }],
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
    tags: {
      type: 'env',
      'name:en': 'Deforestation',
      'name:pt': 'Desmatamento',
    },
    fieldRefs: [],
  },
  {
    docId: 'p7',
    name: 'Water',
    tags: { type: 'env', 'name:en': 'Water', 'name:es': 'Agua' },
    fieldRefs: [],
  },
];

const PRESETS_WITH_DIACRITICS = [
  {
    docId: 'p8',
    name: 'Água',
    tags: { type: 'water', 'name:pt': 'Água' },
    fieldRefs: [],
  },
  {
    docId: 'p9',
    name: 'São Paulo',
    tags: { type: 'city', 'name:pt': 'São Paulo' },
    fieldRefs: [],
  },
  {
    docId: 'p10',
    name: 'Ação',
    tags: { type: 'action' },
    fieldRefs: [],
  },
];

const PRESETS_WITH_GEOMETRY = [
  {
    docId: 'g1',
    name: 'Point Category',
    tags: { type: 'test' },
    fieldRefs: [],
    geometry: ['point'],
  },
  {
    docId: 'g2',
    name: 'Line Category',
    tags: { type: 'test' },
    fieldRefs: [],
    geometry: ['line'],
  },
  {
    docId: 'g3',
    name: 'Point + Line Category',
    tags: { type: 'test' },
    fieldRefs: [],
    geometry: ['point', 'line'],
  },
  {
    docId: 'g4',
    name: 'Legacy Category',
    tags: { type: 'test' },
    fieldRefs: [],
    // no geometry — legacy preset
  },
  {
    docId: 'g5',
    name: 'Empty Geometry Category',
    tags: { type: 'test' },
    fieldRefs: [],
    geometry: [], // empty array — distinct from legacy (undefined)
  },
];

describe('normalizeCategories', () => {
  it('returns a flat list (no grouping) in original input order', () => {
    const result = normalizeCategories(PRESETS_WITH_TYPES, 'en', '');

    expect(result).toHaveLength(3);
    expect(result.map((c) => c.docId)).toEqual(['p1', 'p2', 'p3']);
  });

  it('preserves original input order (no alphabetical sort)', () => {
    const result = normalizeCategories(PRESETS_WITH_TYPES, 'en', '');

    expect(result.map((c) => c.label)).toEqual([
      'Deforestation',
      'Water Pollution',
      'Illegal Logging',
    ]);
  });

  it('resolves locale fallback (current locale → English → source value)', () => {
    const result = normalizeCategories(PRESETS_WITH_LOCALE, 'pt', '');

    expect(result).toHaveLength(2);
    const deforestation = result.find((c) => c.docId === 'p6');
    expect(deforestation!.label).toBe('Desmatamento');

    const water = result.find((c) => c.docId === 'p7');
    expect(water!.label).toBe('Water');
  });

  it('falls back to English when current locale not available', () => {
    const result = normalizeCategories(PRESETS_WITH_LOCALE, 'fr', '');

    const deforestation = result.find((c) => c.docId === 'p6');
    expect(deforestation!.label).toBe('Deforestation');
  });

  it('filters by search query (case insensitive)', () => {
    const result = normalizeCategories(
      PRESETS_WITH_TYPES,
      'en',
      'deforestation',
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.label).toBe('Deforestation');
  });

  it('filters by search query (diacritic insensitive)', () => {
    const result = normalizeCategories(
      PRESETS_WITH_LOCALE,
      'pt',
      'desmatamento',
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.label).toBe('Desmatamento');
  });

  it('searches across field labels via fieldLabels map', () => {
    const fieldLabels = new Map([['f1', 'Severity']]);
    const result = normalizeCategories(
      PRESETS_WITH_TYPES,
      'en',
      'severity',
      fieldLabels,
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.label).toBe('Deforestation');
  });

  it('includes presets without tags.type (no sentinel grouping)', () => {
    const result = normalizeCategories(PRESETS_WITHOUT_TYPES, 'en', '');

    expect(result).toHaveLength(2);
    expect(result.map((c) => c.docId)).toEqual(['p4', 'p5']);
  });

  it('resolves field ref docIds without label (flat fieldRefs)', () => {
    const result = normalizeCategories(PRESETS_WITH_TYPES, 'en', '');

    const deforestation = result.find((c) => c.docId === 'p1');
    expect(deforestation!.fieldRefs).toEqual([{ docId: 'f1' }]);
    // fieldRefs entries have only docId, no label property
    expect(deforestation!.fieldRefs[0]).not.toHaveProperty('label');
  });

  it('returns empty array for empty input', () => {
    const result = normalizeCategories([], 'en', '');
    expect(result).toEqual([]);
  });

  it('returns empty array when search matches nothing', () => {
    const result = normalizeCategories(PRESETS_WITH_TYPES, 'en', 'nonexistent');
    expect(result).toEqual([]);
  });

  it('matches accented names with unaccented search (real diacritics)', () => {
    const result = normalizeCategories(PRESETS_WITH_DIACRITICS, 'pt', 'agua');
    expect(result).toHaveLength(1);
    expect(result[0]!.label).toBe('Água');
  });

  it('matches multi-word accented names without accents', () => {
    const result = normalizeCategories(
      PRESETS_WITH_DIACRITICS,
      'pt',
      'sao paulo',
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.label).toBe('São Paulo');
  });

  it('matches plain name with accented search query', () => {
    const result = normalizeCategories(PRESETS_WITH_DIACRITICS, 'en', 'ação');
    expect(result).toHaveLength(1);
    expect(result[0]!.label).toBe('Ação');
  });

  it('passes top-level color through to category.color', () => {
    const presets = [
      {
        docId: 'c1',
        name: 'Colored',
        color: '#123456',
        tags: { type: 'test' },
        fieldRefs: [],
      },
    ];
    const result = normalizeCategories(presets as never, 'en', '');
    expect(result[0]!.color).toBe('#123456');
  });

  it('passes iconRef object through to category.iconRef', () => {
    const presets = [
      {
        docId: 'i1',
        name: 'With Icon',
        tags: { type: 'test' },
        fieldRefs: [],
        iconRef: { docId: 'icon-1' },
      },
    ];
    const result = normalizeCategories(presets as never, 'en', '');
    expect(result[0]!.iconRef).toEqual({ docId: 'icon-1' });
  });

  it('yields undefined iconRef for non-object iconRef (string)', () => {
    const presets = [
      {
        docId: 'i2',
        name: 'Bad Icon',
        tags: { type: 'test' },
        fieldRefs: [],
        iconRef: 'not-an-object',
      },
    ];
    const result = normalizeCategories(presets as never, 'en', '');
    expect(result[0]!.iconRef).toBeUndefined();
  });

  it('yields undefined iconRef for null iconRef', () => {
    const presets = [
      {
        docId: 'i3',
        name: 'Null Icon',
        tags: { type: 'test' },
        fieldRefs: [],
        iconRef: null,
      },
    ];
    const result = normalizeCategories(presets as never, 'en', '');
    expect(result[0]!.iconRef).toBeUndefined();
  });

  // ---- Geometry filtering ----

  it('includes presets whose geometry includes "point"', () => {
    const result = normalizeCategories(PRESETS_WITH_GEOMETRY, 'en', '');
    const docIds = result.map((c) => c.docId);
    expect(docIds).toContain('g1');
    expect(docIds).toContain('g3');
  });

  it('includes legacy presets with no geometry field', () => {
    const result = normalizeCategories(PRESETS_WITH_GEOMETRY, 'en', '');
    expect(result.map((c) => c.docId)).toContain('g4');
  });

  it('excludes presets whose geometry does not include "point"', () => {
    const result = normalizeCategories(PRESETS_WITH_GEOMETRY, 'en', '');
    expect(result.map((c) => c.docId)).not.toContain('g2');
  });

  it('sets geometry undefined for legacy presets (no geometry field)', () => {
    const result = normalizeCategories(PRESETS_WITH_GEOMETRY, 'en', '');
    const legacyCategory = result.find((c) => c.docId === 'g4');
    expect(legacyCategory!.geometry).toBeUndefined();
  });

  it('excludes presets with empty geometry array (not point-bearing)', () => {
    const result = normalizeCategories(PRESETS_WITH_GEOMETRY, 'en', '');
    expect(result.map((c) => c.docId)).not.toContain('g5');
  });
});
