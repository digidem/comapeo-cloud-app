import { useQuery } from '@tanstack/react-query';

import { getFields } from '@/lib/data-layer';

export function useFields(projectLocalId: string | null) {
  return useQuery({
    queryKey: ['fields', projectLocalId],
    queryFn: () => getFields(projectLocalId!),
    enabled: projectLocalId !== null,
  });
}
