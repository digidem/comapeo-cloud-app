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
  versionId: v.string(),
  originalVersionId: v.string(),
  schemaName: v.literal('field'),
  createdAt: v.string(),
  updatedAt: v.string(),
  links: v.array(v.string()),
  deleted: v.boolean(),
  type: fieldTypeSchema,
  key: v.string(),
  label: v.string(),
  placeholder: v.optional(v.string()),
  universal: v.boolean(),
  options: v.optional(v.array(optionSchema)),
});

export const fieldsResponseSchema = v.object({
  data: v.array(fieldSchema),
});
