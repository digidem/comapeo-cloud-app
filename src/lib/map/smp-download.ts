import JSZip from 'jszip';
import { download } from 'styled-map-package-api/download';

import { getDb } from '@/lib/db';
import type { SavedMap } from '@/lib/db';
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

export interface DownloadConfig {
  /** Map configuration to download tiles for. */
  map: SavedMap;
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
function getDownloadStyleUrl(map: SavedMap): string {
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
  globalChunks: Uint8Array[],
  regionalChunks: Uint8Array[],
  signal?: AbortSignal,
): Promise<Blob> {
  // Load from Blob rather than concatenating chunks into a contiguous
  // Uint8Array first — avoids a ~1x peak-heap copy on top of what JSZip
  // and the final generateAsync() already allocate.
  const [globalZip, regionalZip] = await Promise.all([
    JSZip.loadAsync(new Blob(globalChunks as BlobPart[])),
    JSZip.loadAsync(new Blob(regionalChunks as BlobPart[])),
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
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return chunks;
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

  let skippedTiles = 0;
  let styleUrl = '';
  let blob: Blob | undefined;
  let packageParts: Uint8Array[] | undefined;

  // Seed both passes' totals upfront (from a tile-count estimate) so the
  // combined denominator is stable from the first progress event, instead of
  // spiking when the regional pass's real total replaces its seeded 0.
  const globalMaxZoom = Math.min(GLOBAL_OVERVIEW_MAX_ZOOM, map.maxZoom);
  const runsGlobalPass = includeGlobalOverview;
  const runsRegionalPass =
    !includeGlobalOverview || map.maxZoom > GLOBAL_OVERVIEW_MAX_ZOOM;
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
  ): ReadableStream<Uint8Array> => {
    return download({
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
        const global = passProgress.global;
        const regional = passProgress.regional;
        skippedTiles = global.skipped + regional.skipped;
        onProgress?.({
          downloaded: global.downloaded + regional.downloaded,
          total: global.total + regional.total,
          bytes: global.bytes + regional.bytes,
          skipped: skippedTiles,
        });
      },
    });
  };

  try {
    styleUrl = getDownloadStyleUrl(map);
    if (includeGlobalOverview) {
      const globalChunks = await collectDownloadChunks(
        startPass('global', GLOBAL_OVERVIEW_BBOX, globalMaxZoom, 0),
      );
      if (map.maxZoom <= GLOBAL_OVERVIEW_MAX_ZOOM) {
        packageParts = globalChunks;
      } else {
        // download() has no minzoom option — it always fetches z0..maxzoom
        // over `bbox`, so this regional pass re-downloads z0-3 (already
        // covered by the global pass) only to have them discarded below.
        // The wasted requests are a known tradeoff of the underlying library.
        const regionalChunks = await collectDownloadChunks(
          startPass('regional', map.bbox, map.maxZoom, bufferTiles),
        );
        blob = await mergeGlobalOverviewSmp(
          globalChunks,
          regionalChunks,
          signal,
        );
      }
    } else {
      packageParts = await collectDownloadChunks(
        startPass('regional', map.bbox, map.maxZoom, bufferTiles),
      );
    }
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
  } finally {
    if (map.type === 'raster' && styleUrl) {
      setTimeout(() => URL.revokeObjectURL(styleUrl), 5_000);
    }
  }

  if (signal?.aborted) {
    await recoveryWrite(db, map.id, {
      status: 'draft',
      errorMessage: undefined,
      updatedAt: new Date().toISOString(),
    });
    throw new DOMException('Download cancelled', 'AbortError');
  }

  if (!blob) {
    try {
      if (!packageParts) throw new Error('Download package is empty');
      blob = new Blob(packageParts as unknown as BlobPart[], {
        type: 'application/zip',
      });
    } catch (blobError) {
      const message =
        blobError instanceof Error
          ? `Failed to create download package: ${blobError.message}`
          : 'Failed to create download package';
      await recoveryWrite(db, map.id, {
        status: 'error',
        errorMessage: message,
        updatedAt: new Date().toISOString(),
      });
      throw blobError;
    }
  }

  const totalSize = blob.size;
  // The global overview pass hits ~85 world tiles (z0-3) from the same
  // source. Sources with limited coverage (country WMTS, regional imagery,
  // self-hosted) will 404 on most of them — that's expected and shouldn't
  // block the export of an otherwise-complete regional package. Only treat
  // skips as fatal when they come from the regional pass, or when the
  // global pass *is* the entire package (map.maxZoom <= overview max zoom,
  // so there was no regional pass to fall back on).
  const isGlobalOnlyPackage =
    includeGlobalOverview && map.maxZoom <= GLOBAL_OVERVIEW_MAX_ZOOM;
  const criticalSkipped = isGlobalOnlyPackage
    ? skippedTiles
    : passProgress.regional.skipped;
  onProgress?.({
    downloaded:
      passProgress.global.downloaded + passProgress.regional.downloaded,
    total: passProgress.global.total + passProgress.regional.total,
    bytes: totalSize,
    skipped: skippedTiles,
    warning: criticalSkipped === 0 && skippedTiles > 0,
  });

  try {
    const smpData = await blob.arrayBuffer();
    if (criticalSkipped > 0) {
      await db.maps.update(map.id, {
        smpBlob: undefined,
        smpData,
        smpSize: totalSize,
        status: 'error',
        errorMessage: `${criticalSkipped} tiles could not be downloaded. The package is incomplete.`,
        updatedAt: new Date().toISOString(),
      });
    } else {
      await db.maps.update(map.id, {
        smpBlob: undefined,
        smpData,
        smpSize: totalSize,
        status: 'ready',
        errorMessage: undefined,
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (storageError) {
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
