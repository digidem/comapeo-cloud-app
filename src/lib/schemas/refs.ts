import * as v from 'valibot';

/**
 * Shared schema for {docId, versionId?, url?} ref objects used across
 * multiple schemas. Loosened from presetRefSchema (which requires versionId+url)
 * so observation refs in track responses don't fail validation if the server
 * omits those fields (a single missing field would previously have silently
 * dropped ALL tracks for the project).
 */
export const docRefSchema = v.object({
  docId: v.string(),
  versionId: v.optional(v.string()),
  url: v.optional(v.string()),
});
