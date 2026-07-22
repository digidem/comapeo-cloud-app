import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api-client';

export function usePresets(projectLocalId: string | null) {
  return useQuery({
    queryKey: ['presets', projectLocalId],
    queryFn: () => apiClient.getPresets(projectLocalId!),
    enabled: projectLocalId !== null,
  });
}
