import JSZip from 'jszip';
import { download } from 'styled-map-package-api/download';
import { StyleDownloader } from 'styled-map-package-api/style-downloader';

import { getDb, updateSavedMapWithPackage } from '@/lib/db';
import type { SavedMap } from '@/lib/db';
import {
  type AuthoredLayer,
  sourceLayerIdForAuthoredLayer,
} from '@/lib/map/authored-layers';
import {
  AUTHORED_RASTER_CONCURRENCY,
  enumerateAuthoredRasterLayers,
  headAnonymousRasterTileSize,
} from '@/lib/map/authored-raster';
import {
  mergeSmpWithAuthoredLayers,
  preflightSmpWithAuthoredLayers,
} from '@/lib/map/authored-smp-merge';
import {
  type MapLibreStyleLike,
  composeAuthoredStyle,
  createAuthoredOnlyStyle,
} from '@/lib/map/authored-style';
import { buildAuthoredWriterSmp } from '@/lib/map/authored-writer';
import { normalizeTileUrl } from '@/lib/map/basemap-utils';
import { clampLatitude } from '@/lib/map/bbox-utils';

/**
 * Best-effort write to IndexedDB with retry for transient storage errors.
 * Used for status transitions (downloading -> error/draft/ready) where a
 * failure to persist the status would leave the UI in a stale state.
 */
async function recoveryWrite(
  db: ReturnType<typeof getDb>,
  mapId: string,
  updates: Partial<SavedMap>,
  maxAttempts = 2,
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await db.maps.update(mapId, updates);
      return;
    } catch {
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }
}

/** Progress snapshot emitted during an SMP download. */
export interface DownloadProgress {
  downloaded: number;
  total: number;
  bytes: number;
  skipped: number;
  warning?: boolean;
}

export type SmpPackageMapConfig = Pick<
  SavedMap,
  | 'type'
  | 'styleUrl'
  | 'bbox'
  | 'minZoom'
  | 'maxZoom'
  | 'attribution'
  | 'scheme'
>;

export interface BuildSmpBlobConfig {
  map: SmpPackageMapConfig;
  authoredLayers: readonly AuthoredLayer[];
  onProgress?: (progress: DownloadProgress) => void;
  signal?: AbortSignal;
  mapboxAccessToken?: string;
  bufferTiles?: number;
  includeGlobalOverview?: boolean;
}

export interface BuiltSmpBlob {
  blob: Blob;
  smpSize: number;
  /** Basemap downloader skipped-tile count only; authored failures are fatal. */
  skippedTiles: number;
}

export interface AuthoredPayloadEstimate {
  basemapTileBytes: bigint;
  finalStyleUtf8Bytes: bigint;
  authoredRasterBytesKnown: boolean;
  authoredRasterKnownBytes: bigint;
  knownLowerBoundBytes: bigint;
  safeTotalBytes?: number;
  requiresLargeDownloadConfirmation: boolean;
}

export interface DownloadConfig {
  /** Map configuration to download tiles for. */
  map: SavedMap;
  /** Canonical authored layers to package; defaults to [] until #280 wires persistence. */
  authoredLayers?: readonly AuthoredLayer[];
  /** Callback fired on every progress update. */
  onProgress?: (progress: DownloadProgress) => void;
  /** AbortSignal for cancellation (native pre.5 support). */
  signal?: AbortSignal;
  /** Mapbox access token (required for Mapbox styles). */
  mapboxAccessToken?: string;
  /** Extra tile rings around bbox to prevent edge clipping. Default 1. */
  bufferTiles?: number;
  /** Include worldwide context at zooms 0-3. Default true. */
  includeGlobalOverview?: boolean;
}

export interface DownloadSizeOptions {
  /** Estimate worldwide coverage at zooms 0-3, then regional coverage above. */
  includeGlobalOverview?: boolean;
}

/** Web Mercator world bounds, matching the QGIS SMP generator. */
export const GLOBAL_OVERVIEW_BBOX: [number, number, number, number] = [
  -180, -85.0511, 180, 85.0511,
];
export const GLOBAL_OVERVIEW_MAX_ZOOM = 3;

/** Estimated average tile size in bytes (raster tiles; vector tiles avg ~4-8KB). */
const ESTIMATED_TILE_SIZE = 32_000; // 32 KB avg per raster tile

/**
 * Build a synthetic MapLibre style JSON for a raster tile source.
 * Required because download() expects a style URL (JSON), not a raw tile URL.
 */
export function buildRasterStyleUrl(
  tileUrl: string,
  scheme: 'xyz' | 'tms',
  attribution?: string,
): string {
  // Normalize ELI-style placeholders ({zoom}, {-y}, {switch:a,b}) to
  // MapLibre format ({z}, {y}) so the SMP library can consume them.
  const normalizedUrls = normalizeTileUrl(tileUrl);

  // Route tile requests through our same-origin proxy to bypass CORS
  // restrictions on CDNs that don't return Access-Control-Allow-Origin.
  // encodeURIComponent would encode {z}/{x}/{y} placeholders, but the SMP
  // library needs literal braces for its template substitution. Decode them.
  const tiles = normalizedUrls.map(
    (url) =>
      `/api/tiles?url=${encodeURIComponent(url).replace(/%7B/g, '{').replace(/%7D/g, '}')}`,
  );
  const style = {
    version: 8,
    sources: {
      raster: {
        type: 'raster',
        tiles,
        tileSize: 256,
        scheme,
      },
    },
    layers: [
      {
        id: 'raster',
        type: 'raster',
        source: 'raster',
        ...(attribution ? { attribution } : {}),
      },
    ],
  };
  // Return as a blob URL so download() can fetch it
  const blob = new Blob([JSON.stringify(style)], { type: 'application/json' });
  return URL.createObjectURL(blob);
}

/**
 * Get the style URL to pass to download(). For 'style' maps, use styleUrl directly.
 * For 'raster' maps, construct a synthetic style JSON blob URL.
 */
function getDownloadStyleUrl(map: SmpPackageMapConfig): string {
  if (map.type === 'style') return map.styleUrl;
  return buildRasterStyleUrl(
    map.styleUrl,
    map.scheme ?? 'xyz',
    map.attribution,
  );
}

/**
 * Estimate the total compressed tile bytes for a given bbox + zoom range using
 * a tile-count heuristic. Returns 0 when the bbox or zooms are degenerate.
 * Coordinates are clamped to valid tile ranges.
 *
 * When `options.includeGlobalOverview` is true, `minZoom` is ignored: the
 * estimate always covers zooms 0-3 worldwide plus `bbox` from zoom 4 up to
 * `maxZoom`, matching the two-pass behavior in downloadSmp.
 */
export function estimateDownloadSize(
  bbox: [number, number, number, number],
  minZoom: number,
  maxZoom: number,
  options: DownloadSizeOptions = {},
): number {
  if (options.includeGlobalOverview) {
    if (maxZoom < 0) return 0;
    const worldMaxZoom = Math.min(GLOBAL_OVERVIEW_MAX_ZOOM, maxZoom);
    const globalBytes = estimateBboxDownloadSize(
      GLOBAL_OVERVIEW_BBOX,
      0,
      worldMaxZoom,
    );
    const regionalBytes = estimateBboxDownloadSize(
      bbox,
      GLOBAL_OVERVIEW_MAX_ZOOM + 1,
      maxZoom,
    );
    return globalBytes + regionalBytes;
  }

  return estimateBboxDownloadSize(bbox, minZoom, maxZoom);
}

function estimateBboxDownloadSize(
  bbox: [number, number, number, number],
  minZoom: number,
  maxZoom: number,
): number {
  return countBboxTiles(bbox, minZoom, maxZoom) * ESTIMATED_TILE_SIZE;
}

/**
 * Count the number of tiles covering a bbox across a zoom range. Used both for
 * byte-size estimates and to pre-seed progress-bar totals before a download
 * pass starts (see downloadSmp's passProgress seeding).
 */
function countBboxTiles(
  bbox: [number, number, number, number],
  minZoom: number,
  maxZoom: number,
  bufferTiles = 0,
): number {
  if (minZoom > maxZoom) return 0;
  const [west, rawSouth, east, rawNorth] = bbox;
  const south = clampLatitude(rawSouth);
  const north = clampLatitude(rawNorth);
  if (east <= west || north <= south) return 0;

  let totalTiles = 0;
  for (let z = minZoom; z <= maxZoom; z += 1) {
    const n = 2 ** z;
    const xMin = clampTile(
      Math.floor(((west + 180) / 360) * n) - bufferTiles,
      n,
    );
    const xMax = clampTile(
      Math.floor(((east + 180) / 360) * n) + bufferTiles,
      n,
    );
    const lat2y = (lat: number) =>
      ((1 -
        Math.log(
          Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180),
        ) /
          Math.PI) /
        2) *
      n;
    const yMin = clampTile(Math.floor(lat2y(north)) - bufferTiles, n);
    const yMax = clampTile(Math.floor(lat2y(south)) + bufferTiles, n);
    const tilesAtZoom =
      Math.max(0, xMax - xMin + 1) * Math.max(0, yMax - yMin + 1);
    totalTiles += tilesAtZoom;
  }
  return totalTiles;
}

function clampTile(v: number, n: number): number {
  return Math.max(0, Math.min(v, n - 1));
}

/**
 * Format bytes for human-readable display.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** i;
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`;
}

/**
 * Check if estimated download fits within available storage quota.
 */
export async function checkStorageQuota(
  estimatedBytes: number,
): Promise<{ available: number; sufficient: boolean }> {
  if (!('storage' in navigator) || !navigator.storage?.estimate) {
    return { available: -1, sufficient: true };
  }
  const estimate = await navigator.storage.estimate();
  const quota = estimate.quota ?? 0;
  const usage = estimate.usage ?? 0;
  const available = quota - usage;
  if (quota === 0) return { available: -1, sufficient: true };
  return { available, sufficient: available >= estimatedBytes * 1.2 };
}

type SmpStyle = {
  version: number;
  sources: Record<string, Record<string, unknown>>;
  layers: Array<Record<string, unknown> & { id: string; source?: string }>;
  [key: string]: unknown;
};

function getSmpTileFolder(source: Record<string, unknown>): string | null {
  const tiles = source.tiles;
  if (!Array.isArray(tiles) || typeof tiles[0] !== 'string') return null;
  return /^smp:\/\/maps\.v1\/s\/([^/]+)\//.exec(tiles[0])?.[1] ?? null;
}

function withTileFolder(
  source: Record<string, unknown>,
  oldFolder: string,
  newFolder: string,
): Record<string, unknown> {
  const tiles = Array.isArray(source.tiles)
    ? source.tiles.map((tile) =>
        typeof tile === 'string'
          ? tile.replace(`/s/${oldFolder}/`, `/s/${newFolder}/`)
          : tile,
      )
    : source.tiles;
  return { ...source, tiles };
}

function getOrCreateSourceFolders(style: SmpStyle): Record<string, string> {
  let metadata = style.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    metadata = {};
    style.metadata = metadata;
  }

  const metadataRecord = metadata as Record<string, unknown>;
  let sourceFolders = metadataRecord['smp:sourceFolders'];
  if (
    !sourceFolders ||
    typeof sourceFolders !== 'object' ||
    Array.isArray(sourceFolders)
  ) {
    sourceFolders = {};
    metadataRecord['smp:sourceFolders'] = sourceFolders;
  }

  return sourceFolders as Record<string, string>;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Download cancelled', 'AbortError');
  }
}

async function mergeGlobalOverviewSmp(
  globalBlob: Blob,
  regionalBlob: Blob,
  signal?: AbortSignal,
): Promise<Blob> {
  // Pass the already-buffered Blobs directly to JSZip rather than first
  // materializing our own ArrayBuffer/Uint8Array copies. JSZip may still
  // allocate internally while parsing; this only avoids an extra app-owned copy.
  const [globalZip, regionalZip] = await Promise.all([
    JSZip.loadAsync(globalBlob),
    JSZip.loadAsync(regionalBlob),
  ]);
  throwIfAborted(signal);
  const globalStyleFile = globalZip.file('style.json');
  const regionalStyleFile = regionalZip.file('style.json');
  if (!globalStyleFile || !regionalStyleFile) {
    throw new Error('Downloaded SMP is missing style.json');
  }

  const globalStyle = JSON.parse(
    await globalStyleFile.async('string'),
  ) as SmpStyle;
  const regionalStyle = JSON.parse(
    await regionalStyleFile.async('string'),
  ) as SmpStyle;
  const sourceMap = new Map<
    string,
    { globalSourceId: string; globalFolder: string; mergedFolder: string }
  >();
  const usedFolders = new Set(
    Object.values(regionalStyle.sources)
      .map(getSmpTileFolder)
      .filter((folder): folder is string => folder !== null),
  );
  let globalIndex = 0;

  // Seed sourceFolders metadata from every regional source up front, so
  // sources with no global counterpart (e.g. self-hosted overlays not
  // present in the global style) still get an entry a reader can resolve.
  const sourceFolders = getOrCreateSourceFolders(regionalStyle);
  for (const [sourceId, source] of Object.entries(regionalStyle.sources)) {
    const folder = getSmpTileFolder(source);
    if (folder) sourceFolders[sourceId] ??= `s/${folder}`;
  }

  for (const [sourceId, globalSource] of Object.entries(globalStyle.sources)) {
    const regionalSource = regionalStyle.sources[sourceId];
    if (!regionalSource) continue;
    const globalFolder = getSmpTileFolder(globalSource);
    const regionalFolder = getSmpTileFolder(regionalSource);
    if (!globalFolder || !regionalFolder) continue;

    let globalSourceId = `${sourceId}__global_overview`;
    while (globalSourceId in regionalStyle.sources) {
      globalSourceId += '_';
    }
    let mergedFolder = `g${globalIndex++}`;
    while (usedFolders.has(mergedFolder)) {
      mergedFolder = `g${globalIndex++}`;
    }
    usedFolders.add(mergedFolder);
    regionalStyle.sources[globalSourceId] = withTileFolder(
      globalSource,
      globalFolder,
      mergedFolder,
    );
    sourceFolders[globalSourceId] = `s/${mergedFolder}`;
    sourceMap.set(sourceId, { globalSourceId, globalFolder, mergedFolder });

    const regionalPrefix = `s/${regionalFolder}/`;
    for (const path of Object.keys(regionalZip.files)) {
      if (!path.startsWith(regionalPrefix)) continue;
      const zoomSegment = path.slice(regionalPrefix.length).split('/')[0];
      // Reject non-digit segments — notably the empty string from the
      // folder's own directory entry ("s/0/"), which Number() coerces to
      // 0 and would otherwise match zoom <= 3 and cascade-delete the
      // entire subtree (including higher-zoom regional tiles) via
      // JSZip's recursive folder removal.
      if (!zoomSegment || !/^\d+$/.test(zoomSegment)) continue;
      const zoom = Number(zoomSegment);
      if (zoom <= GLOBAL_OVERVIEW_MAX_ZOOM) {
        regionalZip.remove(path);
      }
    }
  }

  for (const { globalFolder, mergedFolder } of sourceMap.values()) {
    const globalPrefix = `s/${globalFolder}/`;
    for (const [path, file] of Object.entries(globalZip.files)) {
      if (file.dir || !path.startsWith(globalPrefix)) continue;
      const rest = path.slice(globalPrefix.length);
      const zoomSegment = rest.split('/')[0];
      if (!zoomSegment || !/^\d+$/.test(zoomSegment)) continue;
      const zoom = Number(zoomSegment);
      if (zoom > GLOBAL_OVERVIEW_MAX_ZOOM) continue;
      const target = `s/${mergedFolder}/${rest}`;
      regionalZip.file(target, await file.async('uint8array'), {
        binary: true,
        compression: 'STORE',
      });
      throwIfAborted(signal);
    }
  }

  if (sourceMap.size > 0) {
    const metadata = regionalStyle.metadata as Record<string, unknown>;
    // Keep the original region-of-interest bbox under a separate key so a
    // consumer fitting the initial view doesn't zoom out to the whole world.
    metadata['smp:regionalBounds'] = metadata['smp:bounds'];
    metadata['smp:bounds'] = GLOBAL_OVERVIEW_BBOX;
  }

  const mergedLayers: SmpStyle['layers'] = [];
  const usedLayerIds = new Set(regionalStyle.layers.map((layer) => layer.id));
  for (const layer of regionalStyle.layers) {
    const mapping = layer.source ? sourceMap.get(layer.source) : undefined;
    if (!mapping) {
      mergedLayers.push(layer);
      continue;
    }

    const minZoom = typeof layer.minzoom === 'number' ? layer.minzoom : 0;
    const maxZoom = typeof layer.maxzoom === 'number' ? layer.maxzoom : 24;
    const splitZoom = GLOBAL_OVERVIEW_MAX_ZOOM + 1;
    if (minZoom < splitZoom) {
      let globalLayerId = `${layer.id}__global_overview`;
      while (usedLayerIds.has(globalLayerId)) {
        globalLayerId += '_';
      }
      usedLayerIds.add(globalLayerId);
      mergedLayers.push({
        ...layer,
        id: globalLayerId,
        source: mapping.globalSourceId,
        maxzoom: Math.min(maxZoom, splitZoom),
      });
    }
    if (maxZoom > splitZoom) {
      mergedLayers.push({
        ...layer,
        minzoom: Math.max(minZoom, splitZoom),
      });
    }
  }
  regionalStyle.layers = mergedLayers;
  regionalZip.file('style.json', JSON.stringify(regionalStyle));

  const merged = await regionalZip.generateAsync({
    type: 'blob',
    compression: 'STORE',
  });
  throwIfAborted(signal);
  return merged;
}

async function collectDownloadChunks(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array[]> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    return chunks;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Stream cleanup is best-effort on the legacy downloader path.
    }
  }
}

function rasterInputsFromLayers(layers: readonly AuthoredLayer[]) {
  return layers.flatMap((layer) =>
    layer.source.type === 'raster-tiles'
      ? [
          {
            layerId: layer.id,
            sourceId: sourceLayerIdForAuthoredLayer(layer.id),
            source: layer.source,
          },
        ]
      : [],
  );
}

function throwIfCallerAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new Error('Download cancelled', {
    cause:
      signal.reason ?? new DOMException('Download cancelled', 'AbortError'),
  });
}

function blobFromChunks(chunks: Uint8Array[]): Blob {
  try {
    return new Blob(chunks as BlobPart[], { type: 'application/zip' });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create download package: ${detail}`, {
      cause: error,
    });
  }
}

type InternalBuiltSmpBlob = BuiltSmpBlob & { criticalSkipped: number };

async function buildSmpBlobInternal(
  config: BuildSmpBlobConfig,
): Promise<InternalBuiltSmpBlob> {
  const {
    map,
    authoredLayers,
    onProgress,
    signal,
    mapboxAccessToken,
    bufferTiles = 1,
    includeGlobalOverview = true,
  } = config;
  throwIfCallerAborted(signal);

  // Validate/canonicalize the complete authored collection and enumerate every
  // raster tuple before any downloader/Writer network work begins.
  const authoredOnly = createAuthoredOnlyStyle({ authoredLayers, map });
  const rasterInputs = rasterInputsFromLayers(authoredOnly.layers);
  const enumeratedRaster =
    rasterInputs.length === 0
      ? []
      : enumerateAuthoredRasterLayers(map, rasterInputs);

  let skippedTiles = 0;
  let styleUrl = '';
  let regionalBlob: Blob | undefined;
  let globalBlob: Blob | undefined;
  const globalMaxZoom = Math.min(GLOBAL_OVERVIEW_MAX_ZOOM, map.maxZoom);
  const runsGlobalPass = includeGlobalOverview;
  const runsRegionalPass =
    !includeGlobalOverview ||
    map.maxZoom > GLOBAL_OVERVIEW_MAX_ZOOM ||
    authoredLayers.length > 0;
  const estimatedGlobalTotal = runsGlobalPass
    ? countBboxTiles(GLOBAL_OVERVIEW_BBOX, 0, globalMaxZoom)
    : 0;
  const estimatedRegionalTotal = runsRegionalPass
    ? countBboxTiles(map.bbox, 0, map.maxZoom, bufferTiles)
    : 0;
  const passProgress = {
    global: {
      downloaded: 0,
      total: estimatedGlobalTotal,
      bytes: 0,
      skipped: 0,
    },
    regional: {
      downloaded: 0,
      total: estimatedRegionalTotal,
      bytes: 0,
      skipped: 0,
    },
  };

  const startPass = (
    kind: 'global' | 'regional',
    bbox: [number, number, number, number],
    maxzoom: number,
    passBufferTiles: number,
  ): ReadableStream<Uint8Array> =>
    download({
      bbox,
      maxzoom,
      styleUrl,
      bufferTiles: passBufferTiles,
      signal,
      mapboxAccessToken,
      onprogress: (progress) => {
        passProgress[kind] = {
          downloaded: progress.tiles.downloaded,
          total: progress.tiles.total,
          bytes: progress.output.totalBytes,
          skipped: progress.tiles.skipped,
        };
        skippedTiles =
          passProgress.global.skipped + passProgress.regional.skipped;
        onProgress?.({
          downloaded:
            passProgress.global.downloaded + passProgress.regional.downloaded,
          total: passProgress.global.total + passProgress.regional.total,
          bytes: passProgress.global.bytes + passProgress.regional.bytes,
          skipped: skippedTiles,
        });
      },
    });

  try {
    styleUrl = getDownloadStyleUrl(map);
    if (runsGlobalPass) {
      globalBlob = blobFromChunks(
        await collectDownloadChunks(
          startPass('global', GLOBAL_OVERVIEW_BBOX, globalMaxZoom, 0),
        ),
      );
    }
    if (runsRegionalPass) {
      regionalBlob = blobFromChunks(
        await collectDownloadChunks(
          startPass('regional', map.bbox, map.maxZoom, bufferTiles),
        ),
      );
    }
    throwIfCallerAborted(signal);

    let blob: Blob;
    if (authoredLayers.length === 0) {
      if (globalBlob && regionalBlob) {
        blob = await mergeGlobalOverviewSmp(globalBlob, regionalBlob, signal);
      } else {
        blob =
          regionalBlob ??
          globalBlob ??
          (() => {
            throw new Error('Download package is empty');
          })();
      }
    } else {
      if (!regionalBlob) {
        throw new Error('Authored package requires a regional basemap pass');
      }
      // Bound and validate the actual downloaded base/global style together with
      // the authored model before any authored raster GET/Writer work begins.
      await preflightSmpWithAuthoredLayers({
        regionalBlob,
        ...(globalBlob ? { globalBlob } : {}),
        authoredLayers: authoredOnly.layers,
        map,
        signal,
      });
      // Writer construction is skipped entirely for vector-only collections.
      const authoredBlob = await buildAuthoredWriterSmp({
        authoredStyle: authoredOnly.style,
        rasterLayers: enumeratedRaster,
        signal,
      });
      blob = await mergeSmpWithAuthoredLayers({
        regionalBlob,
        ...(globalBlob ? { globalBlob } : {}),
        ...(authoredBlob ? { authoredBlob } : {}),
        authoredLayers: authoredOnly.layers,
        map,
        signal,
      });
    }

    const isGlobalOnlyPackage =
      includeGlobalOverview &&
      map.maxZoom <= GLOBAL_OVERVIEW_MAX_ZOOM &&
      authoredLayers.length === 0;
    const criticalSkipped = isGlobalOnlyPackage
      ? skippedTiles
      : passProgress.regional.skipped;
    onProgress?.({
      downloaded:
        passProgress.global.downloaded + passProgress.regional.downloaded,
      total: passProgress.global.total + passProgress.regional.total,
      bytes: blob.size,
      skipped: skippedTiles,
      warning: criticalSkipped === 0 && skippedTiles > 0,
    });
    return { blob, smpSize: blob.size, skippedTiles, criticalSkipped };
  } finally {
    if (map.type === 'raster' && styleUrl) {
      setTimeout(() => URL.revokeObjectURL(styleUrl), 5_000);
    }
  }
}

/** Pure package-construction boundary. It never writes Dexie/SavedMap state. */
export async function buildSmpBlob(
  config: BuildSmpBlobConfig,
): Promise<BuiltSmpBlob> {
  const { blob, smpSize, skippedTiles } = await buildSmpBlobInternal(config);
  return { blob, smpSize, skippedTiles };
}

function rasterEstimateBaseStyle(map: SmpPackageMapConfig): MapLibreStyleLike {
  const urls = normalizeTileUrl(map.styleUrl);
  return {
    version: 8,
    sources: {
      raster: {
        type: 'raster',
        tiles: urls,
        tileSize: 256,
        scheme: map.scheme ?? 'xyz',
        ...(map.attribution ? { attribution: map.attribution } : {}),
      },
    },
    layers: [{ id: 'raster', type: 'raster', source: 'raster' }],
  };
}

async function loadEstimateBaseStyle(
  map: SmpPackageMapConfig,
  mapboxAccessToken?: string,
): Promise<MapLibreStyleLike> {
  if (map.type === 'raster') return rasterEstimateBaseStyle(map);
  const downloader = new StyleDownloader(map.styleUrl, { mapboxAccessToken });
  return (await downloader.getStyle()) as unknown as MapLibreStyleLike;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  operation: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const index = cursor++;
        const item = items[index];
        if (item === undefined) return;
        results[index] = await operation(item);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

/** Deterministic pre-download authored payload estimate. */
export async function estimateAuthoredPayload(config: {
  map: SmpPackageMapConfig;
  authoredLayers: readonly AuthoredLayer[];
  includeGlobalOverview?: boolean;
  signal?: AbortSignal;
  /** Style-fetch credential only; excluded from payload-size arithmetic. */
  mapboxAccessToken?: string;
}): Promise<AuthoredPayloadEstimate> {
  const {
    map,
    authoredLayers,
    includeGlobalOverview = true,
    signal,
    mapboxAccessToken,
  } = config;
  throwIfCallerAborted(signal);
  const numericBasemap = estimateDownloadSize(
    map.bbox,
    map.minZoom,
    map.maxZoom,
    { includeGlobalOverview },
  );
  if (
    !Number.isFinite(numericBasemap) ||
    !Number.isSafeInteger(numericBasemap) ||
    numericBasemap < 0
  ) {
    throw new RangeError(
      'Basemap payload estimate is not a non-negative safe integer',
    );
  }
  const basemapTileBytes = BigInt(numericBasemap);

  const baseStyle = await loadEstimateBaseStyle(map, mapboxAccessToken);
  throwIfCallerAborted(signal);
  const composed = composeAuthoredStyle({ baseStyle, authoredLayers, map });
  const rasterInputs = rasterInputsFromLayers(composed.layers);
  const enumerated =
    rasterInputs.length === 0
      ? []
      : enumerateAuthoredRasterLayers(map, rasterInputs);
  const ownedTiles = enumerated.flatMap((layer) => layer.tiles);
  const memo = new Map<
    string,
    Promise<Awaited<ReturnType<typeof headAnonymousRasterTileSize>>>
  >();
  const headResults = await mapWithConcurrency(
    ownedTiles,
    AUTHORED_RASTER_CONCURRENCY,
    async (tile) => {
      throwIfCallerAborted(signal);
      let pending = memo.get(tile.requestHref);
      if (!pending) {
        pending = headAnonymousRasterTileSize(
          tile.requestHref,
          signal ?? new AbortController().signal,
        );
        memo.set(tile.requestHref, pending);
      }
      return pending;
    },
  );
  throwIfCallerAborted(signal);

  let authoredRasterBytesKnown = true;
  let authoredRasterKnownBytes = 0n;
  for (const result of headResults) {
    if (result.known) authoredRasterKnownBytes += result.bytes;
    else authoredRasterBytesKnown = false;
  }
  const knownLowerBoundBytes =
    basemapTileBytes + composed.finalStyleUtf8Bytes + authoredRasterKnownBytes;
  const fullyKnown = authoredRasterBytesKnown;
  const fitsSafeInteger =
    knownLowerBoundBytes <= BigInt(Number.MAX_SAFE_INTEGER);
  const safeTotalBytes =
    fullyKnown && fitsSafeInteger ? Number(knownLowerBoundBytes) : undefined;
  const requiresLargeDownloadConfirmation =
    !fullyKnown ||
    !fitsSafeInteger ||
    knownLowerBoundBytes > BigInt(100 * 1024 * 1024);
  return {
    basemapTileBytes,
    finalStyleUtf8Bytes: composed.finalStyleUtf8Bytes,
    authoredRasterBytesKnown,
    authoredRasterKnownBytes,
    knownLowerBoundBytes,
    ...(safeTotalBytes === undefined ? {} : { safeTotalBytes }),
    requiresLargeDownloadConfirmation,
  };
}

/**
 * Download an SMP file for a map configuration and store the blob in Dexie.
 *
 * Returns the mapId on success. Throws on failure; caller should update status
 * to 'error' and surface the message.
 *
 * NOTE: The library's download() does NOT accept a 'minzoom' parameter — it
 * always downloads from zoom 0 to maxzoom. The user-configured minZoom is
 * used for size estimation and display only.
 */
export async function downloadSmp(config: DownloadConfig): Promise<string> {
  const {
    map,
    authoredLayers = [],
    onProgress,
    signal,
    mapboxAccessToken,
    bufferTiles = 1,
    includeGlobalOverview = true,
  } = config;
  const db = getDb();

  await db.maps.update(map.id, {
    status: 'downloading',
    errorMessage: undefined,
    updatedAt: new Date().toISOString(),
  });

  let built: InternalBuiltSmpBlob;
  try {
    built = await buildSmpBlobInternal({
      map,
      authoredLayers,
      onProgress,
      signal,
      mapboxAccessToken,
      bufferTiles,
      includeGlobalOverview,
    });
  } catch (error) {
    if (
      signal?.aborted ||
      (error instanceof DOMException && error.name === 'AbortError')
    ) {
      await recoveryWrite(db, map.id, {
        status: 'draft',
        errorMessage: undefined,
        updatedAt: new Date().toISOString(),
      });
      throw new DOMException('Download cancelled', 'AbortError');
    }
    const message = error instanceof Error ? error.message : 'Download failed';
    await recoveryWrite(db, map.id, {
      status: 'error',
      errorMessage: message,
      updatedAt: new Date().toISOString(),
    });
    throw error;
  }

  if (signal?.aborted) {
    await recoveryWrite(db, map.id, {
      status: 'draft',
      errorMessage: undefined,
      updatedAt: new Date().toISOString(),
    });
    throw new DOMException('Download cancelled', 'AbortError');
  }

  try {
    const updatedAt = new Date().toISOString();
    await updateSavedMapWithPackage(
      map.id,
      built.blob,
      {
        smpBlob: undefined,
        smpSize: built.smpSize,
        status: built.criticalSkipped > 0 ? 'error' : 'ready',
        errorMessage:
          built.criticalSkipped > 0
            ? `${built.criticalSkipped} tiles could not be downloaded. The package is incomplete.`
            : undefined,
        updatedAt,
      },
      signal,
    );
  } catch (storageError) {
    if (
      signal?.aborted ||
      (storageError instanceof DOMException &&
        storageError.name === 'AbortError')
    ) {
      await recoveryWrite(db, map.id, {
        status: 'draft',
        errorMessage: undefined,
        updatedAt: new Date().toISOString(),
      });
      throw new DOMException('Download cancelled', 'AbortError');
    }

    const message =
      storageError instanceof Error
        ? `Storage error: ${storageError.message}`
        : 'Storage error: unable to save map';
    await recoveryWrite(db, map.id, {
      status: 'error',
      errorMessage: message,
      updatedAt: new Date().toISOString(),
    });
    throw storageError;
  }

  return map.id;
}
