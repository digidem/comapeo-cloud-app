import { useQuery } from '@tanstack/react-query';

import { getObservations } from '@/lib/data-layer';

export function useObservations(projectLocalId: string | null) {
  return useQuery({
    queryKey: ['observations', projectLocalId],
    queryFn: () => getObservations(projectLocalId!),
    enabled: projectLocalId !== null,
  });
}
