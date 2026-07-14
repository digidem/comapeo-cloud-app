import { download } from 'styled-map-package-api/download';

import { getDb } from '@/lib/db';
import type { SavedMap } from '@/lib/db';

/** Progress snapshot emitted during an SMP download. */
export interface DownloadProgress {
  downloaded: number;
  total: number;
  bytes: number;
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
}

/** Estimated average tile size in bytes (raster tiles; vector tiles avg ~4-8KB). */
const ESTIMATED_TILE_SIZE = 32_000; // 32 KB avg per raster tile

/**
 * Build a synthetic MapLibre style JSON for a raster tile source.
 * Required because download() expects a style URL (JSON), not a raw tile URL.
 */
export function buildRasterStyleUrl(
  tileUrl: string,
  scheme: 'xyz' | 'tms',
): string {
  const style = {
    version: 8,
    sources: {
      raster: {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        scheme,
      },
    },
    layers: [
      {
        id: 'raster',
        type: 'raster',
        source: 'raster',
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
  return buildRasterStyleUrl(map.styleUrl, map.scheme ?? 'xyz');
}

/**
 * Estimate the total compressed tile bytes for a given bbox + zoom range using
 * a tile-count heuristic. Returns 0 when the bbox or zooms are degenerate.
 * Coordinates are clamped to valid tile ranges.
 */
export function estimateDownloadSize(
  bbox: [number, number, number, number],
  minZoom: number,
  maxZoom: number,
): number {
  if (minZoom > maxZoom) return 0;
  const [west, south, east, north] = bbox;
  if (east <= west || north <= south) return 0;

  let totalTiles = 0;
  for (let z = minZoom; z <= maxZoom; z += 1) {
    const n = 2 ** z;
    const xMin = clampTile(Math.floor(((west + 180) / 360) * n), n);
    const xMax = clampTile(Math.floor(((east + 180) / 360) * n), n);
    const lat2y = (lat: number) =>
      ((1 -
        Math.log(
          Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180),
        ) /
          Math.PI) /
        2) *
      n;
    const yMin = clampTile(Math.floor(lat2y(north)), n);
    const yMax = clampTile(Math.floor(lat2y(south)), n);
    const tilesAtZoom =
      Math.max(0, xMax - xMin + 1) * Math.max(0, yMax - yMin + 1);
    totalTiles += tilesAtZoom;
  }
  return totalTiles * ESTIMATED_TILE_SIZE;
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

/**
 * Download an SMP file for a map configuration, storing the blob in Dexie and
 * triggering a browser download.
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
  } = config;
  const db = getDb();

  // Reset any stuck 'downloading' state from a previous crash
  await db.maps.update(map.id, {
    status: 'downloading',
    errorMessage: undefined,
  });

  const styleUrl = getDownloadStyleUrl(map);

  const stream = download({
    bbox: map.bbox,
    maxzoom: map.maxZoom,
    styleUrl,
    bufferTiles,
    signal,
    mapboxAccessToken,
    onprogress: (progress) => {
      onProgress?.({
        downloaded: progress.tiles.downloaded,
        total: progress.tiles.total,
        bytes: progress.output.totalBytes,
      });
    },
  });
  const reader = stream.getReader();

  // Collect chunks (NO intermediate merge — build Blob directly from chunks)
  const chunks: Uint8Array[] = [];
  let totalSize = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalSize += value.byteLength;
    }
  } catch (error) {
    if (signal?.aborted) {
      await db.maps.update(map.id, {
        status: 'draft',
        errorMessage: undefined,
      });
      throw new DOMException('Download cancelled', 'AbortError');
    }
    const message = error instanceof Error ? error.message : 'Download failed';
    await db.maps.update(map.id, { status: 'error', errorMessage: message });
    throw error;
  } finally {
    // Clean up synthetic style blob URL for raster maps (success OR error)
    if (map.type === 'raster') {
      setTimeout(() => URL.revokeObjectURL(styleUrl), 5_000);
    }
  }

  // Build Blob directly from chunks — avoids redundant Uint8Array merge allocation
  const blob = new Blob(chunks as unknown as BlobPart[], {
    type: 'application/zip',
  });

  // --- Store in Dexie ---
  try {
    await db.maps.update(map.id, {
      smpBlob: blob,
      smpSize: totalSize,
      status: 'ready',
      errorMessage: undefined,
    });
  } catch (storageError) {
    const message =
      storageError instanceof Error
        ? `Storage error: ${storageError.message}`
        : 'Storage error: unable to save map';
    await db.maps.update(map.id, { status: 'error', errorMessage: message });
    throw storageError;
  }

  // --- Trigger browser download ---
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `${map.name.replace(/[/\\?%*:|"<>]/g, '_')}-${dateStr}.smp`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  return map.id;
}
