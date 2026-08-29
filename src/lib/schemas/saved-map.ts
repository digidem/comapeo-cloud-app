import * as v from 'valibot';

import {
  MAX_AUTHORED_LAYERS,
  MAX_AUTHORED_LAYERS_JSON_BYTES,
  measureCanonicalJsonUtf8Bounded,
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
