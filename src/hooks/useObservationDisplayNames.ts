import { useMemo } from 'react';

import { usePresets } from '@/hooks/usePresets';
import type { Observation } from '@/lib/db';
import { getLegacyDisplayName } from '@/lib/preset-utils';
import { matchObservationToPreset } from '@/lib/preset-utils';

/**
 * Returns a Map from observation localId → display name, using preset matching.
 * Entries are only set when a matching preset is found; callers should provide
 * their own i18n fallback for observations without a match.
 *
 * @param observations - Array of observations to compute display names for
 * @param projectLocalId - The project's local ID (for loading presets)
 * @returns A Map<string, string> keyed by observation localId
 */
export function useObservationDisplayNames(
  observations: Observation[],
  projectLocalId: string | null,
): Map<string, string> {
  const presetsQuery = usePresets(projectLocalId);
  const presets = presetsQuery.data ?? [];

  return useMemo(() => {
    const map = new Map<string, string>();
    for (const obs of observations) {
      const preset = matchObservationToPreset(obs, presets);
      if (preset) {
        map.set(obs.localId, preset.name);
      } else {
        const legacy = getLegacyDisplayName(obs.tags);
        if (legacy) {
          map.set(obs.localId, legacy);
        }
      }
    }
    return map;
  }, [observations, presets]);
}
