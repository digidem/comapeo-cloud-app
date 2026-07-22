import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api-client';

/** Fetches presets directly from the archive server API (wire format).
 * Uses the project's remoteId (server projectPublicId, base32) — NOT the
 * local DB id (hex). Required because the server route parameter is validated
 * against a base32 regex pattern. */
export function useApiPresets(projectRemoteId: string | null) {
  return useQuery({
    queryKey: ['api-presets', projectRemoteId],
    queryFn: () => apiClient.getPresets(projectRemoteId!),
    enabled: projectRemoteId !== null,
    select: (data) => data.data,
  });
}
