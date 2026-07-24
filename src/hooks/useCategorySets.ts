import { useCallback, useEffect, useState } from 'react';

import { type CategorySetRecord, categoriesDb } from '@/lib/categories-db';

export interface CategorySetSummary {
  setId: string;
  name: string;
  importedAt: string;
  categoryCount: number;
}

function toSummary(record: CategorySetRecord): CategorySetSummary {
  return {
    setId: record.setId,
    name: record.name,
    importedAt: record.importedAt,
    categoryCount: Object.keys(record.categories).length,
  };
}

export function useCategorySets() {
  const [sets, setSets] = useState<CategorySetSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    categoriesDb.categorySets
      .toArray()
      .then((records) => {
        if (!cancelled) {
          setSets(records.map(toSummary));
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load sets');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const records = await categoriesDb.categorySets.toArray();
      setSets(records.map(toSummary));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to refresh sets');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { sets, isLoading, error, refresh };
}
