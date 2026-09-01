import { useQuery } from '@tanstack/react-query';

import {
  type PresetVersionLike,
  deduplicatePresetVersions,
} from '@/hooks/useApiPresets';
import type { RequestConfig } from '@/lib/api-client';
import { apiClient } from '@/lib/api-client';
import {
  selectActiveBaseUrl,
  selectActiveToken,
  useAuthStore,
} from '@/stores/auth-store';

/**
 * Deduplicate field versions using `originalVersionId ?? docId` as the
 * logical identity — the same pattern as {@link deduplicatePresetVersions}.
 *
 * Each group of versions (sharing an `originalVersionId`, or falling back to
 * `docId` for standalone fields) is collapsed to its newest member, ranked by
 * `createdAt` timestamp (with `versionId` as a lexical tiebreaker).
 */
export function deduplicateFieldVersions<T extends PresetVersionLike>(
  fields: readonly T[],
): T[] {
  return deduplicatePresetVersions(fields);
}

/**
 * Fetches fields directly from the archive server API (wire format).
 *
 * Uses the project's `remoteId` (server `projectPublicId`, base32) — NOT the
 * local DB id (hex). Required because the server route parameter is validated
 * against a base32 regex pattern.
 *
 * Passes the optional `serverConfig` so the request is routed through the
 * `/api` proxy with the archive-target header for the project's owning
 * server. Falls back to the active server's credentials when no `serverConfig`
 * is provided.
 *
 * The `select` function filters out deleted fields and deduplicates versions
 * before returning the result.
 */
export function useApiFields(
  projectRemoteId: string | null,
  serverConfig?: {
    serverId?: string | null;
    baseUrl: string;
    token: string;
  } | null,
) {
  const activeBaseUrl = useAuthStore(selectActiveBaseUrl);
  const activeToken = useAuthStore(selectActiveToken);
  const activeServerId = useAuthStore((state) => state.activeServerId);

  const effectiveBaseUrl = serverConfig?.baseUrl ?? activeBaseUrl;
  const effectiveToken = serverConfig?.token ?? activeToken;
  const effectiveServerId = serverConfig?.serverId ?? activeServerId;

  const enabled =
    projectRemoteId !== null &&
    effectiveBaseUrl !== null &&
    effectiveToken !== null &&
    effectiveToken !== '';

  const queryResult = useQuery({
    queryKey: [
      'api-fields',
      projectRemoteId,
      effectiveServerId,
      effectiveBaseUrl,
      effectiveToken,
    ],
    queryFn: () =>
      apiClient.getFields(projectRemoteId!, {
        serverId: effectiveServerId,
        baseUrl: effectiveBaseUrl!,
        token: effectiveToken!,
      } satisfies RequestConfig),
    enabled,
    select: (data) =>
      deduplicateFieldVersions(data.data.filter((f) => !f.deleted)),
  });

  // eslint-disable-next-line @tanstack/query/no-rest-destructuring
  return { ...queryResult, isEnabled: enabled };
}
