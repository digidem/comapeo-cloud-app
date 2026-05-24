import type { Observation, Preset } from '@/lib/db';

const PRESET_REF_DOC_ID_KEY = 'presetRefDocId';

const FALLBACK_NAME = 'Observation';

/**
 * Attempts to derive a display name from legacy observation tags.
 *
 * In legacy servers (v0.4.x), observations used tag keys with values
 * of "yes" or "true" to indicate the observation category (e.g.
 * `{ "tree-sighting": "yes" }`). This function finds the first such
 * tag key and formats it as a human-readable name.
 *
 * @param tags - The observation's tags object
 * @returns A formatted display name, or undefined if no legacy tag found
 */
export function getLegacyDisplayName(
  tags: Record<string, unknown> | undefined,
): string | undefined {
  if (!tags) return undefined;

  for (const [key, value] of Object.entries(tags)) {
    if (value === 'yes' || value === 'true') {
      return key
        .split(/[-_]/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }
  }

  return undefined;
}

/**
 * Finds the best matching preset based on an observation's tags.
 *
 * Primary match: uses the server-provided presetRef.docId stored in tags
 * during sync (fast path).
 *
 * Fallback (matching comapeo-mobile's `matchPreset`): scores each preset
 * by how many of its `tags` key-value pairs appear in the observation's
 * tags, returning the preset with the highest match percentage. This is
 * the standard id-editors convention for preset matching.
 *
 * @param observation - The observation (only its `tags` field is used)
 * @param presets - All presets to match against
 * @returns The best matching Preset, or undefined if no match is found
 */
export function matchObservationToPreset(
  observation: Pick<Observation, 'tags'>,
  presets: Preset[],
): Preset | undefined {
  // Fast path: server-provided direct reference
  const refDocId = observation.tags?.[PRESET_REF_DOC_ID_KEY];
  if (refDocId && typeof refDocId === 'string') {
    const directMatch = presets.find((p) => p.remoteId === refDocId);
    if (directMatch) return directMatch;
  }

  // Tag-based scoring (matches comapeo-mobile/src/frontend/lib/utils.ts matchPreset)
  let bestMatch: Preset | undefined;
  let bestScore = 0;

  for (const preset of presets) {
    const presetTagKeys = Object.keys(preset.tags ?? {});
    if (presetTagKeys.length === 0) continue;

    let matchedCount = 0;
    for (const key of presetTagKeys) {
      const presetVal = preset.tags![key];
      const obsVal = observation.tags?.[key];

      if (obsVal !== undefined) {
        if (presetVal === obsVal) {
          matchedCount++;
        } else if (Array.isArray(presetVal) && presetVal.includes(obsVal)) {
          matchedCount++;
        }
      }
    }

    const score = (matchedCount / presetTagKeys.length) * 100;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = preset;
    }
  }

  return bestMatch;
}

/**
 * Synchronous version of `getObservationDisplayName` that takes presets
 * as a parameter instead of loading them from the database. Useful in UI
 * components that already have presets loaded via a hook.
 *
 * @param observation - The observation whose display name to resolve
 * @param presets - All presets (already loaded) to match against
 * @returns The matched preset name, or the fallback 'Observation'
 */
export function getObservationDisplayNameSync(
  observation: Pick<Observation, 'tags'>,
  presets: Preset[],
): string {
  const preset = matchObservationToPreset(observation, presets);
  if (preset) return preset.name;

  const legacyName = getLegacyDisplayName(
    observation.tags as Record<string, unknown> | undefined,
  );
  if (legacyName) return legacyName;

  return FALLBACK_NAME;
}
