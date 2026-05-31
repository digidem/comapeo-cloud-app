import { useQuery } from '@tanstack/react-query';

import { getTracks } from '@/lib/data-layer';

export function useTracks(projectLocalId: string | null) {
  return useQuery({
    queryKey: ['tracks', projectLocalId],
    queryFn: () => getTracks(projectLocalId!),
    enabled: projectLocalId !== null,
  });
}
