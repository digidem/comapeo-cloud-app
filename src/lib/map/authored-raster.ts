import { tileIterator } from 'styled-map-package-api/tile-downloader';

import {
  type RasterTilesAuthoredSource,
  canonicalizeRasterTileTemplate,
  isExternalAnonymousRasterHostname,
} from '@/lib/map/authored-layers';

export const MAX_WEB_MERCATOR_LAT = 85.0511287798066;
export const MAX_AUTHORED_RASTER_TILE_REQUESTS = 10_000;
export const MAX_AUTHORED_RASTER_TILE_BYTES = 4 * 1024 * 1024;
export const MAX_AUTHORED_RASTER_TOTAL_BYTES = 96 * 1024 * 1024;
export const AUTHORED_RASTER_CONCURRENCY = 8;
export const RASTER_REQUEST_TIMEOUT_MS = 120_000;
export const RASTER_STREAM_CLEANUP_TIMEOUT_MS = 5_000;

export class AuthoredRasterError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AuthoredRasterError';
    this.code = code;
  }
}

export class RasterRequestTimeoutError extends Error {
  readonly code = 'RASTER_REQUEST_TIMEOUT' as const;

  constructor() {
    super(`Raster request exceeded ${RASTER_REQUEST_TIMEOUT_MS} ms`);
    this.name = 'RasterRequestTimeoutError';
  }
}

export type RasterMapCoverageConfig = {
  bbox: [number, number, number, number];
  minZoom: number;
  maxZoom: number;
};

export type RasterTileCoordinate = {
  z: number;
  x: number;
  y: number;
};

export type AuthoredRasterTileTuple = RasterTileCoordinate & {
  requestHref: string;
};

export type AuthoredRasterLayerInput = {
  layerId: string;
  sourceId: string;
  source: RasterTilesAuthoredSource;
};

export type EnumeratedAuthoredRasterLayer = AuthoredRasterLayerInput & {
  bounds: [number, number, number, number];
  effectiveMinZoom: number;
  effectiveMaxZoom: number;
  tiles: AuthoredRasterTileTuple[];
};

export type AuthoredRasterByteBudget = {
  bytesReceived: bigint;
};

export type RasterTileFormat = 'png' | 'jpg' | 'webp';

export type FetchedAnonymousRasterTile = {
  body: Uint8Array;
  format: RasterTileFormat;
  bytesReceived: bigint;
};

export type AnonymousRasterHeadSize =
  { known: true; bytes: bigint } | { known: false };

function normalizeFailure(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  return new Error('Authored raster packaging failed', { cause: reason });
}

function abortReason(signal: AbortSignal): Error {
  return normalizeFailure(
    signal.reason ?? new DOMException('Download cancelled', 'AbortError'),
  );
}

function validateConcreteAnonymousRasterHref(requestHref: string): string {
  let url: URL;
  try {
    url = new URL(requestHref);
  } catch (cause) {
    throw new AuthoredRasterError(
      'AUTHORED_RASTER_URL_INVALID',
      'Raster request URL is invalid',
      { cause },
    );
  }
  if (url.protocol !== 'https:') {
    throw new AuthoredRasterError(
      'AUTHORED_RASTER_URL_INVALID',
      'Raster request URL must use HTTPS',
    );
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new AuthoredRasterError(
      'AUTHORED_RASTER_URL_INVALID',
      'Raster request URL cannot contain credentials, query parameters, or fragments',
    );
  }
  if (!isExternalAnonymousRasterHostname(url.hostname)) {
    throw new AuthoredRasterError(
      'AUTHORED_RASTER_URL_INVALID',
      'Raster request URL must use an external DNS hostname',
    );
  }
  return url.href;
}

export function rasterTileRequestHref(
  canonicalTemplate: string,
  scheme: 'xyz' | 'tms',
  coordinate: RasterTileCoordinate,
): string {
  const template = canonicalizeRasterTileTemplate(canonicalTemplate);
  const { z, x, y } = coordinate;
  if (
    !Number.isInteger(z) ||
    z < 0 ||
    z > 22 ||
    !Number.isInteger(x) ||
    !Number.isInteger(y)
  ) {
    throw new AuthoredRasterError(
      'AUTHORED_RASTER_TILE_COORDINATE_INVALID',
      'Raster tile coordinate must use integer z/x/y values',
    );
  }
  const dimension = 2 ** z;
  if (x < 0 || x >= dimension || y < 0 || y >= dimension) {
    throw new AuthoredRasterError(
      'AUTHORED_RASTER_TILE_COORDINATE_INVALID',
      'Raster tile coordinate is outside its zoom-level XYZ range',
    );
  }
  const requestY = scheme === 'tms' ? dimension - 1 - y : y;
  const concrete = template
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(requestY));
  return validateConcreteAnonymousRasterHref(concrete);
}

export function collectBoundedRasterTileTuples(
  tuples: Iterable<RasterTileCoordinate>,
  options: { maxOwnedTuples: number },
): RasterTileCoordinate[] {
  const { maxOwnedTuples } = options;
  if (!Number.isSafeInteger(maxOwnedTuples) || maxOwnedTuples < 0) {
    throw new RangeError('maxOwnedTuples must be a non-negative safe integer');
  }
  const seen = new Set<string>();
  const result: RasterTileCoordinate[] = [];
  for (const tuple of tuples) {
    const { z, x, y } = tuple;
    if (
      !Number.isInteger(z) ||
      z < 0 ||
      z > 22 ||
      !Number.isInteger(x) ||
      !Number.isInteger(y)
    ) {
      throw new AuthoredRasterError(
        'AUTHORED_RASTER_TILE_COORDINATE_INVALID',
        'tileIterator yielded a non-integer or unsupported z/x/y tuple',
      );
    }
    const dimension = 2 ** z;
    if (x < 0 || x >= dimension || y < 0 || y >= dimension) {
      throw new AuthoredRasterError(
        'AUTHORED_RASTER_TILE_COORDINATE_INVALID',
        'tileIterator yielded an out-of-range XYZ tuple',
      );
    }
    const key = `${z}/${x}/${y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (result.length >= maxOwnedTuples) {
      throw new AuthoredRasterError(
        'AUTHORED_RASTER_TILE_LIMIT_EXCEEDED',
        'AUTHORED_RASTER_TILE_LIMIT_EXCEEDED: reduce area, maximum zoom, or raster layers',
      );
    }
    result.push({ z, x, y });
  }
  result.sort(
    (left, right) => left.z - right.z || left.x - right.x || left.y - right.y,
  );
  return result;
}

function validateCoverageConfig(
  map: RasterMapCoverageConfig,
): [number, number, number, number] {
  const [west, south, east, north] = map.bbox;
  if (
    ![west, south, east, north].every(Number.isFinite) ||
    west < -180 ||
    east > 180 ||
    south < -90 ||
    north > 90 ||
    west >= east ||
    south >= north
  ) {
    throw new AuthoredRasterError(
      'AUTHORED_RASTER_BBOX_INVALID',
      'Saved map bbox must be finite, non-empty, within WGS-84 bounds, and must not cross the antimeridian',
    );
  }
  if (
    !Number.isInteger(map.minZoom) ||
    map.minZoom < 0 ||
    map.minZoom > 22 ||
    !Number.isInteger(map.maxZoom) ||
    map.maxZoom < 0 ||
    map.maxZoom > 22 ||
    map.maxZoom < map.minZoom
  ) {
    throw new AuthoredRasterError(
      'AUTHORED_RASTER_ZOOM_INVALID',
      'Saved map zooms must be integers in 0..22 with maxZoom >= minZoom',
    );
  }
  const clampedSouth = Math.max(-MAX_WEB_MERCATOR_LAT, south);
  const clampedNorth = Math.min(MAX_WEB_MERCATOR_LAT, north);
  if (clampedSouth >= clampedNorth) {
    throw new AuthoredRasterError(
      'AUTHORED_RASTER_BBOX_INVALID',
      'Saved map bbox has no Web Mercator latitude coverage after clamping',
    );
  }
  return [west, clampedSouth, east, clampedNorth];
}

export function enumerateAuthoredRasterLayers(
  map: RasterMapCoverageConfig,
  layers: readonly AuthoredRasterLayerInput[],
): EnumeratedAuthoredRasterLayer[] {
  const bounds = validateCoverageConfig(map);
  let ownedTupleCount = 0;
  const result: EnumeratedAuthoredRasterLayer[] = [];

  for (const layer of layers) {
    const canonicalTemplate = canonicalizeRasterTileTemplate(
      layer.source.tiles[0],
    );
    const effectiveMinZoom = Math.max(
      map.minZoom,
      layer.source.minZoom ?? map.minZoom,
    );
    const effectiveMaxZoom = Math.min(
      map.maxZoom,
      layer.source.maxZoom ?? map.maxZoom,
    );
    if (effectiveMinZoom > effectiveMaxZoom) {
      throw new AuthoredRasterError(
        'AUTHORED_RASTER_EFFECTIVE_ZOOM_EMPTY',
        `Raster layer ${layer.layerId} has no zoom overlap with the saved map`,
      );
    }

    const coordinates = collectBoundedRasterTileTuples(
      tileIterator({
        bounds,
        minzoom: effectiveMinZoom,
        maxzoom: effectiveMaxZoom,
        bufferTiles: 0,
      }),
      {
        maxOwnedTuples: MAX_AUTHORED_RASTER_TILE_REQUESTS - ownedTupleCount,
      },
    );
    ownedTupleCount += coordinates.length;
    const tiles = coordinates.map((coordinate) => ({
      ...coordinate,
      requestHref: rasterTileRequestHref(
        canonicalTemplate,
        layer.source.scheme,
        coordinate,
      ),
    }));
    result.push({
      ...layer,
      source: { ...layer.source, tiles: [canonicalTemplate] },
      bounds: [...bounds],
      effectiveMinZoom,
      effectiveMaxZoom,
      tiles,
    });
  }
  return result;
}

export function createAuthoredRasterByteBudget(): AuthoredRasterByteBudget {
  return { bytesReceived: 0n };
}

type AnonymousRasterRequestHandle = {
  response: Response;
  requestSignal: AbortSignal;
  finish: () => void;
};

/** The only primitive in the authored-raster path that invokes browser fetch. */
export async function fetchAnonymousRasterRequest(
  requestHref: string,
  method: 'HEAD' | 'GET',
  signal: AbortSignal,
): Promise<AnonymousRasterRequestHandle> {
  const canonicalHref = validateConcreteAnonymousRasterHref(requestHref);
  const requestController = new AbortController();
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    signal.removeEventListener('abort', onOperationAbort);
  };
  const onOperationAbort = () => {
    if (!requestController.signal.aborted) {
      requestController.abort(
        signal.reason ?? new DOMException('Download cancelled', 'AbortError'),
      );
    }
  };
  if (signal.aborted) onOperationAbort();
  else signal.addEventListener('abort', onOperationAbort, { once: true });

  const timeout = setTimeout(() => {
    if (!requestController.signal.aborted) {
      requestController.abort(new RasterRequestTimeoutError());
    }
  }, RASTER_REQUEST_TIMEOUT_MS);

  try {
    if (requestController.signal.aborted) {
      throw abortReason(requestController.signal);
    }
    const fetchPromise = fetch(canonicalHref, {
      method,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      mode: 'cors',
      redirect: 'error',
      signal: requestController.signal,
    });
    // Observe the fetch immediately even when abort wins the race. Real browser
    // fetch honors AbortSignal, but the explicit race also bounds test doubles
    // and prevents a late rejection from becoming unhandled.
    void fetchPromise.catch(() => undefined);
    let onRequestAbort: (() => void) | undefined;
    const requestAborted = new Promise<never>((_resolve, reject) => {
      onRequestAbort = () => reject(abortReason(requestController.signal));
      requestController.signal.addEventListener('abort', onRequestAbort, {
        once: true,
      });
    });
    let response: Response;
    try {
      response = await Promise.race([fetchPromise, requestAborted]);
    } finally {
      if (onRequestAbort) {
        requestController.signal.removeEventListener('abort', onRequestAbort);
      }
    }
    if (!response.ok) {
      throw new AuthoredRasterError(
        'AUTHORED_RASTER_HTTP_ERROR',
        `Raster ${method} request failed with HTTP ${response.status}`,
      );
    }
    if (response.url !== canonicalHref) {
      throw new AuthoredRasterError(
        'AUTHORED_RASTER_RESPONSE_URL_MISMATCH',
        'Raster response URL did not match the canonical request URL',
      );
    }
    return { response, requestSignal: requestController.signal, finish };
  } catch (error) {
    finish();
    if (requestController.signal.aborted) {
      throw abortReason(requestController.signal);
    }
    throw normalizeFailure(error);
  }
}

function parseStrictContentLength(value: string | null): bigint | undefined {
  if (value === null || !/^(0|[1-9][0-9]*)$/.test(value)) return undefined;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

export async function headAnonymousRasterTileSize(
  requestHref: string,
  signal: AbortSignal,
): Promise<AnonymousRasterHeadSize> {
  let request: AnonymousRasterRequestHandle | undefined;
  try {
    request = await fetchAnonymousRasterRequest(requestHref, 'HEAD', signal);
    const bytes = parseStrictContentLength(
      request.response.headers.get('Content-Length'),
    );
    if (bytes === undefined) return { known: false };
    if (bytes > BigInt(MAX_AUTHORED_RASTER_TILE_BYTES)) {
      throw new AuthoredRasterError(
        'AUTHORED_RASTER_TILE_BYTES_EXCEEDED',
        `Declared raster tile size exceeds ${MAX_AUTHORED_RASTER_TILE_BYTES} bytes`,
      );
    }
    return { known: true, bytes };
  } catch (error) {
    if (signal.aborted) throw abortReason(signal);
    if (
      error instanceof AuthoredRasterError &&
      (error.code === 'AUTHORED_RASTER_TILE_BYTES_EXCEEDED' ||
        error.code === 'AUTHORED_RASTER_URL_INVALID')
    ) {
      throw error;
    }
    return { known: false };
  } finally {
    request?.finish();
  }
}

function createCancelOnce(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): (reason: unknown) => Promise<{ settled: true }> {
  let observed: Promise<{ settled: true }> | undefined;
  return (reason: unknown) => {
    if (observed) return observed;
    const error = normalizeFailure(reason);
    let raw: Promise<void>;
    try {
      raw = reader.cancel(error);
    } catch (cancelError) {
      raw = Promise.reject(cancelError);
    }
    observed = raw.then(
      () => ({ settled: true as const }),
      () => ({ settled: true as const }),
    );
    return observed;
  };
}

async function awaitRasterCleanupBounded(
  cancelPromise: Promise<{ settled: true }>,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), RASTER_STREAM_CLEANUP_TIMEOUT_MS);
  });
  try {
    return await Promise.race([cancelPromise.then(() => true), timedOut]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function readWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  const readPromise = reader.read();
  void readPromise.catch(() => undefined);
  if (signal.aborted) throw abortReason(signal);

  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(abortReason(signal));
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([readPromise, aborted]);
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}

function rasterFormatForMime(contentType: string | null): RasterTileFormat {
  const mime = contentType?.split(';', 1)[0]?.trim().toLowerCase();
  switch (mime) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    default:
      throw new AuthoredRasterError(
        'AUTHORED_RASTER_MIME_UNSUPPORTED',
        'Authored raster tiles must be image/png, image/jpeg, or image/webp',
      );
  }
}

export async function fetchAnonymousRasterTile(
  requestHref: string,
  signal: AbortSignal,
  byteBudget: AuthoredRasterByteBudget,
): Promise<FetchedAnonymousRasterTile> {
  let request: AnonymousRasterRequestHandle | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let reachedEof = false;
  let localError: Error | undefined;
  let cancelOnce: ((reason: unknown) => Promise<{ settled: true }>) | undefined;

  try {
    request = await fetchAnonymousRasterRequest(requestHref, 'GET', signal);
    const body = request.response.body;
    if (!body) {
      throw new AuthoredRasterError(
        'AUTHORED_RASTER_BODY_MISSING',
        'Raster GET response did not contain a readable body',
      );
    }

    // Ownership begins before MIME/Content-Length validation.
    reader = body.getReader();
    cancelOnce = createCancelOnce(reader);
    const format = rasterFormatForMime(
      request.response.headers.get('Content-Type'),
    );

    const contentLengthHeader = request.response.headers.get('Content-Length');
    if (contentLengthHeader !== null) {
      const declared = parseStrictContentLength(contentLengthHeader);
      if (declared === undefined) {
        throw new AuthoredRasterError(
          'AUTHORED_RASTER_CONTENT_LENGTH_INVALID',
          'Raster GET Content-Length is malformed',
        );
      }
      if (declared > BigInt(MAX_AUTHORED_RASTER_TILE_BYTES)) {
        throw new AuthoredRasterError(
          'AUTHORED_RASTER_TILE_BYTES_EXCEEDED',
          'Raster tile declared size exceeds the 4 MiB browser safety cap',
        );
      }
      if (
        byteBudget.bytesReceived + declared >
        BigInt(MAX_AUTHORED_RASTER_TOTAL_BYTES)
      ) {
        throw new AuthoredRasterError(
          'AUTHORED_RASTER_TOTAL_BYTES_EXCEEDED',
          'Authored raster declared bytes exceed the 96 MiB browser safety cap',
        );
      }
    }

    const chunks: Uint8Array[] = [];
    let tileBytes = 0n;
    while (true) {
      const { done, value } = await readWithAbort(
        reader,
        request.requestSignal,
      );
      if (done) {
        reachedEof = true;
        break;
      }
      const rawValue = value as unknown;
      let chunk: Uint8Array;
      if (rawValue instanceof Uint8Array) {
        chunk = rawValue;
      } else if (ArrayBuffer.isView(rawValue)) {
        chunk = new Uint8Array(
          rawValue.buffer,
          rawValue.byteOffset,
          rawValue.byteLength,
        );
      } else if (rawValue instanceof ArrayBuffer) {
        chunk = new Uint8Array(rawValue);
      } else {
        throw new AuthoredRasterError(
          'AUTHORED_RASTER_CHUNK_INVALID',
          'Raster response stream yielded a non-byte chunk',
        );
      }
      const chunkBytes = BigInt(chunk.byteLength);
      tileBytes += chunkBytes;
      byteBudget.bytesReceived += chunkBytes;
      if (tileBytes > BigInt(MAX_AUTHORED_RASTER_TILE_BYTES)) {
        throw new AuthoredRasterError(
          'AUTHORED_RASTER_TILE_BYTES_EXCEEDED',
          'Raster tile body exceeds the 4 MiB browser safety cap',
        );
      }
      if (byteBudget.bytesReceived > BigInt(MAX_AUTHORED_RASTER_TOTAL_BYTES)) {
        throw new AuthoredRasterError(
          'AUTHORED_RASTER_TOTAL_BYTES_EXCEEDED',
          'Authored raster bytes exceed the 96 MiB browser safety cap',
        );
      }
      chunks.push(chunk);
    }

    if (tileBytes === 0n) {
      throw new AuthoredRasterError(
        'AUTHORED_RASTER_TILE_EMPTY',
        'Raster tile body is empty',
      );
    }
    const bodyBytes = new Uint8Array(Number(tileBytes));
    let offset = 0;
    for (const chunk of chunks) {
      bodyBytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { body: bodyBytes, format, bytesReceived: tileBytes };
  } catch (error) {
    localError =
      signal.aborted && !(error instanceof RasterRequestTimeoutError)
        ? abortReason(signal)
        : normalizeFailure(error);
    throw localError;
  } finally {
    if (reader) {
      if (reachedEof) {
        try {
          reader.releaseLock();
        } catch {
          // Cleanup diagnostics are intentionally non-primary.
        }
      } else if (cancelOnce) {
        const cancelPromise = cancelOnce(
          request?.requestSignal.reason ??
            signal.reason ??
            localError ??
            new DOMException('Raster response cancelled', 'AbortError'),
        );
        const settled = await awaitRasterCleanupBounded(cancelPromise);
        if (settled) {
          try {
            reader.releaseLock();
          } catch {
            // Cleanup diagnostics are intentionally non-primary.
          }
        }
      }
    }
    request?.finish();
  }
}
