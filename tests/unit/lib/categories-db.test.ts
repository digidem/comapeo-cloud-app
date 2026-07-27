import { beforeEach, describe, expect, it } from 'vitest';

import {
  categoriesDb,
  getCategorySet,
  getCategorySets,
  importCategorySet,
} from '@/lib/categories-db';

beforeEach(async () => {
  await categoriesDb.categorySets.clear();
});

describe('importCategorySet', () => {
  it('imports a valid category set', async () => {
    const data = {
      metadata: { name: 'Test Set' },
      categories: {
        animal: {
          name: 'Animal',
          icon: 'icon-animal.png',
          color: '#FF0000',
          fields: ['animal-type'],
          appliesTo: ['point'],
          tags: { type: 'animal' },
        },
      },
      fields: {
        'animal-type': {
          tagKey: 'animal-type',
          type: 'selectOne',
          label: 'Animal Type',
          options: [
            { label: 'Dog', value: 'dog' },
            { label: 'Cat', value: 'cat' },
          ],
        },
      },
    };

    await importCategorySet('test-set', 'Test Set', data);

    const result = await getCategorySet('test-set');
    expect(result).toBeDefined();
    expect(result!.setId).toBe('test-set');
    expect(result!.name).toBe('Test Set');
    expect(result!.categories).toEqual(data.categories);
    expect(result!.fields).toEqual(data.fields);
    expect(result!.metadata).toEqual(data.metadata);
    expect(result!.importedAt).toBeDefined();
  });

  it('throws on invalid data', async () => {
    const invalidData = {
      metadata: { name: 'Bad Set' },
      categories: 'not-an-object',
      fields: {},
    };

    await expect(
      importCategorySet('bad-set', 'Bad Set', invalidData as never),
    ).rejects.toThrow();
  });

  it('throws when categories are missing required fields', async () => {
    const invalidData = {
      categories: {
        animal: {
          name: 'Animal',
          // missing icon, color, fields, appliesTo, tags
        },
      },
      fields: {},
    };

    await expect(
      importCategorySet('bad-set', 'Bad Set', invalidData as never),
    ).rejects.toThrow();
  });

  it('re-imports same setId replacing the existing set', async () => {
    const dataV1 = {
      categories: {
        animal: {
          name: 'Animal',
          icon: 'icon.png',
          color: '#FF0000',
          fields: [],
          appliesTo: ['point'],
          tags: { type: 'animal' },
        },
      },
      fields: {},
    };

    await importCategorySet('replace-me', 'Original', dataV1);

    const dataV2 = {
      metadata: { name: 'Updated' },
      categories: {
        plant: {
          name: 'Plant',
          icon: 'icon-plant.png',
          color: '#00FF00',
          fields: [],
          appliesTo: ['area'],
          tags: { type: 'plant' },
        },
      },
      fields: {},
    };

    await importCategorySet('replace-me', 'Updated', dataV2);

    const result = await getCategorySet('replace-me');
    expect(result!.name).toBe('Updated');
    expect(result!.categories).toEqual(dataV2.categories);
  });
});

describe('getCategorySets', () => {
  it('returns all imported sets', async () => {
    await importCategorySet('set-a', 'Set A', {
      categories: {},
      fields: {},
    });
    await importCategorySet('set-b', 'Set B', {
      categories: {},
      fields: {},
    });

    const sets = await getCategorySets();
    expect(sets).toHaveLength(2);

    const ids = sets.map((s) => s.setId).sort();
    expect(ids).toEqual(['set-a', 'set-b']);
  });

  it('returns empty array when no sets exist', async () => {
    const sets = await getCategorySets();
    expect(sets).toEqual([]);
  });
});

describe('getCategorySet', () => {
  it('returns undefined for non-existent set', async () => {
    const result = await getCategorySet('nonexistent');
    expect(result).toBeUndefined();
  });

  it('returns the set with all fields', async () => {
    const data = {
      metadata: { name: 'Full Set' },
      categories: {
        test: {
          name: 'Test',
          icon: 'icon.png',
          color: '#0000FF',
          fields: ['field-a'],
          appliesTo: ['line'],
          tags: { type: 'test' },
        },
      },
      fields: {
        'field-a': {
          tagKey: 'field-a',
          type: 'text',
          label: 'Field A',
        },
      },
    };

    await importCategorySet('full-set', 'Full Set', data);

    const result = await getCategorySet('full-set');
    expect(result).toEqual({
      setId: 'full-set',
      name: 'Full Set',
      metadata: { name: 'Full Set' },
      categories: data.categories,
      fields: data.fields,
      importedAt: expect.any(String),
    });
  });
});
