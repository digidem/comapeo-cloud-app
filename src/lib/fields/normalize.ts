import * as v from 'valibot';

import { fieldSchema } from '@/lib/schemas/field';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** API wire-format field (from comapeo-cloud archive /field endpoint). */
export type ApiField = v.InferOutput<typeof fieldSchema>;

/**
 * Canonical internal field type — camelCase, shared across API wire format,
 * import-file format, and mobile format.
 */
export type NormalizedFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'selectOne'
  | 'selectMultiple'
  | 'date'
  | 'datetime';

/**
 * Normalized field used throughout the app. Both the archive API wire format
 * (snake_case `type`, `key` → `tagKey`) and the import-file format (camelCase
 * `type`, `tagKey`) are mapped into this single internal shape.
 *
 * `helperText` and `placeholder` are kept as separate optional properties:
 * the API format provides `placeholder` (no `helperText`), while the import
 * format provides `helperText` (no `placeholder`).
 */
export interface NormalizedField {
  docId: string;
  tagKey: string;
  type: NormalizedFieldType;
  label: string;
  helperText?: string;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
}

/** Field definition in the import-file (.comapeocat) format. */
export interface ImportField {
  tagKey: string;
  type: 'text' | 'selectOne' | 'selectMultiple' | 'date' | 'number';
  label: string;
  helperText?: string;
  options?: Array<{ label: string; value: string }>;
}

// ---------------------------------------------------------------------------
// Type mapping
// ---------------------------------------------------------------------------

/**
 * Maps API wire-format type values to the canonical camelCase type.
 *
 * The real archive server sends camelCase values (`selectOne`,
 * `selectMultiple`) directly; older/import-format payloads may use
 * snake_case (`select_one`, `select_multiple`). Both forms are accepted.
 */
const API_TYPE_MAP: Record<string, NormalizedFieldType> = {
  text: 'text',
  textarea: 'textarea',
  number: 'number',
  // eslint-disable-next-line @typescript-eslint/naming-convention
  select_one: 'selectOne',
  // eslint-disable-next-line @typescript-eslint/naming-convention
  select_multiple: 'selectMultiple',
  selectOne: 'selectOne',
  selectMultiple: 'selectMultiple',
  date: 'date',
  datetime: 'datetime',
};

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

/**
 * Normalize an archive API wire-format field into the internal
 * {@link NormalizedField} shape.
 *
 * - `tagKey` is used directly; `key` is a fallback for older payloads that
 *   predate the real server's `tagKey` field.
 * - `type` is mapped via {@link API_TYPE_MAP} (accepts both snake_case and
 *   camelCase wire values, e.g. `select_one` / `selectOne` → `selectOne`)
 * - Unknown types default to `'text'`
 * - `placeholder` is passed through; `helperText` is left undefined (API
 *   format does not carry it)
 */
export function normalizeApiField(apiField: ApiField): NormalizedField {
  return {
    docId: apiField.docId,
    tagKey: apiField.tagKey ?? apiField.key ?? '',
    type: API_TYPE_MAP[apiField.type] ?? 'text',
    label: apiField.label,
    placeholder: apiField.placeholder,
    options: apiField.options,
  };
}

/**
 * Normalize an import-file field into the internal {@link NormalizedField}
 * shape.
 *
 * The import format already uses camelCase `type` values and `tagKey`, so
 * they are passed through directly. `helperText` is carried over; `placeholder`
 * is left undefined (import format does not carry it).
 */
export function normalizeImportField(
  docId: string,
  importField: ImportField,
): NormalizedField {
  return {
    docId,
    tagKey: importField.tagKey,
    type: importField.type,
    label: importField.label,
    helperText: importField.helperText,
    options: importField.options,
  };
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Build a `docId` → {@link NormalizedField} lookup map from raw API fields.
 *
 * Each field is normalized via {@link normalizeApiField} and inserted under
 * its `docId`. When the field carries an `originalVersionId`, an additional
 * alias entry is created under that key pointing to the same normalized
 * field — this allows preset `fieldRefs` (which may reference either the
 * latest version `docId` or the `originalVersionId`) to resolve correctly.
 */
export function buildFieldLookup(
  apiFields: ReadonlyArray<Omit<ApiField, 'links'> & { links?: string[] }>,
): Map<string, NormalizedField> {
  const lookup = new Map<string, NormalizedField>();

  for (const apiField of apiFields) {
    const normalized = normalizeApiField({
      ...apiField,
      links: apiField.links ?? [],
    });
    lookup.set(normalized.docId, normalized);
    if (apiField.originalVersionId) {
      lookup.set(apiField.originalVersionId, normalized);
    }
  }

  return lookup;
}
