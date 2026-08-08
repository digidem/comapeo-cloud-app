import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetCategoriesDb } from '@/lib/categories-db';

vi.mock('dexie', () => {
  const mockTable = {
    put: vi.fn().mockResolvedValue(undefined),
    toArray: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  };

  return {
    default: class MockDexie {
      tables = [mockTable];
      constructor() {}
      version() {
        return this;
      }
      stores() {
        return this;
      }
      upgrade() {
        return this;
      }
      transaction = vi.fn(async (_, __, fn) => fn());
      categorySets = mockTable;
    },
  };
});

describe('categories-db', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('resetCategoriesDb', () => {
    it('clears all tables in the categories database', async () => {
      const { categoriesDb } = await import('@/lib/categories-db');
      const mockTable = categoriesDb.tables[0];

      await resetCategoriesDb();

      expect(categoriesDb.transaction).toHaveBeenCalled();
      expect(mockTable?.clear).toHaveBeenCalled();
    });
  });
});
