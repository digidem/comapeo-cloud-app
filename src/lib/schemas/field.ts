import * as v from 'valibot';

// The real archive server sends camelCase type values (`selectOne`,
// `selectMultiple`); older/import-format payloads may use snake_case
// (`select_one`, `select_multiple`). Accept both raw wire forms here —
// `normalizeApiField` maps either form to the canonical camelCase
// `NormalizedFieldType`.
const fieldTypeSchema = v.picklist([
  'text',
  'textarea',
  'number',
  'select_one',
  'select_multiple',
  'selectOne',
  'selectMultiple',
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
  links: v.optional(v.array(v.string()), []),
  deleted: v.boolean(),
  type: fieldTypeSchema,
  // Real archive server responses use `tagKey`; `key` is kept optional for
  // backward compatibility with older payloads/tests that predate the real
  // wire-contract discovery. At least one of `tagKey`/`key` is expected; the
  // normalizers fall back `tagKey ?? key ?? ''`.
  tagKey: v.optional(v.string()),
  key: v.optional(v.string()),
  label: v.string(),
  placeholder: v.optional(v.string()),
  // Tolerant of real server responses: `universal` may be omitted (the
  // archive server does not always send it). `v.fallback` makes a missing
  // key fall back to `false` AND narrows the output type to `boolean`, so
  // downstream consumers (e.g. `Field.universal: boolean`) are unaffected.
  // Extra server keys (e.g. `geometry`) are stripped by `v.object`.
  // `createdAt`/`updatedAt` are required — the real archive server response
  // (see tests/fixtures/fields/real-archive-response.json) always includes
  // them; `deduplicatePresetVersions` also tolerates a missing/invalid
  // `createdAt` at runtime via `parseCreatedAt`.
  universal: v.fallback(v.boolean(), false),
  createdAt: v.string(),
  updatedAt: v.string(),
  options: v.optional(v.array(optionSchema)),
});

export const fieldsResponseSchema = v.object({
  data: v.array(fieldSchema),
});
