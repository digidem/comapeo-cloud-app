import * as v from 'valibot';

import { presetRefSchema } from '@/lib/schemas/observation';
import { docRefSchema } from '@/lib/schemas/refs';

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
  observationRefs: v.optional(v.array(docRefSchema), []),
  tags: v.record(v.string(), v.string()),
  presetRef: v.optional(presetRefSchema),
});

export const tracksResponseSchema = v.object({
  data: v.array(trackSchema),
});
