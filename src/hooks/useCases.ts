import { useQuery } from '@tanstack/react-query';

import { getCases } from '@/lib/data-layer';

export function useCases(projectLocalId: string | null) {
  return useQuery({
    queryKey: ['cases', projectLocalId],
    queryFn: () => getCases(projectLocalId!),
    enabled: projectLocalId !== null,
  });
}
