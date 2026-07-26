import * as v from 'valibot';

const fieldTypeSchema = v.picklist([
  'text',
  'textarea',
  'number',
  'select_one',
  'select_multiple',
  'date',
  'datetime',
]);

const optionSchema = v.object({
  label: v.string(),
  value: v.string(),
});

export const fieldSchema = v.object({
  docId: v.string(),
  versionId: v.optional(v.string()),
  originalVersionId: v.optional(v.string()),
  schemaName: v.optional(v.literal('field')),
  createdAt: v.string(),
  updatedAt: v.string(),
  links: v.optional(v.array(v.string()), []),
  deleted: v.boolean(),
  type: fieldTypeSchema,
  key: v.string(),
  label: v.string(),
  placeholder: v.optional(v.string()),
  // Tolerant of real server responses: `universal` may be omitted (the
  // archive server does not always send it). `v.fallback` makes a missing
  // key fall back to `false` AND narrows the output type to `boolean`, so
  // downstream consumers (e.g. `Field.universal: boolean`) are unaffected.
  // Extra server keys (e.g. `geometry`) are stripped by `v.object`.
  universal: v.fallback(v.boolean(), false),
  options: v.optional(v.array(optionSchema)),
});

export const fieldsResponseSchema = v.object({
  data: v.array(fieldSchema),
});
