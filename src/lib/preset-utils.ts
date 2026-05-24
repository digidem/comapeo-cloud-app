import type { Observation, Preset } from '@/lib/db';

const PRESET_REF_DOC_ID_KEY = 'presetRefDocId';

/**
 * Match an observation to its preset using the stored presetRef.docId
 * (available in tags after pullObservations), falling back to match by
 * category name or terms.
 *
 * @param observation - The local observation record (may include presetRefDocId in tags)
 * @param presetByRemoteId - Map from preset remoteId to Preset
 * @returns The matching Preset or undefined
 */
export function matchObservationToPreset(
  observation: Observation,
  presetByRemoteId: ReadonlyMap<string, Preset>,
): Preset | undefined {
  // Primary match: presetRef.docId from the API response (stored in tags during pull)
  const presetRefDocId = observation.tags?.[PRESET_REF_DOC_ID_KEY];
  if (presetRefDocId) {
    const match = presetByRemoteId.get(presetRefDocId);
    if (match) return match;
  }

  // Fallback: try matching by category name or terms
  const category = observation.tags?.category;
  if (category) {
    for (const preset of presetByRemoteId.values()) {
      if (preset.name === category || preset.terms.includes(category)) {
        return preset;
      }
    }
  }

  return undefined;
}
