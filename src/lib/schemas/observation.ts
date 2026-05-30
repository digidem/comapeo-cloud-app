import * as v from 'valibot';

export const presetRefSchema = v.object({
  docId: v.string(),
  versionId: v.string(),
  url: v.string(),
});

export const attachmentSchema = v.object({
  url: v.string(),
  driveId: v.optional(v.string()),
  type: v.optional(v.string()),
  name: v.optional(v.string()),
  hash: v.optional(v.string()),
  mimeType: v.optional(v.string()),
});

export const observationSchema = v.object({
  docId: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  deleted: v.boolean(),
  lat: v.optional(v.number()),
  lon: v.optional(v.number()),
  attachments: v.array(attachmentSchema),
  tags: v.record(v.string(), v.unknown()),
  metadata: v.optional(v.record(v.string(), v.unknown())),
  presetRef: v.optional(presetRefSchema),
});

export const observationsResponseSchema = v.object({
  data: v.array(observationSchema),
});
