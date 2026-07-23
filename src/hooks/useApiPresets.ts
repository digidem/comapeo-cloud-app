import { useQuery } from '@tanstack/react-query';

import type { RequestConfig } from '@/lib/api-client';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';

/** Fetches presets directly from the archive server API (wire format).
 * Uses the project's remoteId (server projectPublicId, base32) — NOT the
 * local DB id (hex). Required because the server route parameter is validated
 * against a base32 regex pattern.
 *
 * Passes the active archive server's {@link RequestConfig} so the request is
 * routed through the `/api` proxy with the archive-target header. Without it,
 * `resolveApiRequest` falls back to `window.location.origin`, which on the
 * Cloudflare Pages deployment returns the SPA index.html (HTTP 200) instead of
 * JSON — surfacing as a spurious "Failed to load categories" error. */
export function useApiPresets(projectRemoteId: string | null) {
  const baseUrl = useAuthStore((s) => s.baseUrl);
  const token = useAuthStore((s) => s.token);

  return useQuery({
    queryKey: ['api-presets', projectRemoteId, baseUrl, token],
    queryFn: () => {
      const config: RequestConfig = { baseUrl: baseUrl!, token: token ?? '' };
      return apiClient.getPresets(projectRemoteId!, config);
    },
    enabled: projectRemoteId !== null && baseUrl !== null,
    select: (data) => data.data,
  });
}
