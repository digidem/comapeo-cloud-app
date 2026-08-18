import { useQuery } from '@tanstack/react-query';

import { getCase } from '@/lib/data-layer';

export function useCase(projectLocalId: string | null, caseId: string | null) {
  return useQuery({
    queryKey: ['case', projectLocalId, caseId],
    // Wrap getCase so the query function always returns a defined value,
    // satisfying TanStack Query's no-undefined-data contract. A missing or
    // cross-project Case resolves to `null`, which consumers can distinguish
    // from a genuinely-loaded Case object.
    queryFn: async () => {
      const result = await getCase(projectLocalId!, caseId!);
      return result ?? null;
    },
    enabled: projectLocalId !== null && caseId !== null,
  });
}
