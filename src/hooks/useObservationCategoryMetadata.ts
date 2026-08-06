import { useMemo } from 'react';

import { usePresets } from '@/hooks/usePresets';
import {
  type ObservationCategoryMetadata,
  buildObservationCategoryMetadata,
} from '@/lib/category-utils';
import type { Observation } from '@/lib/db';

const EMPTY_METADATA: ObservationCategoryMetadata = {
  categories: [],
  categoryByObservationId: new Map(),
  displayNamesByObservationId: new Map(),
};

export function useObservationCategoryMetadata({
  observations,
  projectLocalId,
  projectRemoteId,
  serverUrl,
}: {
  observations: Observation[];
  projectLocalId: string | null;
  projectRemoteId?: string;
  serverUrl?: string;
}): ObservationCategoryMetadata & { isLoading: boolean } {
  const presetsQuery = usePresets(projectLocalId);

  const metadata = useMemo(() => {
    const presets = presetsQuery.data ?? [];
    if (observations.length === 0 && presets.length === 0) {
      return EMPTY_METADATA;
    }

    return buildObservationCategoryMetadata(observations, presets, {
      projectRemoteId,
      serverUrl,
    });
  }, [observations, presetsQuery.data, projectRemoteId, serverUrl]);

  return { ...metadata, isLoading: presetsQuery.isLoading };
}
