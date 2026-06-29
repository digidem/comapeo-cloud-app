import * as v from 'valibot';

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

/**
 * Scalar fields shared by both map types.
 *
 * `smpBlob` and `smpSize` are deliberately excluded — they are runtime-only
 * (the blob is written in Phase 1c once `status` reaches `'ready'`) and do not
 * round-trip through the schema boundary.
 */
const baseFields = {
  id: v.string(),
  projectLocalId: v.string(),
  name: v.pipe(v.string(), v.minLength(1)),
  styleUrl: v.string(),
  bbox: bboxSchema,
  minZoom: zoomSchema,
  maxZoom: zoomSchema,
  attribution: v.optional(v.string()),
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
    scheme: v.optional(v.union([v.literal('xyz'), v.literal('tms')])),
  }),
  v.check((value) => value.maxZoom >= value.minZoom, zoomOrderMessage),
);

const styleSchema = v.pipe(
  v.object({
    ...baseFields,
    type: v.literal('style'),
  }),
  v.check((value) => value.maxZoom >= value.minZoom, zoomOrderMessage),
);

/**
 * Validates the scalar fields of a `SavedMap`.
 *
 * Discriminated on `type`: `scheme` is validated only for raster maps. For
 * style maps any `scheme` value is ignored (valibot objects strip unknown
 * entries), matching the `SavedMap` interface's "raster only" contract.
 */
export const savedMapSchema = v.variant('type', [rasterSchema, styleSchema]);

export type SavedMapInput = v.InferInput<typeof savedMapSchema>;
