import { useQuery } from '@tanstack/react-query';

import { getAlerts } from '@/lib/data-layer';

export function useAlerts(projectLocalId: string | null) {
  return useQuery({
    queryKey: ['alerts', projectLocalId],
    queryFn: () => getAlerts(projectLocalId!),
    enabled: projectLocalId !== null,
  });
}
