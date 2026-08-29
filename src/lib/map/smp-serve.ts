import { ZipReader } from '@gmaclennan/zip-reader';
import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import maplibregl from 'maplibre-gl';
import { Reader } from 'styled-map-package-api/reader';
import { createServer } from 'styled-map-package-api/server';

import { type SavedMap, getSavedMapPackageSource } from '@/lib/db';

const readerCache = new Map<string, Reader>();

let registered = false;
// Missing packaged glyph ranges must surface as a failed protocol request so
// MapLibre can use its built-in TinySDF local-glyph fallback. The SMP library's
// default empty-glyph fallback would instead return a successful empty PBF and
// can leave otherwise-valid authored text labels blank offline.
const smpServer = createServer({ base: '/smp', fallbackGlyph: null });

function blobToRandomAccessSource(blob: Blob) {
  const size = blob.size;
  return {
    read: async (offset: number, length: number) => {
      const slice = blob.slice(offset, offset + length);
      const buffer = await slice.arrayBuffer();
      return new Uint8Array(buffer);
    },
    size,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function decodeHtmlEntities(value: string): string {
  const parser = new DOMParser();
  return parser.parseFromString(value, 'text/html').body.textContent ?? '';
}

/** Returns plain text only; callers must still HTML-escape before any innerHTML sink. */
export function sanitizeSmpAttributionText(value: string): string {
  const decoded = decodeHtmlEntities(value);
  return decoded
    .replace(/<\/?[A-Za-z][^>]*(?:>|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isOfflineResourceUrl(value: string): boolean {
  return /^(?:smp|data|blob):/i.test(value);
}

function styleUsesExternalResources(style: StyleSpecification): boolean {
  const styleWithResources = style as StyleSpecification & {
    glyphs?: unknown;
    sprite?: unknown;
    imports?: unknown;
  };

  if (
    typeof styleWithResources.glyphs === 'string' &&
    !isOfflineResourceUrl(styleWithResources.glyphs)
  ) {
    return true;
  }

  const sprite = styleWithResources.sprite;
  if (typeof sprite === 'string' && !isOfflineResourceUrl(sprite)) return true;
  if (
    Array.isArray(sprite) &&
    sprite.some(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        'url' in entry &&
        typeof entry.url === 'string' &&
        !isOfflineResourceUrl(entry.url),
    )
  ) {
    return true;
  }

  // MapLibre GL 5.x does not currently expose style imports in its bundled
  // StyleSpecification type. Keep this runtime guard for forward compatibility
  // so future import support cannot silently introduce network fetches.
  const imports = styleWithResources.imports;
  if (
    Array.isArray(imports) &&
    imports.some(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        'url' in entry &&
        typeof entry.url === 'string' &&
        !isOfflineResourceUrl(entry.url),
    )
  ) {
    return true;
  }

  return Object.values(style.sources).some((source) => {
    const resourceSource = source as typeof source & {
      url?: unknown;
      urls?: unknown;
      tiles?: unknown;
      data?: unknown;
    };

    if (
      typeof resourceSource.url === 'string' &&
      !isOfflineResourceUrl(resourceSource.url)
    ) {
      return true;
    }
    if (
      Array.isArray(resourceSource.urls) &&
      resourceSource.urls.some(
        (url) => typeof url === 'string' && !isOfflineResourceUrl(url),
      )
    ) {
      return true;
    }
    if (
      Array.isArray(resourceSource.tiles) &&
      resourceSource.tiles.some(
        (url) => typeof url === 'string' && !isOfflineResourceUrl(url),
      )
    ) {
      return true;
    }
    return (
      resourceSource.type === 'geojson' &&
      typeof resourceSource.data === 'string' &&
      !isOfflineResourceUrl(resourceSource.data)
    );
  });
}

/**
 * Imported SMP files are untrusted input. MapLibre renders source attribution
 * via innerHTML, so convert any embedded markup to escaped plain text before
 * passing an imported style to the map renderer.
 */
export function sanitizeSmpStyleAttributions(
  style: StyleSpecification,
): StyleSpecification {
  const sources = Object.fromEntries(
    Object.entries(style.sources).map(([id, source]) => {
      if (
        !('attribution' in source) ||
        typeof source.attribution !== 'string'
      ) {
        return [id, source];
      }
      return [
        id,
        {
          ...source,
          attribution: escapeHtml(
            sanitizeSmpAttributionText(source.attribution),
          ),
        },
      ];
    }),
  ) as StyleSpecification['sources'];

  return { ...style, sources };
}

/**
 * Imported SMP packages are expected to be self-contained. Reject styles that
 * would make MapLibre fetch resources from the network, then sanitize source
 * attribution before rendering it through MapLibre's HTML attribution UI.
 */
export function sanitizeImportedSmpStyle(
  style: StyleSpecification,
): StyleSpecification | null {
  if (styleUsesExternalResources(style)) return null;
  return sanitizeSmpStyleAttributions(style);
}

async function getSmpReaderFromSource(
  readerId: string,
  source: {
    size: number;
    read: (offset: number, length: number) => Promise<Uint8Array>;
  },
): Promise<Reader> {
  const cached = readerCache.get(readerId);
  if (cached) return cached;

  const zipReader = await ZipReader.from(source);
  const reader = new Reader(zipReader);
  await reader.opened();
  readerCache.set(readerId, reader);
  return reader;
}

export async function getSmpReader(
  readerId: string,
  blob: Blob,
): Promise<Reader> {
  return getSmpReaderFromSource(readerId, blobToRandomAccessSource(blob));
}

export async function getSavedMapSmpReader(
  readerId: string,
  map: Pick<SavedMap, 'id' | 'smpBlob' | 'smpSize'>,
): Promise<Reader> {
  const source = await getSavedMapPackageSource(map);
  if (!source) throw new Error('SMP package is missing');
  return getSmpReaderFromSource(readerId, source);
}

export async function closeSmpReader(mapId: string): Promise<void> {
  const reader = readerCache.get(mapId);
  if (!reader) return;

  try {
    await reader.close();
  } finally {
    readerCache.delete(mapId);
  }
}

export async function closeAllSmpReaders(): Promise<void> {
  for (const reader of readerCache.values()) {
    await reader.close();
  }
  readerCache.clear();
}

export function registerSmpProtocol(): void {
  if (registered) return;
  registered = true;

  maplibregl.addProtocol('smp', async (request) => {
    let glyphRequest = false;
    try {
      const url = new URL(request.url);
      // smp:///mapId/path → pathname is /mapId/path (triple-slash puts mapId in pathname)
      const segments = url.pathname.split('/').filter(Boolean);
      const mapId = segments[0] ?? '';
      const path = segments.slice(1).join('/');
      glyphRequest = path.startsWith('fonts/');

      const reader = readerCache.get(mapId);
      if (!reader) {
        if (glyphRequest) throw new Error('SMP glyph reader is unavailable');
        return { data: new ArrayBuffer(0) };
      }

      const response = await smpServer.fetch(
        new Request(`http://localhost/smp/${path}`),
        reader,
      );
      if (glyphRequest && !response.ok) {
        throw new Error(
          `SMP glyph resource is unavailable (${response.status})`,
        );
      }
      const data = await response.arrayBuffer();
      return { data };
    } catch (error) {
      // Reject missing glyphs so MapLibre's GlyphManager falls back to local
      // TinySDF rendering. Existing non-glyph protocol failures retain the
      // established empty-resource behavior.
      if (glyphRequest) throw error;
      return { data: new ArrayBuffer(0) };
    }
  });
}

export async function resolveSmpStyle(
  reader: Reader,
  mapId: string,
): Promise<StyleSpecification | null> {
  try {
    return (await reader.getStyle(`smp:///${mapId}/`)) as StyleSpecification;
  } catch {
    return null;
  }
}
