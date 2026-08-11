import { ZipReader } from '@gmaclennan/zip-reader';
import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import maplibregl from 'maplibre-gl';
import { Reader } from 'styled-map-package-api/reader';
import { createServer } from 'styled-map-package-api/server';

const readerCache = new Map<string, Reader>();

let registered = false;
const smpServer = createServer({ base: '/smp' });

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

export function sanitizeSmpAttributionText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
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

export async function getSmpReader(mapId: string, blob: Blob): Promise<Reader> {
  const cached = readerCache.get(mapId);
  if (cached) return cached;

  const source = blobToRandomAccessSource(blob);
  const zipReader = await ZipReader.from(source);
  const reader = new Reader(zipReader);
  await reader.opened();
  readerCache.set(mapId, reader);
  return reader;
}

export async function closeSmpReader(mapId: string): Promise<void> {
  const reader = readerCache.get(mapId);
  if (reader) {
    await reader.close();
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
    try {
      const url = new URL(request.url);
      // smp:///mapId/path → pathname is /mapId/path (triple-slash puts mapId in pathname)
      const segments = url.pathname.split('/').filter(Boolean);
      const mapId = segments[0] ?? '';
      const path = segments.slice(1).join('/');

      const reader = readerCache.get(mapId);
      if (!reader) {
        return { data: new ArrayBuffer(0) };
      }

      const response = await smpServer.fetch(
        new Request(`http://localhost/smp/${path}`),
        reader,
      );
      const data = await response.arrayBuffer();
      return { data };
    } catch {
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
