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
}): ObservationCategoryMetadata {
  const presetsQuery = usePresets(projectLocalId);

  return useMemo(() => {
    const presets = presetsQuery.data ?? [];
    if (observations.length === 0 && presets.length === 0) {
      return EMPTY_METADATA;
    }

    return buildObservationCategoryMetadata(observations, presets, {
      projectRemoteId,
      serverUrl,
    });
  }, [observations, presetsQuery.data, projectRemoteId, serverUrl]);
}
