import { useCallback, useEffect, useState } from 'react';

import { categoriesDb, type CategorySetRecord } from '@/lib/categories-db';

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

  useEffect(() => {
    let cancelled = false;
    categoriesDb.categorySets
      .toArray()
      .then((records) => {
        if (!cancelled) setSets(records.map(toSummary));
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
    const records = await categoriesDb.categorySets.toArray();
    setSets(records.map(toSummary));
    setIsLoading(false);
  }, []);

  return { sets, isLoading, error: undefined, refresh };
}
