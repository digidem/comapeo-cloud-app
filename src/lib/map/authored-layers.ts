import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';

import { normalizeGeoJson } from '@/lib/map/geojson-overlays';
// Intentional boundary cycle: the schema imports only authored model bindings and
// dereferences them inside validation calls, while this module calls the schema
// only after module initialization. If either side ever needs a cross-module
// value during top-level evaluation, extract the shared model into a third module.
import { validateAuthoredLayerInput } from '@/lib/schemas/authored-layer';

export const AUTHORED_LAYER_SCHEMA_VERSION = 1 as const;

export const SUPPORTED_AUTHORED_LAYER_SOURCE_TYPES = [
  'geojson',
  'raster-tiles',
] as const;
export const SUPPORTED_AUTHORED_LAYER_RENDER_TYPES = [
  'fill',
  'line',
  'circle',
  'symbol',
  'raster',
] as const;

export type SupportedAuthoredLayerSourceType =
  (typeof SUPPORTED_AUTHORED_LAYER_SOURCE_TYPES)[number];
export type SupportedAuthoredLayerRenderType =
  (typeof SUPPORTED_AUTHORED_LAYER_RENDER_TYPES)[number];

export const MAX_AUTHORED_LAYERS = 128;
export const MAX_AUTHORED_LAYER_JSON_BYTES = 6 * 1024 * 1024;
export const MAX_AUTHORED_LAYERS_JSON_BYTES = 20 * 1024 * 1024;
export const MAX_AUTHORED_RENDER_JSON_BYTES = 256 * 1024;
export const MAX_AUTHORED_RENDER_FRAGMENTS = 16;
export const MAX_AUTHORED_VECTOR_FEATURES = 50_000;
export const MAX_AUTHORED_JSON_STRING_BYTES = 256 * 1024;
export const MAX_AUTHORED_JSON_DEPTH = 64;
export const MAX_AUTHORED_JSON_NODES_PER_LAYER = 1_000_000;

export const MAX_BASE_STYLE_JSON_BYTES_FOR_AUTHORED = 8 * 1024 * 1024;
export const MAX_FINAL_STYLE_BYTES = 32 * 1024 * 1024;
export const MAX_AUTHORED_WRITER_OUTPUT_BYTES = 128 * 1024 * 1024;

export const AUTHORED_LAYER_ID_PREFIX = 'comapeo-authored:' as const;

export type AuthoredRenderLayer = {
  type: SupportedAuthoredLayerRenderType;
  filter?: readonly unknown[];
  minzoom?: number;
  maxzoom?: number;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
};

export type AuthoredRender = {
  layers: AuthoredRenderLayer[];
};

export type GeoJsonAuthoredSource = {
  type: 'geojson';
  data: FeatureCollection<Geometry, GeoJsonProperties>;
};

export type RasterTilesAuthoredSource = {
  type: 'raster-tiles';
  tiles: [string];
  tileSize: 256 | 512;
  scheme: 'xyz' | 'tms';
  minZoom?: number;
  maxZoom?: number;
  attribution?: string;
};

export type AuthoredLayerSource =
  GeoJsonAuthoredSource | RasterTilesAuthoredSource;

/** The canonical persisted authored-layer union for schemaVersion 1. */
export type AuthoredLayer = {
  schemaVersion: typeof AUTHORED_LAYER_SCHEMA_VERSION;
  id: string;
  name: string;
  visible: boolean;
  source: AuthoredLayerSource;
  render: AuthoredRender;
};

export type AuthoredLayerValidationIssue = {
  code: string;
  path: readonly (string | number)[];
  message: string;
};

export type AuthoredLayerValidationError = {
  code: 'AUTHORED_LAYER_INVALID';
  issues: readonly AuthoredLayerValidationIssue[];
};

export class AuthoredLayerValidationThrown extends Error {
  readonly code = 'AUTHORED_LAYER_INVALID' as const;
  readonly issues: readonly AuthoredLayerValidationIssue[];

  constructor(issues: readonly AuthoredLayerValidationIssue[]) {
    const first = issues[0];
    super(
      first
        ? `Authored layer is invalid: ${first.code}: ${first.message}`
        : 'Authored layer is invalid',
    );
    this.name = 'AuthoredLayerValidationThrown';
    this.issues = issues;
  }
}

export type AuthoredLayerCommitContext = {
  minZoom: number;
  maxZoom: number;
  /** IDs already present outside the candidate set for append/import operations. */
  reservedIds?: ReadonlySet<string>;
};

export type PrepareAuthoredLayerResult =
  | { ok: true; layer: AuthoredLayer }
  | { ok: false; error: AuthoredLayerValidationError };

export type PrepareAuthoredLayerBatchResult =
  | { ok: true; layers: AuthoredLayer[] }
  | {
      ok: false;
      errors: readonly {
        index: number;
        candidateId?: string;
        error: AuthoredLayerValidationError;
      }[];
    };

export type CanonicalJsonMeasurementLimits = {
  maxBytes: number;
  maxDepth: number;
  maxNodes: number;
  maxStringBytes: number;
};

export type CanonicalJsonMeasurementResult =
  | { ok: true; bytes: bigint; nodes: number }
  | {
      ok: false;
      code:
        | 'MAX_BYTES'
        | 'MAX_DEPTH'
        | 'MAX_NODES'
        | 'MAX_STRING_BYTES'
        | 'UNSUPPORTED_VALUE'
        | 'CYCLE';
      message: string;
    };

const DEFAULT_JSON_LIMITS: CanonicalJsonMeasurementLimits = {
  maxBytes: MAX_AUTHORED_LAYER_JSON_BYTES,
  maxDepth: MAX_AUTHORED_JSON_DEPTH,
  maxNodes: MAX_AUTHORED_JSON_NODES_PER_LAYER,
  maxStringBytes: MAX_AUTHORED_JSON_STRING_BYTES,
};

const textEncoder = new TextEncoder();
const DANGEROUS_JSON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function encodedJsonStringBytes(value: string): bigint {
  return BigInt(textEncoder.encode(JSON.stringify(value)).byteLength);
}

function rawStringBytes(value: string): number {
  return textEncoder.encode(value).byteLength;
}

function isPlainJsonObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownEnumerableKeys(
  value: Record<string, unknown>,
): Generator<string, void, void> {
  return (function* enumerate() {
    for (const key in value) {
      if (Object.hasOwn(value, key)) yield key;
    }
  })();
}

type JsonMeasureFrame =
  | { kind: 'value'; value: unknown; depth: number }
  | {
      kind: 'array';
      value: unknown[];
      depth: number;
      index: number;
    }
  | {
      kind: 'object';
      value: Record<string, unknown>;
      depth: number;
      iterator: Generator<string, void, void>;
      emitted: number;
    }
  | { kind: 'leave'; value: object };

/**
 * Measure exact JSON UTF-8 bytes without materializing a complete JSON string
 * or a complete object-key list. Only canonical JSON values are accepted.
 */
function measureCanonicalJsonUtf8BoundedInternal(
  value: unknown,
  limits: Partial<CanonicalJsonMeasurementLimits> = {},
): CanonicalJsonMeasurementResult {
  const resolved: CanonicalJsonMeasurementLimits = {
    ...DEFAULT_JSON_LIMITS,
    ...limits,
  };
  if (
    !Number.isSafeInteger(resolved.maxBytes) ||
    resolved.maxBytes < 0 ||
    !Number.isSafeInteger(resolved.maxDepth) ||
    resolved.maxDepth < 0 ||
    !Number.isSafeInteger(resolved.maxNodes) ||
    resolved.maxNodes < 1 ||
    !Number.isSafeInteger(resolved.maxStringBytes) ||
    resolved.maxStringBytes < 0
  ) {
    return {
      ok: false,
      code: 'UNSUPPORTED_VALUE',
      message: 'JSON measurement limits must be non-negative safe integers',
    };
  }

  let bytes = 0n;
  let nodes = 0;
  const active = new WeakSet<object>();
  const stack: JsonMeasureFrame[] = [{ kind: 'value', value, depth: 0 }];

  const addBytes = (
    amount: bigint,
  ): CanonicalJsonMeasurementResult | undefined => {
    bytes += amount;
    if (bytes > BigInt(resolved.maxBytes)) {
      return {
        ok: false,
        code: 'MAX_BYTES',
        message: `JSON exceeds ${resolved.maxBytes} UTF-8 bytes`,
      };
    }
    return undefined;
  };

  const addNode = (): CanonicalJsonMeasurementResult | undefined => {
    nodes += 1;
    if (nodes > resolved.maxNodes) {
      return {
        ok: false,
        code: 'MAX_NODES',
        message: `JSON exceeds ${resolved.maxNodes} nodes`,
      };
    }
    return undefined;
  };

  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame) break;

    if (frame.kind === 'leave') {
      active.delete(frame.value);
      continue;
    }

    if (frame.kind === 'array') {
      if (frame.index >= frame.value.length) continue;
      const descriptor = Object.getOwnPropertyDescriptor(
        frame.value,
        String(frame.index),
      );
      if (!descriptor) {
        return {
          ok: false,
          code: 'UNSUPPORTED_VALUE',
          message: 'Sparse arrays are not canonical JSON values',
        };
      }
      if (!('value' in descriptor)) {
        return {
          ok: false,
          code: 'UNSUPPORTED_VALUE',
          message:
            'Accessor-backed array entries are not canonical JSON values',
        };
      }
      if (frame.index > 0) {
        const failed = addBytes(1n);
        if (failed) return failed;
      }
      const item = descriptor.value;
      stack.push({ ...frame, index: frame.index + 1 });
      stack.push({ kind: 'value', value: item, depth: frame.depth + 1 });
      continue;
    }

    if (frame.kind === 'object') {
      const next = frame.iterator.next();
      if (next.done) continue;
      const key = next.value;
      const keyNodeFailure = addNode();
      if (keyNodeFailure) return keyNodeFailure;
      if (DANGEROUS_JSON_KEYS.has(key)) {
        return {
          ok: false,
          code: 'UNSUPPORTED_VALUE',
          message: `Dangerous JSON key is not allowed: ${key}`,
        };
      }
      if (rawStringBytes(key) > resolved.maxStringBytes) {
        return {
          ok: false,
          code: 'MAX_STRING_BYTES',
          message: `JSON key exceeds ${resolved.maxStringBytes} UTF-8 bytes`,
        };
      }
      if (frame.emitted > 0) {
        const commaFailure = addBytes(1n);
        if (commaFailure) return commaFailure;
      }
      const keyFailure = addBytes(encodedJsonStringBytes(key) + 1n);
      if (keyFailure) return keyFailure;

      // Read only data descriptors after the key has consumed its node/byte
      // budget. Accessors are not canonical JSON and must never execute here.
      const descriptor = Object.getOwnPropertyDescriptor(frame.value, key);
      if (!descriptor || !('value' in descriptor)) {
        return {
          ok: false,
          code: 'UNSUPPORTED_VALUE',
          message:
            'Accessor-backed object properties are not canonical JSON values',
        };
      }
      const child = descriptor.value;
      stack.push({ ...frame, emitted: frame.emitted + 1 });
      stack.push({ kind: 'value', value: child, depth: frame.depth + 1 });
      continue;
    }

    const nodeFailure = addNode();
    if (nodeFailure) return nodeFailure;
    if (frame.depth > resolved.maxDepth) {
      return {
        ok: false,
        code: 'MAX_DEPTH',
        message: `JSON exceeds maximum depth ${resolved.maxDepth}`,
      };
    }

    const current = frame.value;
    if (current === null) {
      const failed = addBytes(4n);
      if (failed) return failed;
      continue;
    }
    if (typeof current === 'boolean') {
      const failed = addBytes(current ? 4n : 5n);
      if (failed) return failed;
      continue;
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) {
        return {
          ok: false,
          code: 'UNSUPPORTED_VALUE',
          message: 'Non-finite numbers are not canonical JSON values',
        };
      }
      const failed = addBytes(BigInt(String(current).length));
      if (failed) return failed;
      continue;
    }
    if (typeof current === 'string') {
      if (rawStringBytes(current) > resolved.maxStringBytes) {
        return {
          ok: false,
          code: 'MAX_STRING_BYTES',
          message: `JSON string exceeds ${resolved.maxStringBytes} UTF-8 bytes`,
        };
      }
      const failed = addBytes(encodedJsonStringBytes(current));
      if (failed) return failed;
      continue;
    }
    if (
      typeof current === 'undefined' ||
      typeof current === 'function' ||
      typeof current === 'symbol' ||
      typeof current === 'bigint'
    ) {
      return {
        ok: false,
        code: 'UNSUPPORTED_VALUE',
        message: `${typeof current} is not a canonical JSON value`,
      };
    }
    if (typeof current !== 'object') {
      return {
        ok: false,
        code: 'UNSUPPORTED_VALUE',
        message: 'Unsupported JSON value',
      };
    }

    if (active.has(current)) {
      return {
        ok: false,
        code: 'CYCLE',
        message: 'Cyclic objects are not canonical JSON values',
      };
    }
    active.add(current);
    stack.push({ kind: 'leave', value: current });

    if (Array.isArray(current)) {
      if (current.length > resolved.maxNodes - nodes) {
        return {
          ok: false,
          code: 'MAX_NODES',
          message: 'Array length exceeds remaining JSON node budget',
        };
      }
      const openFailure = addBytes(1n);
      if (openFailure) return openFailure;
      const closeFailure = addBytes(1n);
      if (closeFailure) return closeFailure;
      stack.push({
        kind: 'array',
        value: current,
        depth: frame.depth,
        index: 0,
      });
      continue;
    }

    if (!isPlainJsonObject(current)) {
      return {
        ok: false,
        code: 'UNSUPPORTED_VALUE',
        message: 'Class instances are not canonical JSON objects',
      };
    }
    if (Object.getOwnPropertySymbols(current).length > 0) {
      return {
        ok: false,
        code: 'UNSUPPORTED_VALUE',
        message: 'Objects with symbol keys are not canonical JSON objects',
      };
    }
    const openFailure = addBytes(1n);
    if (openFailure) return openFailure;
    const closeFailure = addBytes(1n);
    if (closeFailure) return closeFailure;
    stack.push({
      kind: 'object',
      value: current,
      depth: frame.depth,
      iterator: ownEnumerableKeys(current),
      emitted: 0,
    });
  }

  return { ok: true, bytes, nodes };
}

export function measureCanonicalJsonUtf8Bounded(
  value: unknown,
  limits: Partial<CanonicalJsonMeasurementLimits> = {},
): CanonicalJsonMeasurementResult {
  try {
    return measureCanonicalJsonUtf8BoundedInternal(value, limits);
  } catch {
    return {
      ok: false,
      code: 'UNSUPPORTED_VALUE',
      message: 'JSON value could not be inspected safely',
    };
  }
}

export function sourceLayerIdForAuthoredLayer(layerId: string): string {
  return `${AUTHORED_LAYER_ID_PREFIX}${layerId}:source`;
}

export function fragmentLayerIdForAuthoredLayer(
  layerId: string,
  fragmentIndex: number,
): string {
  if (!Number.isSafeInteger(fragmentIndex) || fragmentIndex < 0) {
    throw new RangeError(
      'Authored fragment index must be a non-negative integer',
    );
  }
  return `${AUTHORED_LAYER_ID_PREFIX}${layerId}:layer:${fragmentIndex}`;
}

/** Deterministic authored raster resource namespace. */
export async function sourceFolderForAuthoredLayer(
  layerId: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    textEncoder.encode(layerId),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `comapeo-authored-${hex}`;
}

const RASTER_SENTINELS = {
  z: '__COMAPEO_Z__',
  x: '__COMAPEO_X__',
  y: '__COMAPEO_Y__',
} as const;

function validateAnonymousRasterUrl(url: URL): void {
  if (url.protocol !== 'https:') {
    throw new Error('Authored raster tile templates must use HTTPS');
  }
  if (url.username || url.password) {
    throw new Error(
      'Authored raster tile templates cannot contain credentials',
    );
  }
  if (url.search || url.hash) {
    throw new Error(
      'Authored raster tile templates cannot contain query or fragment data',
    );
  }
  const hostname = url.hostname.toLowerCase();
  if (
    !hostname ||
    hostname === 'localhost' ||
    !hostname.includes('.') ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.home.arpa') ||
    hostname.includes(':') ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
  ) {
    throw new Error(
      'Authored raster tile templates require an external DNS hostname',
    );
  }
}

/**
 * Canonicalize the V1 anonymous raster template using sentinels before WHATWG
 * URL parsing so literal tile placeholders survive serialization.
 */
export function canonicalizeRasterTileTemplate(rawTemplate: string): string {
  const firstCode = rawTemplate.charCodeAt(0);
  const lastCode = rawTemplate.charCodeAt(rawTemplate.length - 1);
  const hasUnsafeEdge =
    firstCode <= 0x20 ||
    firstCode === 0x7f ||
    lastCode <= 0x20 ||
    lastCode === 0x7f;
  if (rawTemplate.length === 0 || hasUnsafeEdge) {
    throw new Error(
      'Raster template contains leading/trailing ASCII whitespace or control characters',
    );
  }
  if (
    rawTemplate.includes(RASTER_SENTINELS.z) ||
    rawTemplate.includes(RASTER_SENTINELS.x) ||
    rawTemplate.includes(RASTER_SENTINELS.y)
  ) {
    throw new Error('Raster template contains a reserved CoMapeo sentinel');
  }

  const counts = { z: 0, x: 0, y: 0 };
  for (let index = 0; index < rawTemplate.length; index += 1) {
    const char = rawTemplate[index];
    if (char === '}') {
      throw new Error('Raster template contains an unmatched closing brace');
    }
    if (char !== '{') continue;
    const closing = rawTemplate.indexOf('}', index + 1);
    if (closing < 0) {
      throw new Error('Raster template contains an unmatched opening brace');
    }
    const token = rawTemplate.slice(index, closing + 1);
    if (token !== '{z}' && token !== '{x}' && token !== '{y}') {
      throw new Error(`Unsupported raster template token: ${token}`);
    }
    if (rawTemplate.slice(index + 1, closing).includes('{')) {
      throw new Error('Raster template contains nested braces');
    }
    counts[token[1] as keyof typeof counts] += 1;
    index = closing;
  }
  if (counts.z !== 1 || counts.x !== 1 || counts.y !== 1) {
    throw new Error(
      'Raster template must contain exactly one {z}, {x}, and {y} placeholder',
    );
  }

  const sentineled = rawTemplate
    .replace('{z}', RASTER_SENTINELS.z)
    .replace('{x}', RASTER_SENTINELS.x)
    .replace('{y}', RASTER_SENTINELS.y);
  let url: URL;
  try {
    url = new URL(sentineled);
  } catch (cause) {
    throw new Error('Raster template is not a valid URL', { cause });
  }
  validateAnonymousRasterUrl(url);

  for (const sentinel of Object.values(RASTER_SENTINELS)) {
    if (url.pathname.split(sentinel).length !== 2) {
      throw new Error(
        'Raster placeholders must occur exactly once in the URL pathname',
      );
    }
    const outsidePath = `${url.protocol}${url.username}${url.password}${url.hostname}${url.port}${url.search}${url.hash}`;
    if (outsidePath.includes(sentinel)) {
      throw new Error(
        'Raster placeholders are only allowed in the URL pathname',
      );
    }
  }

  return url.href
    .replace(RASTER_SENTINELS.z, '{z}')
    .replace(RASTER_SENTINELS.x, '{x}')
    .replace(RASTER_SENTINELS.y, '{y}');
}

function candidateId(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return undefined;
  }
  const id = (input as Record<string, unknown>).id;
  return typeof id === 'string' ? id : undefined;
}

function compareIssuePaths(
  a: AuthoredLayerValidationIssue,
  b: AuthoredLayerValidationIssue,
): number {
  const length = Math.max(a.path.length, b.path.length);
  for (let index = 0; index < length; index += 1) {
    if (index >= a.path.length) return -1;
    if (index >= b.path.length) return 1;
    const left = String(a.path[index]);
    const right = String(b.path[index]);
    const compared = left.localeCompare(right);
    if (compared !== 0) return compared;
  }
  return a.code.localeCompare(b.code);
}

export function prepareAuthoredLayer(
  input: unknown,
  context: AuthoredLayerCommitContext,
): PrepareAuthoredLayerResult {
  const result = validateAuthoredLayerInput(input, {
    mode: 'prepare',
    context,
  });
  if (!result.ok) {
    return {
      ok: false,
      error: {
        code: 'AUTHORED_LAYER_INVALID',
        issues: [...result.issues].sort(compareIssuePaths),
      },
    };
  }
  return { ok: true, layer: result.layer };
}

export function prepareAuthoredLayerBatch(
  inputs: readonly unknown[],
  context: AuthoredLayerCommitContext,
): PrepareAuthoredLayerBatchResult {
  if (inputs.length > MAX_AUTHORED_LAYERS) {
    return {
      ok: false,
      errors: [
        {
          index: MAX_AUTHORED_LAYERS,
          error: {
            code: 'AUTHORED_LAYER_INVALID',
            issues: [
              {
                code: 'MAX_AUTHORED_LAYERS_EXCEEDED',
                path: [],
                message: `Authored maps support at most ${MAX_AUTHORED_LAYERS} layers`,
              },
            ],
          },
        },
      ],
    };
  }

  let aggregateBytes = 0n;
  const errors: Array<{
    index: number;
    candidateId?: string;
    error: AuthoredLayerValidationError;
  }> = [];
  const layers: AuthoredLayer[] = [];
  const firstIndexById = new Map<string, number>();

  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    const id = candidateId(input);
    const duplicateIssue: AuthoredLayerValidationIssue | undefined =
      id !== undefined && firstIndexById.has(id)
        ? {
            code: 'DUPLICATE_ID_WITHIN_BATCH',
            path: ['id'],
            message: `Authored layer ID ${id} appears more than once in the batch`,
          }
        : undefined;
    if (id !== undefined && !duplicateIssue) firstIndexById.set(id, index);

    const measured = measureCanonicalJsonUtf8Bounded(input, {
      maxBytes: MAX_AUTHORED_LAYER_JSON_BYTES,
      maxDepth: MAX_AUTHORED_JSON_DEPTH,
      maxNodes: MAX_AUTHORED_JSON_NODES_PER_LAYER,
      maxStringBytes: MAX_AUTHORED_JSON_STRING_BYTES,
    });
    if (!measured.ok) {
      errors.push({
        index,
        ...(id === undefined ? {} : { candidateId: id }),
        error: {
          code: 'AUTHORED_LAYER_INVALID',
          issues: [
            ...(duplicateIssue ? [duplicateIssue] : []),
            {
              code: `JSON_${measured.code}`,
              path: [],
              message: measured.message,
            },
          ],
        },
      });
      continue;
    }
    aggregateBytes += measured.bytes;
    if (aggregateBytes > BigInt(MAX_AUTHORED_LAYERS_JSON_BYTES)) {
      errors.push({
        index,
        ...(id === undefined ? {} : { candidateId: id }),
        error: {
          code: 'AUTHORED_LAYER_INVALID',
          issues: [
            ...(duplicateIssue ? [duplicateIssue] : []),
            {
              code: 'MAX_AUTHORED_LAYERS_JSON_BYTES_EXCEEDED',
              path: [],
              message: `Authored layer collection exceeds ${MAX_AUTHORED_LAYERS_JSON_BYTES} UTF-8 bytes`,
            },
          ],
        },
      });
      continue;
    }

    const prepared = prepareAuthoredLayer(input, context);
    if (!prepared.ok) {
      errors.push({
        index,
        ...(id === undefined ? {} : { candidateId: id }),
        error: {
          code: 'AUTHORED_LAYER_INVALID',
          issues: [
            ...(duplicateIssue ? [duplicateIssue] : []),
            ...prepared.error.issues,
          ],
        },
      });
      continue;
    }
    if (duplicateIssue) {
      errors.push({
        index,
        ...(id === undefined ? {} : { candidateId: id }),
        error: {
          code: 'AUTHORED_LAYER_INVALID',
          issues: [duplicateIssue],
        },
      });
      continue;
    }
    layers.push(prepared.layer);
  }

  if (errors.length > 0) {
    errors.sort((left, right) => left.index - right.index);
    return { ok: false, errors };
  }
  return { ok: true, layers };
}

export type CreateGeoJsonAuthoredLayerOptions = {
  name?: string;
  visible?: boolean;
};

function canonicalizeNormalizedGeometry(geometry: Geometry): Geometry {
  switch (geometry.type) {
    case 'Point':
      return { type: 'Point', coordinates: geometry.coordinates };
    case 'MultiPoint':
      return { type: 'MultiPoint', coordinates: geometry.coordinates };
    case 'LineString':
      return { type: 'LineString', coordinates: geometry.coordinates };
    case 'MultiLineString':
      return { type: 'MultiLineString', coordinates: geometry.coordinates };
    case 'Polygon':
      return { type: 'Polygon', coordinates: geometry.coordinates };
    case 'MultiPolygon':
      return { type: 'MultiPolygon', coordinates: geometry.coordinates };
    case 'GeometryCollection':
      // normalizeGeoJson() flattens collections before returning. Keep this
      // branch defensive so a future normalizer change cannot silently persist
      // a geometry outside the schema-v1 contract.
      throw new Error(
        'Normalized authored GeoJSON cannot contain GeometryCollection',
      );
  }
}

function canonicalizeNormalizedGeoJson(
  normalized: FeatureCollection<Geometry, GeoJsonProperties>,
): FeatureCollection<Geometry, GeoJsonProperties> {
  return {
    type: 'FeatureCollection',
    features: normalized.features.map((feature) => ({
      type: 'Feature',
      properties: feature.properties,
      geometry: canonicalizeNormalizedGeometry(feature.geometry),
      ...(feature.id === undefined ? {} : { id: feature.id }),
    })),
  };
}

/**
 * Construct a new CoMapeo-authored GeoJSON layer and immediately pass it
 * through the canonical commit-capability boundary. External IDs are never
 * accepted for new layers.
 */
export function createGeoJsonAuthoredLayer(
  normalizedInput: unknown,
  context: AuthoredLayerCommitContext,
  options: CreateGeoJsonAuthoredLayerOptions = {},
): PrepareAuthoredLayerResult {
  const rawMeasurement = measureCanonicalJsonUtf8Bounded(normalizedInput, {
    maxBytes: MAX_AUTHORED_LAYER_JSON_BYTES,
    maxDepth: MAX_AUTHORED_JSON_DEPTH,
    maxNodes: MAX_AUTHORED_JSON_NODES_PER_LAYER,
    maxStringBytes: MAX_AUTHORED_JSON_STRING_BYTES,
  });
  if (!rawMeasurement.ok) {
    return {
      ok: false,
      error: {
        code: 'AUTHORED_LAYER_INVALID',
        issues: [
          {
            code: `JSON_${rawMeasurement.code}`,
            path: ['source', 'data'],
            message: rawMeasurement.message,
          },
        ],
      },
    };
  }
  const normalized = canonicalizeNormalizedGeoJson(
    normalizeGeoJson(normalizedInput),
  );
  const candidate: AuthoredLayer = {
    schemaVersion: AUTHORED_LAYER_SCHEMA_VERSION,
    id: crypto.randomUUID(),
    name: options.name ?? 'GeoJSON layer',
    visible: options.visible ?? true,
    source: { type: 'geojson', data: normalized },
    render: { layers: defaultGeoJsonRenderLayers() },
  };
  return prepareAuthoredLayer(candidate, context);
}

function defaultGeoJsonRenderLayers(): AuthoredRenderLayer[] {
  const stroke = {
    'line-color': '#04145C',
    'line-width': 2.5,
    'line-opacity': 0.95,
  };
  return [
    {
      type: 'fill',
      filter: ['in', '$type', 'Polygon'],
      paint: { 'fill-color': '#1F6FFF', 'fill-opacity': 0.35 },
    },
    {
      type: 'line',
      filter: ['in', '$type', 'Polygon'],
      paint: { ...stroke },
    },
    {
      type: 'line',
      filter: ['in', '$type', 'LineString'],
      paint: { ...stroke },
    },
    {
      type: 'circle',
      filter: ['in', '$type', 'Point'],
      paint: { 'circle-color': '#E45D2A', 'circle-radius': 5 },
    },
  ];
}
