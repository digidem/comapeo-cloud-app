import Dexie, { type EntityTable } from 'dexie';
import * as v from 'valibot';

import { comapeoCatSchema } from '@/lib/schemas/preset';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CategorySetRecord {
  setId: string;
  name: string;
  metadata?: Record<string, unknown>;
  categories: Record<string, unknown>;
  fields: Record<string, unknown>;
  importedAt: string;
}

// ---------------------------------------------------------------------------
// Database class
// ---------------------------------------------------------------------------

class CategoriesDB extends Dexie {
  categorySets!: EntityTable<CategorySetRecord, 'setId'>;

  constructor() {
    super('comapeo-categories');
    this.version(1).stores({
      categorySets: '&setId',
    });
  }
}

export const categoriesDb = new CategoriesDB();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validate and import a category set into the database.
 * If a set with the same setId already exists, it is replaced.
 */
export async function importCategorySet(
  setId: string,
  name: string,
  data: unknown,
): Promise<void> {
  const parsed = v.parse(comapeoCatSchema, data);

  const record: CategorySetRecord = {
    setId,
    name,
    metadata: parsed.metadata as Record<string, unknown> | undefined,
    categories: parsed.categories as Record<string, unknown>,
    fields: parsed.fields as Record<string, unknown>,
    importedAt: new Date().toISOString(),
  };

  await categoriesDb.categorySets.put(record);
}

/**
 * Return all imported category sets.
 */
export async function getCategorySets(): Promise<CategorySetRecord[]> {
  return categoriesDb.categorySets.toArray();
}

/**
 * Return a single category set by ID, or undefined if not found.
 */
export async function getCategorySet(
  setId: string,
): Promise<CategorySetRecord | undefined> {
  return categoriesDb.categorySets.get(setId);
}
