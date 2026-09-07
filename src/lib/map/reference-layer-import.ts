import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
} from 'geojson';

import type {
  AuthoredLayer,
  AuthoredLayerCommitContext,
  AuthoredLayerValidationError,
} from '@/lib/map/authored-layers';
import {
  MAX_AUTHORED_VECTOR_FEATURES,
  createGeoJsonAuthoredLayer,
  prepareAuthoredLayerBatch,
} from '@/lib/map/authored-layers';
import {
  GeoJsonOverlayError,
  MAX_GEOJSON_OVERLAY_BYTES,
  readGeoJsonOverlayFile,
} from '@/lib/map/geojson-overlays';

export type ReferenceImportFormat =
  'geojson' | 'kml' | 'kmz' | 'shapefile-zip' | 'gpx';

export const SUPPORTED_REFERENCE_IMPORT_EXTENSIONS = [
  '.geojson',
  '.json',
  '.kml',
  '.kmz',
  '.zip',
  '.gpx',
] as const;

export const REFERENCE_IMPORT_ACCEPT =
  '.geojson,.json,.kml,.kmz,.zip,.gpx,application/geo+json,application/json,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,application/gpx+xml,application/zip';

export const MAX_REFERENCE_IMPORT_SOURCE_BYTES = MAX_GEOJSON_OVERLAY_BYTES;
export const MAX_REFERENCE_ARCHIVE_ENTRIES = 64;
export const MAX_REFERENCE_ARCHIVE_ENTRY_BYTES = 10 * 1024 * 1024;
export const MAX_REFERENCE_ARCHIVE_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
export const MAX_REFERENCE_XML_MARKUP_TOKENS = 200_000;
export const MAX_REFERENCE_XML_ELEMENTS = 100_000;
export const MAX_REFERENCE_XML_DEPTH = 64;
export const MAX_REFERENCE_TEXT_METADATA_BYTES = 64 * 1024;

const REFERENCE_ARCHIVE_CANCEL_TIMEOUT_MS = 100;

export type ReferenceLayerImportErrorCode =
  | 'unsupported-format'
  | 'source-too-large'
  | 'read-failed'
  | 'invalid-geojson'
  | 'invalid-polygon-ring'
  | 'archive-invalid'
  | 'archive-unsupported'
  | 'archive-too-many-entries'
  | 'archive-entry-too-large'
  | 'archive-uncompressed-too-large'
  | 'archive-nested'
  | 'xml-invalid'
  | 'xml-forbidden-doctype'
  | 'xml-too-complex'
  | 'no-supported-geometry'
  | 'too-many-features'
  | 'kmz-no-kml'
  | 'kmz-ambiguous-kml'
  | 'shapefile-missing-components'
  | 'shapefile-ambiguous-dataset'
  | 'shapefile-invalid'
  | 'shapefile-unsupported-crs';

export class ReferenceLayerImportError extends Error {
  readonly code: ReferenceLayerImportErrorCode;
  readonly format?: ReferenceImportFormat;
  readonly fileName: string;
  readonly missingComponents?: readonly ('dbf' | 'prj')[];

  constructor(
    code: ReferenceLayerImportErrorCode,
    fileName: string,
    options?: {
      format?: ReferenceImportFormat;
      missingComponents?: readonly ('dbf' | 'prj')[];
      cause?: unknown;
    },
  ) {
    super(`Reference import failed: ${code}`, { cause: options?.cause });
    this.name = 'ReferenceLayerImportError';
    this.code = code;
    this.fileName = fileName;
    this.format = options?.format;
    this.missingComponents = options?.missingComponents;
  }
}

export type ReferenceImportFailure = {
  index: number;
  fileName: string;
  format?: ReferenceImportFormat;
} & (
  | { kind: 'conversion'; error: ReferenceLayerImportError }
  | { kind: 'canonical'; error: AuthoredLayerValidationError }
);

export type PrepareReferenceImportBatchResult =
  | { ok: true; layers: AuthoredLayer[] }
  | { ok: false; errors: readonly ReferenceImportFailure[] };

export function detectReferenceImportFormat(file: File): ReferenceImportFormat {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.geojson') || lowerName.endsWith('.json')) {
    return 'geojson';
  }
  if (lowerName.endsWith('.kml')) return 'kml';
  if (lowerName.endsWith('.kmz')) return 'kmz';
  if (lowerName.endsWith('.zip')) return 'shapefile-zip';
  if (lowerName.endsWith('.gpx')) return 'gpx';

  throw new ReferenceLayerImportError('unsupported-format', file.name);
}

function abortIfRequested(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException('Reference import cancelled', 'AbortError');
}

function sourceName(fileName: string, format: ReferenceImportFormat): string {
  const lowerName = fileName.toLowerCase();
  let extensionLength: number;
  if (format === 'geojson') {
    extensionLength = lowerName.endsWith('.geojson')
      ? '.geojson'.length
      : '.json'.length;
  } else if (format === 'shapefile-zip') {
    extensionLength = '.zip'.length;
  } else {
    extensionLength = format.length + 1;
  }
  const stripped = fileName.slice(0, -extensionLength).trim();
  return stripped || fileName;
}

function mapGeoJsonError(
  error: GeoJsonOverlayError,
  file: File,
  format: ReferenceImportFormat,
): ReferenceLayerImportError {
  const code: ReferenceLayerImportErrorCode = (() => {
    switch (error.code) {
      case 'invalid':
        return 'invalid-geojson';
      case 'invalid-polygon-ring':
        return 'invalid-polygon-ring';
      case 'read':
        return 'read-failed';
      case 'too-large':
        return 'source-too-large';
      case 'unsupported':
        return 'no-supported-geometry';
      case 'unsupported-file':
        return 'unsupported-format';
    }
  })();
  return new ReferenceLayerImportError(code, file.name, {
    format,
    cause: error,
  });
}

function importError(
  code: ReferenceLayerImportErrorCode,
  file: File,
  format: ReferenceImportFormat,
  cause?: unknown,
): ReferenceLayerImportError {
  return new ReferenceLayerImportError(code, file.name, { format, cause });
}

async function readXmlDocument(
  file: File,
  format: 'kml' | 'gpx',
  signal?: AbortSignal,
): Promise<Document> {
  abortIfRequested(signal);
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch (error) {
    throw importError('read-failed', file, format, error);
  }
  abortIfRequested(signal);

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw importError('xml-invalid', file, format, error);
  }

  const declaration = text.match(
    /^\uFEFF?\s*<\?xml\b[^>]*\bencoding\s*=\s*["']([^"']+)["'][^>]*\?>/i,
  );
  if (declaration?.[1]?.toLowerCase() !== undefined) {
    const encoding = declaration[1].toLowerCase().replace('_', '-');
    if (encoding !== 'utf-8' && encoding !== 'utf8') {
      throw importError('xml-invalid', file, format);
    }
  }
  if (/<!\s*(?:doctype|entity)\b/i.test(text)) {
    throw importError('xml-forbidden-doctype', file, format);
  }

  let markupTokens = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) !== 60) continue;
    markupTokens += 1;
    if (markupTokens > MAX_REFERENCE_XML_MARKUP_TOKENS) {
      throw importError('xml-too-complex', file, format);
    }
  }
  abortIfRequested(signal);

  const document = new DOMParser().parseFromString(text, 'application/xml');
  abortIfRequested(signal);
  if (
    document.documentElement.localName.toLowerCase() === 'parsererror' ||
    document.getElementsByTagName('parsererror').length > 0
  ) {
    throw importError('xml-invalid', file, format);
  }

  const expectedRoot = format;
  if (document.documentElement.localName.toLowerCase() !== expectedRoot) {
    throw importError('xml-invalid', file, format);
  }

  let elementCount = 0;
  const stack: Array<{ element: Element; depth: number }> = [
    { element: document.documentElement, depth: 1 },
  ];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    elementCount += 1;
    if (
      elementCount > MAX_REFERENCE_XML_ELEMENTS ||
      current.depth > MAX_REFERENCE_XML_DEPTH
    ) {
      throw importError('xml-too-complex', file, format);
    }
    for (
      let index = current.element.children.length - 1;
      index >= 0;
      index -= 1
    ) {
      const child = current.element.children.item(index);
      if (child) stack.push({ element: child, depth: current.depth + 1 });
    }
  }
  return document;
}

function isDroppedKmlFeature(feature: Feature): boolean {
  const properties = feature.properties;
  if (!properties || typeof properties !== 'object') return false;
  const marker = (properties as Record<string, unknown>)['@geometry-type'];
  return marker === 'groundoverlay' || marker === 'networklink';
}

async function convertXmlFile(
  file: File,
  format: 'kml' | 'gpx',
  signal?: AbortSignal,
): Promise<FeatureCollection<Geometry, GeoJsonProperties>> {
  const document = await readXmlDocument(file, format, signal);
  abortIfRequested(signal);
  const { gpxGen, kmlGen } = await import('@tmcw/togeojson');
  abortIfRequested(signal);

  const features: Array<Feature<Geometry, GeoJsonProperties>> = [];
  const generator =
    format === 'kml'
      ? kmlGen(document, { skipNullGeometry: true })
      : gpxGen(document);
  for (const yielded of generator) {
    abortIfRequested(signal);
    const feature = yielded as Feature<Geometry, GeoJsonProperties>;
    if (!feature.geometry) continue;
    if (format === 'kml' && isDroppedKmlFeature(feature)) continue;
    features.push(feature);
    if (features.length > MAX_AUTHORED_VECTOR_FEATURES) {
      throw importError('too-many-features', file, format);
    }
  }
  abortIfRequested(signal);
  return { type: 'FeatureCollection', features };
}

type SafeArchiveEntry = {
  name: string;
  isDirectory: boolean;
  compressedSize: number;
  uncompressedSize: number;
};

async function inspectSafeArchive(
  file: File,
  format: 'kmz' | 'shapefile-zip',
  signal?: AbortSignal,
) {
  abortIfRequested(signal);
  try {
    const [{ ZipReader }, { BlobSource }] = await Promise.all([
      import('@gmaclennan/zip-reader'),
      import('@gmaclennan/zip-reader/blob-source'),
    ]);
    abortIfRequested(signal);
    const zip = await ZipReader.from(new BlobSource(file));
    abortIfRequested(signal);
    if (zip.isZip64) throw importError('archive-unsupported', file, format);

    const entries: SafeArchiveEntry[] = [];
    let declaredTotal = 0;
    for await (const entry of zip) {
      abortIfRequested(signal);
      if (entries.length >= MAX_REFERENCE_ARCHIVE_ENTRIES) {
        throw importError('archive-too-many-entries', file, format);
      }
      if (entry.zip64 || entry.isEncrypted) {
        throw importError('archive-unsupported', file, format);
      }
      if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) {
        throw importError('archive-unsupported', file, format);
      }
      if (entry.uncompressedSize > MAX_REFERENCE_ARCHIVE_ENTRY_BYTES) {
        throw importError('archive-entry-too-large', file, format);
      }
      declaredTotal += entry.uncompressedSize;
      if (declaredTotal > MAX_REFERENCE_ARCHIVE_UNCOMPRESSED_BYTES) {
        throw importError('archive-uncompressed-too-large', file, format);
      }
      if (!entry.isDirectory && /\.(?:zip|kmz)$/i.test(entry.name)) {
        throw importError('archive-nested', file, format);
      }
      entries.push({
        name: entry.name,
        isDirectory: entry.isDirectory,
        compressedSize: entry.compressedSize,
        uncompressedSize: entry.uncompressedSize,
      });
    }
    return { zip, entries };
  } catch (error) {
    if (signal?.aborted) abortIfRequested(signal);
    if (error instanceof ReferenceLayerImportError) throw error;
    throw importError('archive-invalid', file, format, error);
  }
}

async function cancelArchiveReaderBounded(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  reason: unknown,
): Promise<void> {
  await new Promise<void>((resolve) => {
    const timeoutId = setTimeout(resolve, REFERENCE_ARCHIVE_CANCEL_TIMEOUT_MS);
    void reader
      .cancel(reason)
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(timeoutId);
        resolve();
      });
  });
}

async function readSafeArchiveEntry(
  archive: Awaited<ReturnType<typeof inspectSafeArchive>>,
  targetName: string,
  file: File,
  format: 'kmz' | 'shapefile-zip',
  emittedBudget: { bytes: number },
  signal?: AbortSignal,
): Promise<Uint8Array> {
  try {
    for await (const entry of archive.zip) {
      abortIfRequested(signal);
      if (entry.isDirectory || entry.name !== targetName) continue;
      const reader = entry.readable().getReader();
      const chunks: Uint8Array[] = [];
      let entryBytes = 0;
      try {
        while (true) {
          abortIfRequested(signal);
          const { done, value } = await reader.read();
          abortIfRequested(signal);
          if (done) break;
          entryBytes += value.byteLength;
          emittedBudget.bytes += value.byteLength;
          if (entryBytes > MAX_REFERENCE_ARCHIVE_ENTRY_BYTES) {
            throw importError('archive-entry-too-large', file, format);
          }
          if (emittedBudget.bytes > MAX_REFERENCE_ARCHIVE_UNCOMPRESSED_BYTES) {
            throw importError('archive-uncompressed-too-large', file, format);
          }
          chunks.push(value);
        }
      } catch (error) {
        await cancelArchiveReaderBounded(reader, error);
        throw error;
      } finally {
        reader.releaseLock();
      }
      const body = new Uint8Array(entryBytes);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return body;
    }
    throw importError('archive-invalid', file, format);
  } catch (error) {
    if (signal?.aborted) abortIfRequested(signal);
    if (error instanceof ReferenceLayerImportError) throw error;
    throw importError('archive-invalid', file, format, error);
  }
}

async function convertKmzFile(
  file: File,
  signal?: AbortSignal,
): Promise<FeatureCollection<Geometry, GeoJsonProperties>> {
  const archive = await inspectSafeArchive(file, 'kmz', signal);
  const kmlEntries = archive.entries.filter(
    (entry) => !entry.isDirectory && /\.kml$/i.test(entry.name),
  );
  const rootDocEntries = kmlEntries.filter((entry) => {
    const normalized = entry.name.replace(/\\/g, '/');
    return !normalized.includes('/') && normalized.toLowerCase() === 'doc.kml';
  });

  let selected: SafeArchiveEntry;
  if (rootDocEntries.length === 1) {
    selected = rootDocEntries[0] as SafeArchiveEntry;
  } else if (kmlEntries.length === 0) {
    throw importError('kmz-no-kml', file, 'kmz');
  } else if (kmlEntries.length === 1) {
    selected = kmlEntries[0] as SafeArchiveEntry;
  } else {
    throw importError('kmz-ambiguous-kml', file, 'kmz');
  }

  const bytes = await readSafeArchiveEntry(
    archive,
    selected.name,
    file,
    'kmz',
    { bytes: 0 },
    signal,
  );
  abortIfRequested(signal);
  try {
    return await convertXmlFile(
      new File([exactArrayBuffer(bytes)], file.name, {
        type: 'application/vnd.google-earth.kml+xml',
      }),
      'kml',
      signal,
    );
  } catch (error) {
    if (error instanceof ReferenceLayerImportError) {
      throw new ReferenceLayerImportError(error.code, file.name, {
        format: 'kmz',
        cause: error,
      });
    }
    throw error;
  }
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function decodeMetadataText(
  bytes: Uint8Array,
  file: File,
  code: 'shapefile-invalid' | 'shapefile-unsupported-crs',
): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim();
  } catch (error) {
    throw importError(code, file, 'shapefile-zip', error);
  }
}

function inspectDbfHeader(bytes: Uint8Array, file: File): void {
  if (bytes.byteLength < 32) {
    throw importError('shapefile-invalid', file, 'shapefile-zip');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const recordCount = view.getUint32(4, true);
  const headerLength = view.getUint16(8, true);
  const recordLength = view.getUint16(10, true);
  if (
    recordCount > MAX_AUTHORED_VECTOR_FEATURES ||
    headerLength < 33 ||
    recordLength < 1 ||
    headerLength > bytes.byteLength
  ) {
    throw importError(
      recordCount > MAX_AUTHORED_VECTOR_FEATURES
        ? 'too-many-features'
        : 'shapefile-invalid',
      file,
      'shapefile-zip',
    );
  }
}

function shapefileBounds(
  bytes: Uint8Array,
  file: File,
): [number, number, number, number] {
  if (bytes.byteLength < 100) {
    throw importError('shapefile-invalid', file, 'shapefile-zip');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getInt32(0, false) !== 9994 || view.getInt32(28, true) !== 1000) {
    throw importError('shapefile-invalid', file, 'shapefile-zip');
  }
  const bounds: [number, number, number, number] = [
    view.getFloat64(36, true),
    view.getFloat64(44, true),
    view.getFloat64(52, true),
    view.getFloat64(60, true),
  ];
  if (bounds.some((value) => !Number.isFinite(value))) {
    throw importError('shapefile-invalid', file, 'shapefile-zip');
  }
  return bounds;
}

async function preflightShapefileCrs(
  prj: string,
  bounds: [number, number, number, number],
  file: File,
  signal?: AbortSignal,
): Promise<void> {
  if (
    prj.length === 0 ||
    /\+nadgrids\b|\bnadgrids\b|\bparameterfile\b|\bntv2\b/i.test(prj)
  ) {
    throw importError('shapefile-unsupported-crs', file, 'shapefile-zip');
  }
  abortIfRequested(signal);
  const { default: proj4 } = await import('proj4');
  abortIfRequested(signal);
  try {
    const corners: Array<[number, number]> = [
      [bounds[0], bounds[1]],
      [bounds[0], bounds[3]],
      [bounds[2], bounds[1]],
      [bounds[2], bounds[3]],
    ];
    for (const corner of corners) {
      const transformed = proj4(prj, 'WGS84', corner);
      if (
        transformed.length < 2 ||
        !Number.isFinite(transformed[0]) ||
        !Number.isFinite(transformed[1]) ||
        transformed[0] < -180 ||
        transformed[0] > 180 ||
        transformed[1] < -90 ||
        transformed[1] > 90
      ) {
        throw new Error('CRS sanity transform is outside WGS84 bounds');
      }
    }
  } catch (error) {
    throw importError(
      'shapefile-unsupported-crs',
      file,
      'shapefile-zip',
      error,
    );
  }
  abortIfRequested(signal);
}

function normalizeShapefileProperties(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.map(normalizeShapefileProperties);
  if (value === null || typeof value !== 'object') return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(
    value as Record<string, unknown>,
  )) {
    output[key] = normalizeShapefileProperties(nested);
  }
  return output;
}

async function convertShapefileZip(
  file: File,
  signal?: AbortSignal,
): Promise<{
  data: FeatureCollection<Geometry, GeoJsonProperties>;
  name: string;
}> {
  const archive = await inspectSafeArchive(file, 'shapefile-zip', signal);
  const shpEntries = archive.entries.filter(
    (entry) => !entry.isDirectory && /\.shp$/i.test(entry.name),
  );
  if (shpEntries.length !== 1) {
    throw importError(
      shpEntries.length === 0
        ? 'shapefile-missing-components'
        : 'shapefile-ambiguous-dataset',
      file,
      'shapefile-zip',
    );
  }
  const shpEntry = shpEntries[0] as SafeArchiveEntry;
  const datasetKey = shpEntry.name.slice(0, -4);
  const lowerDatasetKey = datasetKey.toLowerCase();
  const sidecars = new Map<string, SafeArchiveEntry[]>();
  for (const extension of ['dbf', 'prj', 'cpg'] as const) {
    sidecars.set(
      extension,
      archive.entries.filter((entry) => {
        if (entry.isDirectory) return false;
        const lowerName = entry.name.toLowerCase();
        return lowerName === `${lowerDatasetKey}.${extension}`;
      }),
    );
  }
  if ([...sidecars.values()].some((entries) => entries.length > 1)) {
    throw importError('shapefile-ambiguous-dataset', file, 'shapefile-zip');
  }
  const missingComponents: Array<'dbf' | 'prj'> = [];
  if (sidecars.get('dbf')?.length !== 1) missingComponents.push('dbf');
  if (sidecars.get('prj')?.length !== 1) missingComponents.push('prj');
  if (missingComponents.length > 0) {
    throw new ReferenceLayerImportError(
      'shapefile-missing-components',
      file.name,
      { format: 'shapefile-zip', missingComponents },
    );
  }
  for (const extension of ['prj', 'cpg'] as const) {
    const entry = sidecars.get(extension)?.[0];
    if (entry && entry.uncompressedSize > MAX_REFERENCE_TEXT_METADATA_BYTES) {
      throw importError('archive-entry-too-large', file, 'shapefile-zip');
    }
  }

  const dbfEntry = sidecars.get('dbf')?.[0] as SafeArchiveEntry;
  const prjEntry = sidecars.get('prj')?.[0] as SafeArchiveEntry;
  const cpgEntry = sidecars.get('cpg')?.[0];
  const budget = { bytes: 0 };
  const shpBytes = await readSafeArchiveEntry(
    archive,
    shpEntry.name,
    file,
    'shapefile-zip',
    budget,
    signal,
  );
  const dbfBytes = await readSafeArchiveEntry(
    archive,
    dbfEntry.name,
    file,
    'shapefile-zip',
    budget,
    signal,
  );
  const prjBytes = await readSafeArchiveEntry(
    archive,
    prjEntry.name,
    file,
    'shapefile-zip',
    budget,
    signal,
  );
  const cpgBytes = cpgEntry
    ? await readSafeArchiveEntry(
        archive,
        cpgEntry.name,
        file,
        'shapefile-zip',
        budget,
        signal,
      )
    : undefined;
  abortIfRequested(signal);

  inspectDbfHeader(dbfBytes, file);
  const bounds = shapefileBounds(shpBytes, file);
  const prj = decodeMetadataText(prjBytes, file, 'shapefile-unsupported-crs');
  const cpg = cpgBytes
    ? decodeMetadataText(cpgBytes, file, 'shapefile-invalid')
    : undefined;
  await preflightShapefileCrs(prj, bounds, file, signal);

  abortIfRequested(signal);
  const { default: shp } = await import('shpjs');
  abortIfRequested(signal);
  const shpObjectApi = shp as unknown as (input: {
    shp: ArrayBuffer;
    dbf: ArrayBuffer;
    prj: string;
    cpg?: string;
  }) => Promise<unknown>;
  let converted: unknown;
  try {
    converted = await shpObjectApi({
      shp: exactArrayBuffer(shpBytes),
      dbf: exactArrayBuffer(dbfBytes),
      prj,
      ...(cpg ? { cpg } : {}),
    });
  } catch (error) {
    throw importError('shapefile-invalid', file, 'shapefile-zip', error);
  }
  abortIfRequested(signal);
  if (
    !converted ||
    typeof converted !== 'object' ||
    (converted as { type?: unknown }).type !== 'FeatureCollection' ||
    !Array.isArray((converted as { features?: unknown }).features)
  ) {
    throw importError('shapefile-invalid', file, 'shapefile-zip');
  }
  const collection = converted as FeatureCollection<
    Geometry,
    GeoJsonProperties
  >;
  const data: FeatureCollection<Geometry, GeoJsonProperties> = {
    type: 'FeatureCollection',
    features: collection.features.map((feature) => ({
      ...feature,
      properties: normalizeShapefileProperties(
        feature.properties,
      ) as GeoJsonProperties,
    })),
  };
  const normalizedPath = datasetKey.replace(/\\/g, '/');
  const name = normalizedPath.slice(normalizedPath.lastIndexOf('/') + 1).trim();
  return { data, name: name || file.name };
}

export async function prepareReferenceImportBatch(
  files: readonly File[],
  context: AuthoredLayerCommitContext,
  options: { signal?: AbortSignal } = {},
): Promise<PrepareReferenceImportBatchResult> {
  const { signal } = options;
  abortIfRequested(signal);

  const candidates: AuthoredLayer[] = [];
  const origins: Array<{
    index: number;
    fileName: string;
    format: ReferenceImportFormat;
  }> = [];
  const errors: ReferenceImportFailure[] = [];

  for (let index = 0; index < files.length; index += 1) {
    abortIfRequested(signal);
    const file = files[index];
    if (!file) continue;

    let format: ReferenceImportFormat;
    try {
      format = detectReferenceImportFormat(file);
    } catch (error) {
      if (error instanceof ReferenceLayerImportError) {
        errors.push({
          index,
          fileName: file.name,
          kind: 'conversion',
          error,
        });
        continue;
      }
      throw error;
    }

    if (file.size > MAX_REFERENCE_IMPORT_SOURCE_BYTES) {
      const error = new ReferenceLayerImportError(
        'source-too-large',
        file.name,
        { format },
      );
      errors.push({
        index,
        fileName: file.name,
        format,
        kind: 'conversion',
        error,
      });
      continue;
    }

    try {
      let converted: unknown;
      let name = sourceName(file.name, format);
      if (format === 'geojson') {
        converted = await readGeoJsonOverlayFile(file);
      } else if (format === 'kml' || format === 'gpx') {
        converted = await convertXmlFile(file, format, signal);
      } else if (format === 'kmz') {
        converted = await convertKmzFile(file, signal);
      } else if (format === 'shapefile-zip') {
        const shapefile = await convertShapefileZip(file, signal);
        converted = shapefile.data;
        name = shapefile.name;
      } else {
        throw importError('unsupported-format', file, format);
      }
      abortIfRequested(signal);
      const created = createGeoJsonAuthoredLayer(converted, context, {
        name,
        visible: true,
      });
      abortIfRequested(signal);
      if (!created.ok) {
        errors.push({
          index,
          fileName: file.name,
          format,
          kind: 'canonical',
          error: created.error,
        });
        continue;
      }
      candidates.push(created.layer);
      origins.push({ index, fileName: file.name, format });
    } catch (error) {
      if (error instanceof ReferenceLayerImportError) {
        errors.push({
          index,
          fileName: file.name,
          format,
          kind: 'conversion',
          error,
        });
        continue;
      }
      if (error instanceof GeoJsonOverlayError) {
        const mapped = mapGeoJsonError(error, file, format);
        errors.push({
          index,
          fileName: file.name,
          format,
          kind: 'conversion',
          error: mapped,
        });
        continue;
      }
      throw error;
    }
  }

  abortIfRequested(signal);
  if (errors.length > 0) return { ok: false, errors };

  const prepared = prepareAuthoredLayerBatch(candidates, context);
  abortIfRequested(signal);
  if (!prepared.ok) {
    return {
      ok: false,
      errors: prepared.errors.map((failure) => {
        const origin = origins[failure.index];
        if (!origin) {
          throw new Error('Canonical reference import index is out of range');
        }
        return {
          ...origin,
          kind: 'canonical' as const,
          error: failure.error,
        };
      }),
    };
  }

  return { ok: true, layers: prepared.layers };
}
