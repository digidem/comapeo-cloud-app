import {
  type StyleSpecification,
  validateStyleMin,
} from '@maplibre/maplibre-gl-style-spec';
import type { Position } from 'geojson';
import * as v from 'valibot';

import {
  AUTHORED_LAYER_SCHEMA_VERSION,
  type AuthoredLayer,
  type AuthoredLayerCommitContext,
  type AuthoredLayerValidationIssue,
  AuthoredLayerValidationThrown,
  type AuthoredRenderLayer,
  MAX_AUTHORED_JSON_DEPTH,
  MAX_AUTHORED_JSON_NODES_PER_LAYER,
  MAX_AUTHORED_JSON_STRING_BYTES,
  MAX_AUTHORED_LAYER_JSON_BYTES,
  MAX_AUTHORED_RENDER_FRAGMENTS,
  MAX_AUTHORED_RENDER_JSON_BYTES,
  MAX_AUTHORED_VECTOR_FEATURES,
  SUPPORTED_AUTHORED_LAYER_RENDER_TYPES,
  SUPPORTED_AUTHORED_LAYER_SOURCE_TYPES,
  canonicalizeRasterTileTemplate,
  measureCanonicalJsonUtf8Bounded,
} from '@/lib/map/authored-layers';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const EXPRESSION_OPERATORS = new Set([
  'get',
  'has',
  'literal',
  'coalesce',
  'match',
  'case',
  'interpolate',
  'step',
  'to-string',
  'to-number',
  'concat',
  'format',
  'number-format',
  'at',
  'length',
  'slice',
  'upcase',
  'downcase',
  '==',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  'all',
  'any',
  '!',
  '+',
  '-',
  '*',
  '/',
  '%',
  '^',
  'min',
  'max',
  'round',
  'abs',
  'sqrt',
  'ln',
  'log10',
  'zoom',
  'geometry-type',
]);

const FILTER_OPERATORS = new Set([
  'all',
  'any',
  'none',
  '!',
  '==',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  'in',
  '!in',
  'has',
  '!has',
]);

const PAINT_PROPERTIES: Record<
  AuthoredRenderLayer['type'],
  ReadonlySet<string>
> = {
  fill: new Set([
    'fill-antialias',
    'fill-color',
    'fill-opacity',
    'fill-outline-color',
    'fill-translate',
    'fill-translate-anchor',
  ]),
  line: new Set([
    'line-blur',
    'line-color',
    'line-dasharray',
    'line-gap-width',
    'line-offset',
    'line-opacity',
    'line-pattern',
    'line-translate',
    'line-translate-anchor',
    'line-width',
  ]),
  circle: new Set([
    'circle-blur',
    'circle-color',
    'circle-opacity',
    'circle-pitch-alignment',
    'circle-pitch-scale',
    'circle-radius',
    'circle-stroke-color',
    'circle-stroke-opacity',
    'circle-stroke-width',
    'circle-translate',
    'circle-translate-anchor',
  ]),
  symbol: new Set([
    'icon-color',
    'icon-halo-blur',
    'icon-halo-color',
    'icon-halo-width',
    'icon-opacity',
    'text-color',
    'text-halo-blur',
    'text-halo-color',
    'text-halo-width',
    'text-opacity',
  ]),
  raster: new Set([
    'raster-opacity',
    'raster-hue-rotate',
    'raster-brightness-min',
    'raster-brightness-max',
    'raster-saturation',
    'raster-contrast',
    'raster-fade-duration',
    'raster-resampling',
  ]),
};

const LAYOUT_PROPERTIES: Record<
  AuthoredRenderLayer['type'],
  ReadonlySet<string>
> = {
  fill: new Set([]),
  line: new Set([
    'line-cap',
    'line-join',
    'line-miter-limit',
    'line-round-limit',
  ]),
  circle: new Set([]),
  symbol: new Set([
    'symbol-placement',
    'symbol-spacing',
    'icon-image',
    'icon-size',
    'icon-rotate',
    'icon-allow-overlap',
    'text-field',
    'text-font',
    'text-size',
    'text-offset',
    'text-anchor',
    'text-rotate',
    'text-allow-overlap',
  ]),
  raster: new Set([]),
};

export type InternalAuthoredLayerValidationResult =
  | { ok: true; layer: AuthoredLayer; measuredBytes: bigint }
  | { ok: false; issues: AuthoredLayerValidationIssue[] };

export type InternalAuthoredLayerValidationOptions = {
  mode: 'prepare' | 'parse';
  context?: AuthoredLayerCommitContext;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function issue(
  code: string,
  path: readonly (string | number)[],
  message: string,
): AuthoredLayerValidationIssue {
  return { code, path, message };
}

function compareIssues(
  left: AuthoredLayerValidationIssue,
  right: AuthoredLayerValidationIssue,
): number {
  const length = Math.max(left.path.length, right.path.length);
  for (let index = 0; index < length; index += 1) {
    if (index >= left.path.length) return -1;
    if (index >= right.path.length) return 1;
    const compared = String(left.path[index]).localeCompare(
      String(right.path[index]),
    );
    if (compared !== 0) return compared;
  }
  return left.code.localeCompare(right.code);
}

function valibotPath(
  path: readonly { key?: unknown }[] | undefined,
): readonly (string | number)[] {
  if (!path) return [];
  return path.flatMap((entry) =>
    typeof entry.key === 'string' || typeof entry.key === 'number'
      ? [entry.key]
      : [],
  );
}

function buildCurrentLayerSchema() {
  const positionSchema = v.pipe(
    v.array(v.number()),
    v.minLength(2),
    v.check((coords): coords is Position => {
      const longitude = coords[0];
      const latitude = coords[1];
      return (
        coords.every(Number.isFinite) &&
        typeof longitude === 'number' &&
        longitude >= -180 &&
        longitude <= 180 &&
        typeof latitude === 'number' &&
        latitude >= -90 &&
        latitude <= 90
      );
    }, 'Position must contain finite WGS-84 coordinates'),
  );
  const lineSchema = v.pipe(v.array(positionSchema), v.minLength(2));
  const ringSchema = v.pipe(
    v.array(positionSchema),
    v.minLength(4),
    v.check((ring) => {
      const first = ring[0];
      const last = ring.at(-1);
      return Boolean(
        first && last && first[0] === last[0] && first[1] === last[1],
      );
    }, 'Polygon ring must be closed'),
  );
  const polygonCoordinatesSchema = v.pipe(v.array(ringSchema), v.minLength(1));
  const geometrySchema = v.union([
    v.strictObject({ type: v.literal('Point'), coordinates: positionSchema }),
    v.strictObject({
      type: v.literal('MultiPoint'),
      coordinates: v.pipe(v.array(positionSchema), v.minLength(1)),
    }),
    v.strictObject({
      type: v.literal('LineString'),
      coordinates: lineSchema,
    }),
    v.strictObject({
      type: v.literal('MultiLineString'),
      coordinates: v.pipe(v.array(lineSchema), v.minLength(1)),
    }),
    v.strictObject({
      type: v.literal('Polygon'),
      coordinates: polygonCoordinatesSchema,
    }),
    v.strictObject({
      type: v.literal('MultiPolygon'),
      coordinates: v.pipe(v.array(polygonCoordinatesSchema), v.minLength(1)),
    }),
  ]);
  const featureSchema = v.strictObject({
    type: v.literal('Feature'),
    properties: v.union([v.record(v.string(), v.unknown()), v.null_()]),
    geometry: geometrySchema,
    id: v.optional(v.union([v.string(), v.number()])),
  });
  const featureCollectionSchema = v.strictObject({
    type: v.literal('FeatureCollection'),
    features: v.array(featureSchema),
  });
  const geoJsonSourceSchema = v.strictObject({
    type: v.literal(SUPPORTED_AUTHORED_LAYER_SOURCE_TYPES[0]),
    data: featureCollectionSchema,
  });
  const zoomSchema = v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(22),
  );
  const rasterSourceSchema = v.strictObject({
    type: v.literal(SUPPORTED_AUTHORED_LAYER_SOURCE_TYPES[1]),
    tiles: v.tuple([v.pipe(v.string(), v.minLength(1))]),
    tileSize: v.union([v.literal(256), v.literal(512)]),
    scheme: v.union([v.literal('xyz'), v.literal('tms')]),
    minZoom: v.optional(zoomSchema),
    maxZoom: v.optional(zoomSchema),
    attribution: v.optional(v.string()),
  });
  const fragmentZoomSchema = v.pipe(v.number(), v.minValue(0), v.maxValue(24));
  const renderFragmentSchema = v.strictObject({
    type: v.picklist(SUPPORTED_AUTHORED_LAYER_RENDER_TYPES),
    filter: v.optional(v.array(v.unknown())),
    minzoom: v.optional(fragmentZoomSchema),
    maxzoom: v.optional(fragmentZoomSchema),
    paint: v.optional(v.record(v.string(), v.unknown())),
    layout: v.optional(v.record(v.string(), v.unknown())),
  });
  return v.strictObject({
    schemaVersion: v.literal(AUTHORED_LAYER_SCHEMA_VERSION),
    id: v.pipe(
      v.string(),
      v.regex(UUID_V4_REGEX, 'id must be a canonical lowercase UUIDv4'),
    ),
    name: v.pipe(v.string(), v.minLength(1)),
    visible: v.boolean(),
    source: v.union([geoJsonSourceSchema, rasterSourceSchema]),
    render: v.strictObject({
      layers: v.pipe(
        v.array(renderFragmentSchema),
        v.minLength(1),
        v.maxLength(MAX_AUTHORED_RENDER_FRAGMENTS),
      ),
    }),
  });
}

function isSupportedExpression(value: unknown, depth = 0): boolean {
  if (depth > 32) return false;
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true;
  }
  if (!Array.isArray(value) || value.length === 0) return false;
  const operator = value[0];
  if (typeof operator !== 'string') return false;
  if (operator === 'literal') return value.length === 2;
  if (operator === 'interpolate') {
    if (value.length < 6) return false;
    const interpolation = value[1];
    if (
      !Array.isArray(interpolation) ||
      (interpolation[0] !== 'linear' && interpolation[0] !== 'exponential')
    ) {
      return false;
    }
    return value
      .slice(2)
      .every((item) => isSupportedExpression(item, depth + 1));
  }
  if (!EXPRESSION_OPERATORS.has(operator)) return false;
  return value.slice(1).every((item) => isSupportedExpression(item, depth + 1));
}

function isSupportedFilter(value: readonly unknown[]): boolean {
  if (value.length < 2 || typeof value[0] !== 'string') return false;
  const operator = value[0];
  if (!FILTER_OPERATORS.has(operator)) return false;
  if (
    operator === 'in' &&
    value.length === 3 &&
    value[1] === '$type' &&
    (value[2] === 'Point' ||
      value[2] === 'LineString' ||
      value[2] === 'Polygon')
  ) {
    return true;
  }
  if ((operator === 'has' || operator === '!has') && value.length !== 2) {
    return false;
  }
  if (
    (operator === '==' ||
      operator === '!=' ||
      operator === '<' ||
      operator === '<=' ||
      operator === '>' ||
      operator === '>=') &&
    value.length !== 3
  ) {
    return false;
  }
  if ((operator === 'in' || operator === '!in') && value.length < 3) {
    return false;
  }
  if (operator === '!' && value.length !== 2) return false;
  return value.slice(1).every((entry) => {
    if (Array.isArray(entry)) return isSupportedFilter(entry);
    return (
      entry === null ||
      typeof entry === 'string' ||
      typeof entry === 'boolean' ||
      (typeof entry === 'number' && Number.isFinite(entry))
    );
  });
}

function validateMapLibreFragment(fragment: AuthoredRenderLayer): string[] {
  const source =
    fragment.type === 'raster'
      ? {
          type: 'raster' as const,
          tiles: ['https://tiles.example.com/{z}/{x}/{y}.png'],
          tileSize: 256,
        }
      : {
          type: 'geojson' as const,
          data: { type: 'FeatureCollection' as const, features: [] },
        };
  const style = {
    version: 8 as const,
    sources: { '__comapeo-authored-validation-source': source },
    layers: [
      {
        id: '__comapeo-authored-validation-layer',
        source: '__comapeo-authored-validation-source',
        ...fragment,
      },
    ],
  };
  return validateStyleMin(style as unknown as StyleSpecification).map(
    (error) => error.message,
  );
}

function validateRenderSubset(
  layer: AuthoredLayer,
  mode: 'prepare' | 'parse',
): {
  layer: AuthoredLayer;
  issues: AuthoredLayerValidationIssue[];
} {
  const issues: AuthoredLayerValidationIssue[] = [];
  const canonicalFragments: AuthoredRenderLayer[] = [];

  for (let index = 0; index < layer.render.layers.length; index += 1) {
    const fragment = layer.render.layers[index]!;
    const path = ['render', 'layers', index] as const;
    if (layer.source.type === 'geojson' && fragment.type === 'raster') {
      issues.push(
        issue(
          'RENDER_SOURCE_MISMATCH',
          [...path, 'type'],
          'GeoJSON authored layers cannot use raster render fragments',
        ),
      );
    }
    if (layer.source.type === 'raster-tiles' && fragment.type !== 'raster') {
      issues.push(
        issue(
          'RENDER_SOURCE_MISMATCH',
          [...path, 'type'],
          'Raster authored layers only support raster render fragments',
        ),
      );
    }
    if (
      fragment.minzoom !== undefined &&
      fragment.maxzoom !== undefined &&
      fragment.maxzoom < fragment.minzoom
    ) {
      issues.push(
        issue(
          'INVALID_RENDER_ZOOM_RANGE',
          [...path, 'maxzoom'],
          'Render maxzoom must be greater than or equal to minzoom',
        ),
      );
    }
    if (fragment.filter) {
      if (fragment.type === 'raster') {
        issues.push(
          issue(
            'UNSUPPORTED_RENDER_FILTER',
            [...path, 'filter'],
            'Raster render fragments do not support filters',
          ),
        );
      } else if (!isSupportedFilter(fragment.filter)) {
        issues.push(
          issue(
            'UNSUPPORTED_RENDER_FILTER',
            [...path, 'filter'],
            'Render filter is outside the schemaVersion 1 allowlist',
          ),
        );
      }
    }

    for (const [property, value] of Object.entries(fragment.paint ?? {})) {
      if (!PAINT_PROPERTIES[fragment.type].has(property)) {
        issues.push(
          issue(
            'UNSUPPORTED_PAINT_PROPERTY',
            [...path, 'paint', property],
            `Unsupported ${fragment.type} paint property: ${property}`,
          ),
        );
      } else if (
        Array.isArray(value) &&
        !(
          property === 'line-dasharray' &&
          value.every(
            (entry) => typeof entry === 'number' && Number.isFinite(entry),
          )
        ) &&
        !isSupportedExpression(value)
      ) {
        issues.push(
          issue(
            'UNSUPPORTED_PAINT_EXPRESSION',
            [...path, 'paint', property],
            `Unsupported expression for ${property}`,
          ),
        );
      }
    }

    const inputLayout = fragment.layout ?? {};
    if (Object.hasOwn(inputLayout, 'visibility')) {
      if (mode === 'parse') {
        issues.push(
          issue(
            'FRAGMENT_VISIBILITY_NOT_CANONICAL',
            [...path, 'layout', 'visibility'],
            'Fragment visibility is derived from AuthoredLayer.visible and is not persisted',
          ),
        );
      }
    }
    const canonicalLayout: Record<string, unknown> = {};
    for (const [property, value] of Object.entries(inputLayout)) {
      if (property === 'visibility') continue;
      if (!LAYOUT_PROPERTIES[fragment.type].has(property)) {
        issues.push(
          issue(
            'UNSUPPORTED_LAYOUT_PROPERTY',
            [...path, 'layout', property],
            `Unsupported ${fragment.type} layout property: ${property}`,
          ),
        );
      } else if (Array.isArray(value) && !isSupportedExpression(value)) {
        const rawStringArray =
          property === 'text-font' &&
          value.every((entry) => typeof entry === 'string');
        const rawNumberArray =
          property === 'text-offset' &&
          value.every(
            (entry) => typeof entry === 'number' && Number.isFinite(entry),
          );
        if (!rawStringArray && !rawNumberArray) {
          issues.push(
            issue(
              'UNSUPPORTED_LAYOUT_EXPRESSION',
              [...path, 'layout', property],
              `Unsupported expression for ${property}`,
            ),
          );
        }
      }
      canonicalLayout[property] = value;
    }

    const { layout: _persistedLayout, ...fragmentWithoutLayout } = fragment;
    const canonicalFragment: AuthoredRenderLayer = {
      ...fragmentWithoutLayout,
      ...(Object.keys(canonicalLayout).length > 0
        ? { layout: canonicalLayout }
        : {}),
    };
    const mapLibreErrors = validateMapLibreFragment(canonicalFragment);
    if (mapLibreErrors.length > 0) {
      issues.push(
        issue('INVALID_MAPLIBRE_RENDER_VALUE', path, mapLibreErrors.join('; ')),
      );
    }
    canonicalFragments.push(canonicalFragment);
  }

  return {
    layer: {
      ...layer,
      render: { layers: canonicalFragments },
    },
    issues,
  };
}

function validateRasterSource(
  layer: AuthoredLayer,
  options: InternalAuthoredLayerValidationOptions,
): {
  layer: AuthoredLayer;
  issues: AuthoredLayerValidationIssue[];
} {
  if (layer.source.type !== 'raster-tiles') return { layer, issues: [] };
  const issues: AuthoredLayerValidationIssue[] = [];
  const source = layer.source;
  if (
    source.minZoom !== undefined &&
    source.maxZoom !== undefined &&
    source.maxZoom < source.minZoom
  ) {
    issues.push(
      issue(
        'INVALID_RASTER_ZOOM_RANGE',
        ['source', 'maxZoom'],
        'Raster maxZoom must be greater than or equal to minZoom',
      ),
    );
  }

  let canonicalTemplate = source.tiles[0];
  try {
    canonicalTemplate = canonicalizeRasterTileTemplate(source.tiles[0]);
    if (options.mode === 'parse' && canonicalTemplate !== source.tiles[0]) {
      issues.push(
        issue(
          'RASTER_TEMPLATE_NOT_CANONICAL',
          ['source', 'tiles', 0],
          'Persisted raster tile template is not in canonical URL form',
        ),
      );
    }
  } catch (error) {
    issues.push(
      issue(
        'INVALID_RASTER_TEMPLATE',
        ['source', 'tiles', 0],
        error instanceof Error ? error.message : 'Invalid raster tile template',
      ),
    );
  }

  const context = options.context;
  if (context) {
    if (
      !Number.isInteger(context.minZoom) ||
      context.minZoom < 0 ||
      context.minZoom > 22 ||
      !Number.isInteger(context.maxZoom) ||
      context.maxZoom < 0 ||
      context.maxZoom > 22 ||
      context.maxZoom < context.minZoom
    ) {
      issues.push(
        issue(
          'INVALID_COMMIT_CONTEXT',
          [],
          'Commit context zooms must be integers in 0..22 with maxZoom >= minZoom',
        ),
      );
    } else {
      const effectiveMin = Math.max(
        context.minZoom,
        source.minZoom ?? context.minZoom,
      );
      const effectiveMax = Math.min(
        context.maxZoom,
        source.maxZoom ?? context.maxZoom,
      );
      if (effectiveMin > effectiveMax) {
        issues.push(
          issue(
            'EMPTY_RASTER_EFFECTIVE_ZOOM_RANGE',
            ['source'],
            'Raster source does not overlap the SavedMap zoom range',
          ),
        );
      }
    }
  }

  return {
    layer: {
      ...layer,
      source: {
        ...source,
        tiles: [canonicalTemplate],
      },
    },
    issues,
  };
}

/**
 * Shared non-throwing validation/migration boundary used by both strict reads
 * and commit preparation. V1 has no older supported persisted version yet.
 */
export function validateAuthoredLayerInput(
  input: unknown,
  options: InternalAuthoredLayerValidationOptions,
): InternalAuthoredLayerValidationResult {
  // Cheap declared-length guards run before walking a potentially enormous
  // candidate. They do not inspect nested values and therefore preserve the
  // bounded pre-materialization contract while failing pathological arrays
  // immediately.
  if (isPlainRecord(input)) {
    const rawRender = input.render;
    if (
      isPlainRecord(rawRender) &&
      Array.isArray(rawRender.layers) &&
      rawRender.layers.length > MAX_AUTHORED_RENDER_FRAGMENTS
    ) {
      return {
        ok: false,
        issues: [
          issue(
            'MAX_AUTHORED_RENDER_FRAGMENTS_EXCEEDED',
            ['render', 'layers'],
            `Render contains more than ${MAX_AUTHORED_RENDER_FRAGMENTS} fragments`,
          ),
        ],
      };
    }
    const rawSource = input.source;
    if (
      isPlainRecord(rawSource) &&
      rawSource.type === 'geojson' &&
      isPlainRecord(rawSource.data) &&
      Array.isArray(rawSource.data.features) &&
      rawSource.data.features.length > MAX_AUTHORED_VECTOR_FEATURES
    ) {
      return {
        ok: false,
        issues: [
          issue(
            'MAX_AUTHORED_VECTOR_FEATURES_EXCEEDED',
            ['source', 'data', 'features'],
            `GeoJSON contains more than ${MAX_AUTHORED_VECTOR_FEATURES} features`,
          ),
        ],
      };
    }
  }

  const measured = measureCanonicalJsonUtf8Bounded(input, {
    maxBytes: MAX_AUTHORED_LAYER_JSON_BYTES,
    maxDepth: MAX_AUTHORED_JSON_DEPTH,
    maxNodes: MAX_AUTHORED_JSON_NODES_PER_LAYER,
    maxStringBytes: MAX_AUTHORED_JSON_STRING_BYTES,
  });
  if (!measured.ok) {
    return {
      ok: false,
      issues: [issue(`JSON_${measured.code}`, [], measured.message)],
    };
  }

  if (!isPlainRecord(input)) {
    return {
      ok: false,
      issues: [
        issue(
          'INVALID_LAYER_TYPE',
          [],
          'Authored layer must be a plain object',
        ),
      ],
    };
  }
  if (input.schemaVersion !== AUTHORED_LAYER_SCHEMA_VERSION) {
    return {
      ok: false,
      issues: [
        issue(
          'UNSUPPORTED_SCHEMA_VERSION',
          ['schemaVersion'],
          `Only AuthoredLayer schemaVersion ${AUTHORED_LAYER_SCHEMA_VERSION} is supported`,
        ),
      ],
    };
  }

  const render = input.render;
  if (isPlainRecord(render)) {
    const renderMeasured = measureCanonicalJsonUtf8Bounded(render, {
      maxBytes: MAX_AUTHORED_RENDER_JSON_BYTES,
      maxDepth: MAX_AUTHORED_JSON_DEPTH,
      maxNodes: MAX_AUTHORED_JSON_NODES_PER_LAYER,
      maxStringBytes: MAX_AUTHORED_JSON_STRING_BYTES,
    });
    if (!renderMeasured.ok) {
      return {
        ok: false,
        issues: [
          issue(
            `RENDER_JSON_${renderMeasured.code}`,
            ['render'],
            renderMeasured.message,
          ),
        ],
      };
    }
    if (
      Array.isArray(render.layers) &&
      render.layers.length > MAX_AUTHORED_RENDER_FRAGMENTS
    ) {
      return {
        ok: false,
        issues: [
          issue(
            'MAX_AUTHORED_RENDER_FRAGMENTS_EXCEEDED',
            ['render', 'layers'],
            `Render contains more than ${MAX_AUTHORED_RENDER_FRAGMENTS} fragments`,
          ),
        ],
      };
    }
  }

  const source = input.source;
  if (
    isPlainRecord(source) &&
    source.type === 'raster-tiles' &&
    (!Array.isArray(source.tiles) || source.tiles.length !== 1)
  ) {
    return {
      ok: false,
      issues: [
        issue(
          'RASTER_TILE_TEMPLATE_COUNT_INVALID',
          ['source', 'tiles'],
          'Raster sources must contain exactly one tile template',
        ),
      ],
    };
  }
  if (
    isPlainRecord(source) &&
    source.type === 'geojson' &&
    isPlainRecord(source.data) &&
    Array.isArray(source.data.features) &&
    source.data.features.length > MAX_AUTHORED_VECTOR_FEATURES
  ) {
    return {
      ok: false,
      issues: [
        issue(
          'MAX_AUTHORED_VECTOR_FEATURES_EXCEEDED',
          ['source', 'data', 'features'],
          `GeoJSON contains more than ${MAX_AUTHORED_VECTOR_FEATURES} features`,
        ),
      ],
    };
  }

  const parsed = v.safeParse(buildCurrentLayerSchema(), input);
  if (!parsed.success) {
    const issues = parsed.issues
      .map((entry) =>
        issue(
          'VALIBOT_SCHEMA',
          valibotPath(entry.path as readonly { key?: unknown }[] | undefined),
          entry.message,
        ),
      )
      .sort(compareIssues);
    return { ok: false, issues };
  }

  let layer = parsed.output as AuthoredLayer;
  const issues: AuthoredLayerValidationIssue[] = [];
  if (options.context?.reservedIds?.has(layer.id)) {
    issues.push(
      issue(
        'ID_COLLISION_RESERVED',
        ['id'],
        `Authored layer ID ${layer.id} collides with an existing draft layer`,
      ),
    );
  }

  const raster = validateRasterSource(layer, options);
  layer = raster.layer;
  issues.push(...raster.issues);

  const renderSubset = validateRenderSubset(layer, options.mode);
  layer = renderSubset.layer;
  issues.push(...renderSubset.issues);

  if (issues.length > 0) {
    issues.sort(compareIssues);
    return { ok: false, issues };
  }
  return { ok: true, layer, measuredBytes: measured.bytes };
}

export function parseAuthoredLayer(input: unknown): AuthoredLayer {
  const result = validateAuthoredLayerInput(input, { mode: 'parse' });
  if (!result.ok) {
    throw new AuthoredLayerValidationThrown(result.issues);
  }
  return result.layer;
}
