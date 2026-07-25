import { useQuery } from '@tanstack/react-query';

import type { RequestConfig } from '@/lib/api-client';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';

/** Fetches presets directly from the archive server API (wire format).
 * Uses the project's remoteId (server projectPublicId, base32) — NOT the
 * local DB id (hex). Required because the server route parameter is validated
 * against a base32 regex pattern.
 *
 * Passes the optional {@link serverConfig} so the request is routed through
 * the `/api` proxy with the archive-target header for the project's owning
 * server. Falls back to the active server's credentials when no serverConfig
 * is provided. */
export function useApiPresets(
  projectRemoteId: string | null,
  serverConfig?: { baseUrl: string; token: string } | null,
) {
  const activeBaseUrl = useAuthStore((s) => s.baseUrl);
  const activeToken = useAuthStore((s) => s.token);

  const effectiveBaseUrl = serverConfig?.baseUrl ?? activeBaseUrl;
  const effectiveToken = serverConfig?.token ?? activeToken;

  const enabled =
    projectRemoteId !== null &&
    effectiveBaseUrl !== null &&
    effectiveToken !== null &&
    effectiveToken !== '';

  // !!effectiveToken used in queryKey to avoid leaking the bearer token into
  // React Query devtools / logging while still invalidating on change.
  // The exhaustive-deps rule wants serverConfig in the key, but we
  // intentionally omit the raw token — the boolean presence flag is
  // sufficient for cache invalidation on credential rotation.
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  const queryResult = useQuery({
    queryKey: [
      'api-presets',
      projectRemoteId,
      effectiveBaseUrl,
      !!effectiveToken,
    ],
    queryFn: () => {
      const config: RequestConfig = serverConfig
        ? { baseUrl: serverConfig.baseUrl, token: serverConfig.token }
        : { baseUrl: activeBaseUrl!, token: activeToken ?? '' };
      return apiClient.getPresets(projectRemoteId!, config);
    },
    enabled,
    select: (data) => data.data,
  });

  // eslint-disable-next-line @tanstack/query/no-rest-destructuring
  return { ...queryResult, isEnabled: enabled };
}
