import * as v from 'valibot';

import { presetRefSchema } from '@/lib/schemas/observation';

const geometryTypesSchema = v.array(
  v.picklist(['point', 'vertex', 'line', 'area', 'relation']),
);

const tagsSchema = v.record(
  v.string(),
  v.union([
    v.boolean(),
    v.number(),
    v.string(),
    v.null_(),
    v.array(v.union([v.boolean(), v.number(), v.string(), v.null_()])),
  ]),
);

export const presetSchema = v.object({
  docId: v.string(),
  versionId: v.string(),
  originalVersionId: v.string(),
  schemaName: v.literal('preset'),
  createdAt: v.string(),
  updatedAt: v.string(),
  links: v.array(v.string()),
  deleted: v.boolean(),
  name: v.string(),
  geometry: geometryTypesSchema,
  tags: tagsSchema,
  addTags: tagsSchema,
  removeTags: tagsSchema,
  fieldRefs: v.array(presetRefSchema),
  iconRef: v.optional(presetRefSchema),
  color: v.optional(v.pipe(v.string(), v.regex(/^#[0-9A-Fa-f]{6}$/))),
  terms: v.array(v.string()),
});

export const presetsResponseSchema = v.object({
  data: v.array(presetSchema),
});
