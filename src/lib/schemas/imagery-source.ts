import * as v from 'valibot';

export const basemapCategorySchema = v.picklist([
  'street',
  'satellite',
  'topographic',
  'dark',
]);

/**
 * Validates a tile URL which may contain ELI template placeholders:
 * - {z}, {x}, {y} — standard slippy map coordinates
 * - {zoom} — ELI alias for {z}
 * - {switch:a,b,c} — server load balancing
 * - {-y} — TMS inverted Y
 * - {quadkey} — Bing quadkey
 * - {bbox-epsg-3857} — WMS bbox
 */
const tileUrlSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.check((url) => {
    // Must start with https:// or http:// (possibly with template placeholders in hostname)
    return /^https?:\/\//.test(url);
  }, 'URL must start with http:// or https://'),
);

const styleUrlSchema = v.pipe(
  v.string(),
  v.url(),
  v.check(
    (url) => !/[{}]/.test(url),
    'Style URLs must not contain tile template placeholders',
  ),
);

const commonBasemapFields = {
  id: v.string(),
  name: v.string(),
  category: basemapCategorySchema,
  attribution: v.optional(v.string()),
  maxZoom: v.optional(v.number()),
  minZoom: v.optional(v.number()),
  tileSize: v.optional(v.picklist([256, 512])),
  bounds: v.optional(v.tuple([v.number(), v.number(), v.number(), v.number()])),
};

export const imageryBasemapSchema = v.variant('type', [
  v.object({
    ...commonBasemapFields,
    type: v.literal('raster'),
    url: tileUrlSchema,
    /**
     * Tile scheme for raster sources. Set to 'tms' for TMS services where
     * Y coordinates are inverted (or URL uses {-y}). MapLibre will flip
     * the Y coordinate at request time. Omit for standard XYZ (slippy map) tiles.
     */
    scheme: v.optional(v.picklist(['xyz', 'tms'])),
  }),
  v.object({
    ...commonBasemapFields,
    type: v.literal('style'),
    url: styleUrlSchema,
  }),
]);

export type ImageryBasemap = v.InferOutput<typeof imageryBasemapSchema>;
export type BasemapId = ImageryBasemap['id'];
export type BasemapCategory = ImageryBasemap['category'];
