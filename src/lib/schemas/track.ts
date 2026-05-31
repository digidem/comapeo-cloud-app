import * as v from 'valibot';

import { presetRefSchema } from '@/lib/schemas/observation';

export const trackSchema = v.object({
  docId: v.string(),
  versionId: v.string(),
  originalVersionId: v.string(),
  schemaName: v.literal('track'),
  createdAt: v.string(),
  updatedAt: v.string(),
  links: v.array(v.string()),
  deleted: v.boolean(),
  locations: v.array(
    v.object({
      coords: v.object({
        latitude: v.number(),
        longitude: v.number(),
      }),
      timestamp: v.optional(v.string()),
    }),
  ),
  observationRefs: v.array(presetRefSchema),
  tags: v.record(v.string(), v.unknown()),
  presetRef: v.optional(presetRefSchema),
});

export const tracksResponseSchema = v.object({
  data: v.array(trackSchema),
});
