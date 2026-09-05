import * as v from 'valibot';

import type { SavedMap } from '@/lib/db';
import {
  AuthoredLayerValidationThrown,
  MAX_AUTHORED_LAYERS,
  MAX_AUTHORED_LAYERS_JSON_BYTES,
  measureCanonicalJsonUtf8Bounded,
} from '@/lib/map/authored-layers';
import type {
  AuthoredLayer,
  AuthoredLayerValidationError,
} from '@/lib/map/authored-layers';
import { parseAuthoredLayer } from '@/lib/schemas/authored-layer';

// ---------------------------------------------------------------------------
// Shared entry schemas
// ---------------------------------------------------------------------------

/**
 * Bounding box `[west, south, east, north]`.
 *
 * `strictTuple` rejects inputs with the wrong arity (extra entries are NOT
 * silently dropped, as they would be with `v.tuple`). Longitude entries (west,
 * east) are constrained to the WGS-84 range `[-180, 180]` and latitude entries
 * (south, north) to `[-90, 90]`; each element also uses `v.finite()` because
 * `v.number()` accepts `Infinity`/`-Infinity`, which are nonsensical map bounds.
 * The cross-element `west <= east` and `south <= north` constraints are
 * enforced by `v.check` since neither can be expressed as a per-entry pipe.
 * Without these guards an inverted or out-of-range bbox (e.g. a vertical
 * extent like `[-73, 10, -70, -10]` where south > north) validates and then
 * misleads downstream map display / tile download code.
 */
const longitudeEntry = v.pipe(
  v.number(),
  v.finite(),
  v.minValue(-180),
  v.maxValue(180),
);
const latitudeEntry = v.pipe(
  v.number(),
  v.finite(),
  v.minValue(-90),
  v.maxValue(90),
);
const bboxSchema = v.pipe(
  v.strictTuple([longitudeEntry, latitudeEntry, longitudeEntry, latitudeEntry]),
  v.check(
    ([west, , east]) => west <= east,
    'bbox west must be less than or equal to east',
  ),
  // Tuple layout is [west, south, east, north]. Reject an inverted vertical
  // extent (e.g. [-73, 10, -70, -10], where south > north) that would pass the
  // per-entry range and west<=east checks but mislead downstream map display /
  // tile download code.
  v.check(
    ([, south, , north]) => south <= north,
    'bbox south must be less than or equal to north',
  ),
);

/** Integer zoom level within the standard web-mercator range 0–22. */
const zoomSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.maxValue(22),
);

const statusSchema = v.union([
  v.literal('draft'),
  v.literal('downloading'),
  v.literal('ready'),
  v.literal('error'),
]);

const authoredLayerSchema = v.pipe(
  v.unknown(),
  v.rawTransform(({ dataset, addIssue, NEVER }) => {
    try {
      return parseAuthoredLayer(dataset.value);
    } catch {
      addIssue({
        message: 'SavedMap.layers must contain canonical AuthoredLayer values',
      });
      return NEVER;
    }
  }),
);

const authoredLayerArraySchema = v.array(authoredLayerSchema);

const authoredLayersSchema = v.pipe(
  v.unknown(),
  v.rawTransform(({ dataset, addIssue, NEVER }) => {
    const value = dataset.value;
    if (!Array.isArray(value)) {
      addIssue({ message: 'SavedMap.layers must be an array' });
      return NEVER;
    }
    // This declared-length guard intentionally runs before v.array parses any
    // element. Persisted/adaptor input must not perform O(n) deep validation on
    // a collection that already exceeds the hard V1 layer-count boundary.
    if (value.length > MAX_AUTHORED_LAYERS) {
      addIssue({
        message: `SavedMap.layers supports at most ${MAX_AUTHORED_LAYERS} authored layers`,
      });
      return NEVER;
    }

    const parsed = v.safeParse(authoredLayerArraySchema, value);
    if (!parsed.success) {
      addIssue({
        message: 'SavedMap.layers must contain canonical AuthoredLayer values',
      });
      return NEVER;
    }
    const layers = parsed.output;
    if (new Set(layers.map((layer) => layer.id)).size !== layers.length) {
      addIssue({
        message: 'SavedMap.layers must contain unique authored layer IDs',
      });
      return NEVER;
    }

    let aggregateBytes = 0n;
    for (const layer of layers) {
      const measured = measureCanonicalJsonUtf8Bounded(layer, {
        maxBytes: MAX_AUTHORED_LAYERS_JSON_BYTES,
      });
      if (!measured.ok) {
        addIssue({
          message: `SavedMap.layers exceeds ${MAX_AUTHORED_LAYERS_JSON_BYTES} aggregate UTF-8 JSON bytes`,
        });
        return NEVER;
      }
      aggregateBytes += measured.bytes;
      if (aggregateBytes > BigInt(MAX_AUTHORED_LAYERS_JSON_BYTES)) {
        addIssue({
          message: `SavedMap.layers exceeds ${MAX_AUTHORED_LAYERS_JSON_BYTES} aggregate UTF-8 JSON bytes`,
        });
        return NEVER;
      }
    }
    return layers;
  }),
);

/**
 * Scalar fields shared by both map types.
 *
 * `smpBlob` and `smpSize` are deliberately excluded from this scalar schema.
 * `smpBlob` is a transient import/legacy runtime field; current package bytes
 * live in separate IndexedDB package/chunk tables. `smpSize` is persisted map
 * metadata but is preserved outside this validation boundary.
 */
const baseFields = {
  id: v.string(),
  projectLocalId: v.string(),
  name: v.pipe(v.string(), v.minLength(1)),
  bbox: bboxSchema,
  minZoom: zoomSchema,
  maxZoom: zoomSchema,
  attribution: v.optional(v.string()),
  origin: v.optional(v.union([v.literal('authored'), v.literal('imported')])),
  layers: v.optional(authoredLayersSchema),
  status: statusSchema,
  errorMessage: v.optional(v.string()),
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
  updatedAt: v.pipe(v.string(), v.isoTimestamp()),
};

// `maxZoom` must be at least `minZoom`. Applied to each variant below.
const zoomOrderMessage = 'maxZoom must be greater than or equal to minZoom';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const rasterSchema = v.pipe(
  v.object({
    ...baseFields,
    type: v.literal('raster'),
    styleUrl: v.pipe(v.string(), v.minLength(1)),
    scheme: v.optional(v.union([v.literal('xyz'), v.literal('tms')])),
  }),
  v.check(
    (value) => value.origin !== 'imported',
    'imported SMP records must use style map type',
  ),
  v.check((value) => value.maxZoom >= value.minZoom, zoomOrderMessage),
);

// Package bytes are intentionally outside this scalar schema. Imported records
// are identified explicitly by origin and must be ready with an empty styleUrl;
// runtime consumers resolve their package from the separate package/chunk store
// (or a legacy `smpBlob` when present).
const styleSchema = v.pipe(
  v.object({
    ...baseFields,
    type: v.literal('style'),
    styleUrl: v.string(),
  }),
  v.check(
    (value) =>
      value.origin === 'imported'
        ? value.styleUrl.length === 0 && value.status === 'ready'
        : value.styleUrl.length > 0,
    'imported SMP records must be ready with an empty styleUrl; authored style maps require a styleUrl',
  ),
  v.check((value) => value.maxZoom >= value.minZoom, zoomOrderMessage),
);

/**
 * Validates the scalar fields of a `SavedMap`.
 *
 * Discriminated on `type`: `scheme` is validated only for raster maps. For
 * style maps any `scheme` value is ignored (valibot objects strip unknown
 * entries), matching the `SavedMap` interface's "raster only" contract.
 * Warning: validate for acceptance only; do not persist parse output when runtime fields (`smpBlob`, `smpSize`) or a stripped style-map `scheme` must be preserved.
 */
export const savedMapSchema = v.variant('type', [rasterSchema, styleSchema]);

export type SavedMapInput = v.InferInput<typeof savedMapSchema>;

// ---------------------------------------------------------------------------
// Authoring read boundary (lossless recovery)
// ---------------------------------------------------------------------------

/**
 * Author-editable scalar fields for a saved map, as accepted by the authoring
 * write constructor. Zooms and the map type/style are always sourced from the
 * current draft — never from the stored row — so a commit cannot silently
 * resurrect stale stored values the editor no longer shows.
 */
export type SavedMapAuthoringDraftFields = Pick<
  SavedMap,
  'name' | 'type' | 'styleUrl' | 'bbox' | 'minZoom' | 'maxZoom'
> & {
  attribution?: string;
  scheme?: 'xyz' | 'tms';
};

/** One stored `layers` entry after the independent per-entry parse pass. */
export type AuthoredLayerReadEntry =
  | { status: 'valid'; index: number; layer: AuthoredLayer }
  | {
      status: 'invalid';
      index: number;
      raw: unknown;
      error: AuthoredLayerValidationError;
    };

/**
 * Draft-model entry for the authoring editor, in exact stored raw order.
 *
 * Valid entries carry a stable `layer:<id>` key. Individually-invalid entries
 * (corrupt, future schemaVersion, or duplicate-ID) are retained as lossless
 * recovery entries keyed by their original stored index so the advanced editor
 * can offer raw-JSON recovery without ever discarding user data.
 */
export type AuthoredLayerDraftEntry =
  | { kind: 'valid'; key: `layer:${string}`; layer: AuthoredLayer }
  | {
      kind: 'invalid';
      key: `invalid:${number}`;
      originalIndex: number;
      raw: unknown;
      error: AuthoredLayerValidationError;
    };

/**
 * A physical persisted SavedMap row before authoring validation. `layers` is
 * deliberately `unknown[]` here: at read time individual entries may be corrupt
 * or written by a future schema version, and the authoring boundary must be
 * able to represent that instead of failing the whole row.
 */
export type SavedMapStorageRow = Omit<SavedMap, 'layers'> & {
  layers?: unknown[];
  [key: string]: unknown;
};

/** A canonical row produced by the authoring write constructor. */
export type CanonicalSavedMapStorageRow = SavedMap & Record<string, unknown>;

// Module-private runtime symbol: a `declare const` unique symbol has no
// runtime value, but the parser must mint the marker for real. A private
// symbol keeps the brand unforgeable outside this module while preserving the
// nominal `unique symbol` typing.
const validatedSavedMapStorageSnapshotBrand = Symbol(
  'validatedSavedMapStorageSnapshot',
);

/**
 * Runtime proof that a storage row passed `parseSavedMapForAuthoring`. The
 * brand can only be minted by a successful parse, so downstream write paths
 * cannot accidentally ingest unvalidated (or imported) rows.
 */
export type ValidatedSavedMapStorageSnapshot = {
  readonly [validatedSavedMapStorageSnapshotBrand]: true;
  readonly row: SavedMapStorageRow;
};

export type SavedMapReadSuccess = {
  ok: true;
  snapshot: ValidatedSavedMapStorageSnapshot;
  map: SavedMap;
  layerEntries: AuthoredLayerReadEntry[];
  draftEntries: AuthoredLayerDraftEntry[];
};

export type SavedMapReadFailure = {
  ok: false;
  rawInput: unknown;
  error: {
    code: 'SAVED_MAP_INVALID' | 'SAVED_MAP_NOT_AUTHORABLE';
    issues: readonly {
      path: readonly (string | number)[];
      code: string;
      message: string;
    }[];
  };
};

export type ParseSavedMapForAuthoringResult =
  SavedMapReadSuccess | SavedMapReadFailure;

/**
 * Key ownership for the authoring write constructor. Every own enumerable key
 * of a storage row is either immutable identity, authoring-editable, or
 * package-lifecycle state; anything else is an unknown passthrough key that
 * must survive a write value-identically (forward compatibility).
 */
export const SAVED_MAP_IMMUTABLE_KEYS = [
  'id',
  'projectLocalId',
  'origin',
  'createdAt',
] as const;

export const SAVED_MAP_EDITABLE_AUTHORING_KEYS = [
  'name',
  'type',
  'styleUrl',
  'bbox',
  'minZoom',
  'maxZoom',
  'attribution',
  'scheme',
  'layers',
] as const;

export const SAVED_MAP_PACKAGE_LIFECYCLE_KEYS = [
  'status',
  'errorMessage',
  'updatedAt',
  'smpBlob',
  'smpSize',
] as const;

export const SAVED_MAP_AUTHORING_OWNED_KEYS: readonly (
  | (typeof SAVED_MAP_EDITABLE_AUTHORING_KEYS)[number]
  | (typeof SAVED_MAP_PACKAGE_LIFECYCLE_KEYS)[number]
)[] = [
  ...SAVED_MAP_EDITABLE_AUTHORING_KEYS,
  ...SAVED_MAP_PACKAGE_LIFECYCLE_KEYS,
];

/**
 * Strict shape for the draft fields accepted by the authoring write
 * constructor. `strictObject` rejects unknown keys so callers cannot smuggle
 * lifecycle state (`status`, `smpBlob`, …) through a cast; cross-field variant
 * rules (raster styleUrl, zoom order) are enforced when the assembled row is
 * validated against `savedMapSchema`.
 */
export const savedMapAuthoringDraftFieldsSchema = v.strictObject({
  name: baseFields.name,
  type: v.union([v.literal('raster'), v.literal('style')]),
  styleUrl: v.string(),
  bbox: baseFields.bbox,
  minZoom: baseFields.minZoom,
  maxZoom: baseFields.maxZoom,
  attribution: baseFields.attribution,
  scheme: v.optional(v.union([v.literal('xyz'), v.literal('tms')])),
});

// Raw-read variants mirror the strict raster/style variant rules exactly but
// treat `layers` as untrusted unknowns: a corrupt or future-version layer entry
// must surface as an invalid recovery entry, not fail the whole row. Keep the
// checks in sync with rasterSchema/styleSchema above.
const rasterStorageRowSchema = v.pipe(
  v.object({
    ...baseFields,
    layers: v.optional(v.array(v.unknown())),
    type: v.literal('raster'),
    styleUrl: v.pipe(v.string(), v.minLength(1)),
    scheme: v.optional(v.union([v.literal('xyz'), v.literal('tms')])),
  }),
  v.check(
    (value) => value.origin !== 'imported',
    'imported SMP records must use style map type',
  ),
  v.check((value) => value.maxZoom >= value.minZoom, zoomOrderMessage),
);

const styleStorageRowSchema = v.pipe(
  v.object({
    ...baseFields,
    layers: v.optional(v.array(v.unknown())),
    type: v.literal('style'),
    styleUrl: v.string(),
  }),
  v.check(
    (value) =>
      value.origin === 'imported'
        ? value.styleUrl.length === 0 && value.status === 'ready'
        : value.styleUrl.length > 0,
    'imported SMP records must be ready with an empty styleUrl; authored style maps require a styleUrl',
  ),
  v.check((value) => value.maxZoom >= value.minZoom, zoomOrderMessage),
);

const savedMapStorageRowSchema = v.variant('type', [
  rasterStorageRowSchema,
  styleStorageRowSchema,
]);

// A crafted row can only carry these as own enumerable keys (a JSON.parse'd or
// Dexie row cannot), but rejecting them here keeps the passthrough copy in the
// write constructor from ever propagating a prototype-pollution payload.
const DANGEROUS_PASSTHROUGH_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'prototype',
  'constructor',
]);

function valibotIssuePaths(issues: readonly v.GenericIssue[]): {
  path: readonly (string | number)[];
  code: string;
  message: string;
}[] {
  return issues.map((entry) => ({
    path: (entry.path ?? []).flatMap((item) =>
      typeof item.key === 'string' || typeof item.key === 'number'
        ? [item.key]
        : [],
    ),
    code: entry.type ?? 'schema',
    message: entry.message,
  }));
}

function savedMapInvalid(
  rawInput: unknown,
  issues: readonly {
    path: readonly (string | number)[];
    code: string;
    message: string;
  }[],
): SavedMapReadFailure {
  return { ok: false, rawInput, error: { code: 'SAVED_MAP_INVALID', issues } };
}

/**
 * Lossless authoring read of a persisted SavedMap storage row.
 *
 * Non-layer fields are validated with the strict map rules (runtime-only
 * `smpBlob`/`smpSize` guarded separately), while `layers` entries are parsed
 * independently so a corrupt or future-version entry degrades to an invalid
 * recovery entry instead of failing the row. Individually-valid entries that
 * share an id all become invalid recovery entries — duplicates never enter
 * `map.layers` nor claim a `layer:<id>` draft key, keeping every valid draft
 * key unique by construction. On success the branded snapshot preserves the
 * EXACT original row object (unknown passthrough keys included) for
 * value-identical round-trip writes.
 */
export function parseSavedMapForAuthoring(
  input: unknown,
): ParseSavedMapForAuthoringResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return savedMapInvalid(input, [
      {
        path: [],
        code: 'invalid-input',
        message: 'SavedMap storage row must be a non-null non-array object',
      },
    ]);
  }
  const record = input as Record<string, unknown>;
  const dangerousKey = Object.keys(record).find((key) =>
    DANGEROUS_PASSTHROUGH_KEYS.has(key),
  );
  if (dangerousKey !== undefined) {
    return savedMapInvalid(input, [
      {
        path: [dangerousKey],
        code: 'dangerous-key',
        message: `SavedMap storage row must not carry an own "${dangerousKey}" key`,
      },
    ]);
  }

  const outer = v.safeParse(savedMapStorageRowSchema, input);
  if (!outer.success) {
    return savedMapInvalid(input, valibotIssuePaths(outer.issues));
  }

  // Runtime-only fields are excluded from the record schema, so they are
  // guarded here where the read boundary can still cite the exact key path.
  if (record.smpBlob !== undefined && !(record.smpBlob instanceof Blob)) {
    return savedMapInvalid(input, [
      {
        path: ['smpBlob'],
        code: 'invalid-smp-blob',
        message: 'SavedMap.smpBlob must be a Blob instance when present',
      },
    ]);
  }
  if (
    record.smpSize !== undefined &&
    (typeof record.smpSize !== 'number' ||
      !Number.isFinite(record.smpSize) ||
      record.smpSize < 0)
  ) {
    return savedMapInvalid(input, [
      {
        path: ['smpSize'],
        code: 'invalid-smp-size',
        message:
          'SavedMap.smpSize must be a finite non-negative number when present',
      },
    ]);
  }

  if (record.origin === 'imported') {
    // Imported SMP records have no authoring source of truth; never mint the
    // branded snapshot for them.
    return {
      ok: false,
      rawInput: input,
      error: {
        code: 'SAVED_MAP_NOT_AUTHORABLE',
        issues: [
          {
            path: ['origin'],
            code: 'not-authorable',
            message:
              'Imported saved maps cannot be opened in the authoring editor',
          },
        ],
      },
    };
  }

  const rawLayers = Array.isArray(record.layers) ? record.layers : [];
  const parsedEntries = rawLayers.map((raw) => {
    try {
      return { ok: true as const, layer: parseAuthoredLayer(raw) };
    } catch (error) {
      if (error instanceof AuthoredLayerValidationThrown) {
        return {
          ok: false as const,
          error: {
            code: 'AUTHORED_LAYER_INVALID' as const,
            issues: error.issues,
          },
        };
      }
      return {
        ok: false as const,
        error: {
          code: 'AUTHORED_LAYER_INVALID' as const,
          issues: [
            {
              path: [],
              code: 'unknown-error',
              message: 'Authored layer entry failed validation',
            },
          ],
        },
      };
    }
  });

  const occurrencesById = new Map<string, number>();
  for (const entry of parsedEntries) {
    if (!entry.ok) continue;
    occurrencesById.set(
      entry.layer.id,
      (occurrencesById.get(entry.layer.id) ?? 0) + 1,
    );
  }

  const layerEntries: AuthoredLayerReadEntry[] = [];
  const draftEntries: AuthoredLayerDraftEntry[] = [];
  const validLayers: AuthoredLayer[] = [];
  rawLayers.forEach((raw, index) => {
    const parsed = parsedEntries[index]!;
    if (parsed.ok && (occurrencesById.get(parsed.layer.id) ?? 0) > 1) {
      // Every occurrence of a duplicated id is invalid: no occurrence is
      // "first wins", because picking one would silently reorder authority
      // over user data during recovery.
      const error: AuthoredLayerValidationError = {
        code: 'AUTHORED_LAYER_INVALID',
        issues: [
          {
            path: ['id'],
            code: 'duplicate-id',
            message: `Authored layer ID ${parsed.layer.id} appears more than once in the stored layers collection`,
          },
        ],
      };
      layerEntries.push({ status: 'invalid', index, raw, error });
      draftEntries.push({
        kind: 'invalid',
        key: `invalid:${index}`,
        originalIndex: index,
        raw,
        error,
      });
      return;
    }
    if (parsed.ok) {
      layerEntries.push({ status: 'valid', index, layer: parsed.layer });
      draftEntries.push({
        kind: 'valid',
        key: `layer:${parsed.layer.id}`,
        layer: parsed.layer,
      });
      validLayers.push(parsed.layer);
      return;
    }
    layerEntries.push({ status: 'invalid', index, raw, error: parsed.error });
    draftEntries.push({
      kind: 'invalid',
      key: `invalid:${index}`,
      originalIndex: index,
      raw,
      error: parsed.error,
    });
  });

  const row = input as SavedMapStorageRow;
  return {
    ok: true,
    snapshot: {
      [validatedSavedMapStorageSnapshotBrand]: true,
      row,
    },
    map: { ...row, layers: validLayers } as SavedMap,
    layerEntries,
    draftEntries,
  };
}
