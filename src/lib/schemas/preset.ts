import * as v from 'valibot';

import { presetRefSchema } from '@/lib/schemas/observation';

// ---------------------------------------------------------------------------
// Server wire-type schemas (preset response from comapeo-cloud)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Import-file schemas (.comapeocat / comapeo-default-categories format)
//
// These model the upstream comapeo-default-categories JSON format, which is
// distinct from the server wire type. Category names, icon references, and
// field tagKeys are validated strictly; extensible metadata properties are
// preserved via looseObject passthrough.
// ---------------------------------------------------------------------------

/** Metadata from a .comapeocat package (e.g. metadata.json). */
export const metadataSchema = v.looseObject({
  name: v.string(),
});

/** Option for a select_one / select_multiple field. */
export const importFieldOptionSchema = v.object({
  label: v.string(),
  value: v.string(),
});

/**
 * Field definition in the import-file format.
 *
 * Wire type uses `tagKey` (not `key`) and camelCase `type` values
 * (`selectOne` / `selectMultiple` / `text` / `date` / `number`).
 * `helperText` and `options` are optional — text/date/number fields
 * typically omit them.
 */
export const fieldSchema = v.looseObject({
  tagKey: v.string(),
  type: v.picklist([
    'text',
    'selectOne',
    'selectMultiple',
    'date',
    'number',
  ]),
  label: v.string(),
  helperText: v.optional(v.string()),
  options: v.optional(v.array(importFieldOptionSchema)),
});

/**
 * Category definition in the import-file format.
 *
 * `name`, `icon`, `color`, `fields`, `appliesTo`, and `tags` (with
 * required `type` key) are all required. Additional properties are
 * allowed for forward compatibility.
 */
export const categorySchema = v.looseObject({
  name: v.string(),
  icon: v.string(),
  color: v.pipe(v.string(), v.regex(/^#[0-9A-Fa-f]{6}$/)),
  fields: v.array(v.string()),
  appliesTo: v.pipe(v.array(v.string()), v.minLength(1)),
  tags: v.looseObject({
    type: v.string(),
  }),
});

/**
 * Full .comapeocat import-file envelope.
 *
 * Mirrors the structure produced by comapeo-default-categories:
 * `{ metadata?, categorySelection, categories, fields }`.
 * `metadata` and `categorySelection` are optional — the core
 * contract is categories + fields.
 */
export const comapeoCatSchema = v.looseObject({
  metadata: v.optional(metadataSchema),
  categorySelection: v.optional(v.record(v.string(), v.array(v.string()))),
  categories: v.record(v.string(), categorySchema),
  fields: v.record(v.string(), fieldSchema),
});
