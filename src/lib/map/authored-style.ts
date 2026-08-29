import {
  type StyleSpecification,
  validateStyleMin,
} from '@maplibre/maplibre-gl-style-spec';

import {
  AUTHORED_LAYER_ID_PREFIX,
  type AuthoredLayer,
  type AuthoredLayerValidationIssue,
  AuthoredLayerValidationThrown,
  MAX_AUTHORED_JSON_DEPTH,
  MAX_AUTHORED_JSON_NODES_PER_LAYER,
  MAX_AUTHORED_JSON_STRING_BYTES,
  MAX_BASE_STYLE_JSON_BYTES_FOR_AUTHORED,
  MAX_FINAL_STYLE_BYTES,
  type RasterTilesAuthoredSource,
  fragmentLayerIdForAuthoredLayer,
  measureCanonicalJsonUtf8Bounded,
  prepareAuthoredLayerBatch,
  sourceLayerIdForAuthoredLayer,
} from '@/lib/map/authored-layers';

export type AuthoredStyleMapContext = {
  bbox: [number, number, number, number];
  minZoom: number;
  maxZoom: number;
};

export type MapLibreStyleLike = {
  version: number;
  sources: Record<string, Record<string, unknown>>;
  layers: Array<Record<string, unknown> & { id: string; source?: string }>;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

export type ComposedAuthoredStyle = {
  style: MapLibreStyleLike;
  layers: AuthoredLayer[];
  baseStyleUtf8Bytes: bigint;
  finalStyleUtf8Bytes: bigint;
};

export type AuthoredOnlyStyle = {
  style: MapLibreStyleLike;
  layers: AuthoredLayer[];
  rasterLayerIds: string[];
  finalStyleUtf8Bytes: bigint;
};

function styleError(message: string): Error {
  return new Error(`Authored style composition failed: ${message}`);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function parseBaseStyle(input: unknown): MapLibreStyleLike {
  if (!isPlainRecord(input) || input.version !== 8) {
    throw styleError('base style must be a MapLibre v8 object');
  }
  if (!isPlainRecord(input.sources) || !Array.isArray(input.layers)) {
    throw styleError('base style must contain sources and layers');
  }
  const sources: Record<string, Record<string, unknown>> = {};
  for (const [sourceId, source] of Object.entries(input.sources)) {
    if (!isPlainRecord(source)) {
      throw styleError(`base source ${sourceId} is not an object`);
    }
    sources[sourceId] = source;
  }
  const layers: MapLibreStyleLike['layers'] = [];
  for (const rawLayer of input.layers) {
    if (!isPlainRecord(rawLayer) || typeof rawLayer.id !== 'string') {
      throw styleError('base style layer is missing a string id');
    }
    layers.push(rawLayer as MapLibreStyleLike['layers'][number]);
  }
  return {
    ...(input as MapLibreStyleLike),
    sources,
    layers,
  };
}

function measureStyle(value: unknown, maxBytes: number, label: string): bigint {
  const measured = measureCanonicalJsonUtf8Bounded(value, {
    maxBytes,
    maxDepth: MAX_AUTHORED_JSON_DEPTH,
    maxNodes: MAX_AUTHORED_JSON_NODES_PER_LAYER,
    maxStringBytes: MAX_AUTHORED_JSON_STRING_BYTES,
  });
  if (!measured.ok) {
    throw styleError(
      `${label} exceeds the supported JSON boundary: ${measured.message}`,
    );
  }
  return measured.bytes;
}

export function assertValidMapLibreStyle(
  style: MapLibreStyleLike,
  label: string,
): void {
  const errors = validateStyleMin(style as unknown as StyleSpecification);
  if (errors.length === 0) return;
  const summary = errors
    .slice(0, 3)
    .map((error) => error.message)
    .join('; ');
  throw styleError(`${label} is not a valid MapLibre style: ${summary}`);
}

function prepareCompleteCollection(
  authoredLayers: readonly AuthoredLayer[],
  map: AuthoredStyleMapContext,
): AuthoredLayer[] {
  const prepared = prepareAuthoredLayerBatch(authoredLayers, {
    minZoom: map.minZoom,
    maxZoom: map.maxZoom,
  });
  if (!prepared.ok) {
    const issues: AuthoredLayerValidationIssue[] = prepared.errors.flatMap(
      ({ index, error }) =>
        error.issues.map((entry) => ({
          ...entry,
          path: [index, ...entry.path],
        })),
    );
    throw new AuthoredLayerValidationThrown(issues);
  }
  return prepared.layers;
}

function mapLibreSourceForAuthoredLayer(
  layer: AuthoredLayer,
  map: AuthoredStyleMapContext,
): Record<string, unknown> {
  if (layer.source.type === 'geojson') {
    return {
      type: 'geojson',
      data: layer.source.data,
    };
  }
  return mapLibreRasterSource(layer.source, map);
}

function mapLibreRasterSource(
  source: RasterTilesAuthoredSource,
  map: AuthoredStyleMapContext,
): Record<string, unknown> {
  const minzoom = Math.max(map.minZoom, source.minZoom ?? map.minZoom);
  const maxzoom = Math.min(map.maxZoom, source.maxZoom ?? map.maxZoom);
  return {
    type: 'raster',
    tiles: [...source.tiles],
    tileSize: source.tileSize,
    scheme: source.scheme,
    minzoom,
    maxzoom,
    ...(source.attribution === undefined
      ? {}
      : { attribution: source.attribution }),
  };
}

function mapLibreFragmentsForAuthoredLayer(
  layer: AuthoredLayer,
): MapLibreStyleLike['layers'] {
  const sourceId = sourceLayerIdForAuthoredLayer(layer.id);
  return layer.render.layers.map((fragment, fragmentIndex) => {
    const layout = {
      ...(fragment.layout ?? {}),
      visibility: layer.visible ? 'visible' : 'none',
    };
    return {
      id: fragmentLayerIdForAuthoredLayer(layer.id, fragmentIndex),
      type: fragment.type,
      source: sourceId,
      ...(fragment.filter === undefined ? {} : { filter: fragment.filter }),
      ...(fragment.minzoom === undefined ? {} : { minzoom: fragment.minzoom }),
      ...(fragment.maxzoom === undefined ? {} : { maxzoom: fragment.maxzoom }),
      ...(fragment.paint === undefined ? {} : { paint: fragment.paint }),
      layout,
    };
  });
}

function assertBaseNamespaceAvailable(
  baseStyle: MapLibreStyleLike,
  layers: readonly AuthoredLayer[],
): void {
  const sourceIds = new Set(Object.keys(baseStyle.sources));
  const layerIds = new Set(baseStyle.layers.map((layer) => layer.id));
  for (const sourceId of sourceIds) {
    if (sourceId.startsWith(AUTHORED_LAYER_ID_PREFIX)) {
      throw styleError(
        `base source uses reserved authored namespace: ${sourceId}`,
      );
    }
  }
  for (const layerId of layerIds) {
    if (layerId.startsWith(AUTHORED_LAYER_ID_PREFIX)) {
      throw styleError(
        `base layer uses reserved authored namespace: ${layerId}`,
      );
    }
  }
  for (const layer of layers) {
    const sourceId = sourceLayerIdForAuthoredLayer(layer.id);
    if (sourceIds.has(sourceId)) {
      throw styleError(`source ID collision: ${sourceId}`);
    }
    for (let index = 0; index < layer.render.layers.length; index += 1) {
      const runtimeLayerId = fragmentLayerIdForAuthoredLayer(layer.id, index);
      if (layerIds.has(runtimeLayerId)) {
        throw styleError(`layer ID collision: ${runtimeLayerId}`);
      }
    }
  }
}

export function composeAuthoredStyle(config: {
  baseStyle: unknown;
  authoredLayers: readonly AuthoredLayer[];
  map: AuthoredStyleMapContext;
}): ComposedAuthoredStyle {
  const baseStyleUtf8Bytes = measureStyle(
    config.baseStyle,
    MAX_BASE_STYLE_JSON_BYTES_FOR_AUTHORED,
    'base style',
  );
  const baseStyle = parseBaseStyle(config.baseStyle);
  assertValidMapLibreStyle(baseStyle, 'base style');
  const layers = prepareCompleteCollection(config.authoredLayers, config.map);
  assertBaseNamespaceAvailable(baseStyle, layers);

  const sources = { ...baseStyle.sources };
  const styleLayers = [...baseStyle.layers];
  for (const layer of layers) {
    const sourceId = sourceLayerIdForAuthoredLayer(layer.id);
    if (Object.hasOwn(sources, sourceId)) {
      throw styleError(`source ID collision: ${sourceId}`);
    }
    sources[sourceId] = mapLibreSourceForAuthoredLayer(layer, config.map);
    for (const fragment of mapLibreFragmentsForAuthoredLayer(layer)) {
      if (styleLayers.some((existing) => existing.id === fragment.id)) {
        throw styleError(`layer ID collision: ${fragment.id}`);
      }
      styleLayers.push(fragment);
    }
  }

  const style: MapLibreStyleLike = {
    ...baseStyle,
    sources,
    layers: styleLayers,
  };
  const finalStyleUtf8Bytes = measureStyle(
    style,
    MAX_FINAL_STYLE_BYTES,
    'prospective final style',
  );
  assertValidMapLibreStyle(style, 'prospective final style');
  return {
    style,
    layers,
    baseStyleUtf8Bytes,
    finalStyleUtf8Bytes,
  };
}

export function createAuthoredOnlyStyle(config: {
  authoredLayers: readonly AuthoredLayer[];
  map: AuthoredStyleMapContext;
}): AuthoredOnlyStyle {
  const layers = prepareCompleteCollection(config.authoredLayers, config.map);
  const sources: Record<string, Record<string, unknown>> = {};
  const styleLayers: MapLibreStyleLike['layers'] = [];
  const rasterLayerIds: string[] = [];

  for (const layer of layers) {
    const sourceId = sourceLayerIdForAuthoredLayer(layer.id);
    if (Object.hasOwn(sources, sourceId)) {
      throw styleError(`authored source collision: ${sourceId}`);
    }
    sources[sourceId] = mapLibreSourceForAuthoredLayer(layer, config.map);
    if (layer.source.type === 'raster-tiles') rasterLayerIds.push(layer.id);
    for (const fragment of mapLibreFragmentsForAuthoredLayer(layer)) {
      if (styleLayers.some((existing) => existing.id === fragment.id)) {
        throw styleError(`authored layer collision: ${fragment.id}`);
      }
      styleLayers.push(fragment);
    }
  }

  const style: MapLibreStyleLike = {
    version: 8,
    sources,
    layers: styleLayers,
  };
  const finalStyleUtf8Bytes = measureStyle(
    style,
    MAX_FINAL_STYLE_BYTES,
    'authored-only style',
  );
  assertValidMapLibreStyle(style, 'authored-only style');
  return { style, layers, rasterLayerIds, finalStyleUtf8Bytes };
}
