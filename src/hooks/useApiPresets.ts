import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api-client';

/** Fetches presets directly from the archive server API (wire format). */
export function useApiPresets(projectLocalId: string | null) {
  return useQuery({
    queryKey: ['api-presets', projectLocalId],
    queryFn: () => apiClient.getPresets(projectLocalId!),
    enabled: projectLocalId !== null,
    select: (data) => data.data,
  });
}
