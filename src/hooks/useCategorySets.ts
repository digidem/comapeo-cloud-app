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

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const records = await categoriesDb.categorySets.toArray();
      setSets(records.map(toSummary));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { sets, isLoading, error: undefined, refresh };
}
