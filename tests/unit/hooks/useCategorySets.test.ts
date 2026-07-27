import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCategorySets } from '@/hooks/useCategorySets';
import { categoriesDb } from '@/lib/categories-db';

beforeEach(async () => {
  await categoriesDb.categorySets.clear();
});

describe('useCategorySets', () => {
  it('returns empty sets when DB is empty', async () => {
    const { result } = renderHook(() => useCategorySets());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.sets).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('returns summaries when DB has sets', async () => {
    await categoriesDb.categorySets.bulkPut([
      {
        setId: 'set-a',
        name: 'Set A',
        categories: { cat1: {}, cat2: {}, cat3: {} },
        fields: {},
        importedAt: '2024-01-01T00:00:00Z',
      },
      {
        setId: 'set-b',
        name: 'Set B',
        categories: { cat1: {} },
        fields: {},
        importedAt: '2024-01-02T00:00:00Z',
      },
    ]);

    const { result } = renderHook(() => useCategorySets());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.sets).toHaveLength(2);
    expect(result.current.sets[0]!.setId).toBe('set-a');
    expect(result.current.sets[0]!.name).toBe('Set A');
    expect(result.current.sets[0]!.categoryCount).toBe(3);
    expect(result.current.sets[1]!.setId).toBe('set-b');
    expect(result.current.sets[1]!.name).toBe('Set B');
    expect(result.current.sets[1]!.categoryCount).toBe(1);
  });

  it('returns error when DB access fails', async () => {
    const originalToArray = categoriesDb.categorySets.toArray;
    categoriesDb.categorySets.toArray = vi
      .fn()
      .mockRejectedValue(new Error('DB error'));

    const { result } = renderHook(() => useCategorySets());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('DB error');

    categoriesDb.categorySets.toArray = originalToArray;
  });

  it('refresh reloads data after mutation', async () => {
    await categoriesDb.categorySets.put({
      setId: 'initial',
      name: 'Initial',
      categories: { a: {} },
      fields: {},
      importedAt: '2024-01-01T00:00:00Z',
    });

    const { result } = renderHook(() => useCategorySets());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.sets).toHaveLength(1);

    // Add another set
    await categoriesDb.categorySets.put({
      setId: 'added-later',
      name: 'Added Later',
      categories: { b: {}, c: {} },
      fields: {},
      importedAt: '2024-01-03T00:00:00Z',
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.sets).toHaveLength(2);
    const added = result.current.sets.find((s) => s.setId === 'added-later');
    expect(added).toBeDefined();
    expect(added!.categoryCount).toBe(2);
  });
});
