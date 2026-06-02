import * as v from 'valibot';

import { presetRefSchema } from '@/lib/schemas/observation';
import { docRefSchema } from '@/lib/schemas/refs';

const trackLocationSchema = v.object({
  coords: v.object({
    latitude: v.number(),
    longitude: v.number(),
  }),
  timestamp: v.optional(v.string()),
  createdAt: v.optional(v.string()),
  accuracy: v.optional(v.number()),
  altitude: v.optional(v.number()),
});

export const trackSchema = v.object({
  docId: v.string(),
  versionId: v.optional(v.string()),
  originalVersionId: v.optional(v.string()),
  schemaName: v.optional(v.literal('track')),
  createdAt: v.string(),
  updatedAt: v.string(),
  links: v.optional(v.array(v.string())),
  deleted: v.boolean(),
  locations: v.optional(v.array(trackLocationSchema), []),
  observationRefs: v.optional(v.array(docRefSchema), []),
  tags: v.optional(v.record(v.string(), v.unknown()), {}),
  presetRef: v.optional(presetRefSchema),
});

export const tracksResponseSchema = v.object({
  data: v.array(trackSchema),
});
