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
      // smp://mapId/path → pathname is /mapId/path, split into [_, mapId, ...rest]
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
    return (await reader.getStyle(`smp://${mapId}/`)) as StyleSpecification;
  } catch {
    return null;
  }
}
