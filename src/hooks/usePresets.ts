import { useQuery } from '@tanstack/react-query';

import { getPresets } from '@/lib/data-layer';

export function usePresets(projectLocalId: string | null) {
  return useQuery({
    queryKey: ['presets', projectLocalId],
    queryFn: () => getPresets(projectLocalId!),
    enabled: projectLocalId !== null,
  });
}
