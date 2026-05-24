import type { Observation, Preset } from '@/lib/db';

const PRESET_REF_DOC_ID_KEY = 'presetRefDocId';

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
