import * as v from 'valibot';

export const presetRefSchema = v.object({
  docId: v.string(),
  versionId: v.string(),
  url: v.string(),
});

export const observationSchema = v.object({
  docId: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  deleted: v.boolean(),
  lat: v.optional(v.number()),
  lon: v.optional(v.number()),
  attachments: v.array(
    v.object({
      url: v.string(),
    }),
  ),
  tags: v.record(v.string(), v.unknown()),
  presetRef: v.optional(presetRefSchema),
});

export const observationsResponseSchema = v.object({
  data: v.array(observationSchema),
});
