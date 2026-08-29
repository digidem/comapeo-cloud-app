import { AUTHORED_RASTER_LAYER_FIXTURE } from '@tests/fixtures/authored-layers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_AUTHORED_RASTER_TILE_BYTES,
  MAX_AUTHORED_RASTER_TILE_REQUESTS,
  MAX_AUTHORED_RASTER_TOTAL_BYTES,
  MAX_WEB_MERCATOR_LAT,
  RASTER_REQUEST_TIMEOUT_MS,
  RASTER_STREAM_CLEANUP_TIMEOUT_MS,
  RasterRequestTimeoutError,
  collectBoundedRasterTileTuples,
  createAuthoredRasterByteBudget,
  enumerateAuthoredRasterLayers,
  fetchAnonymousRasterTile,
  headAnonymousRasterTileSize,
  rasterTileRequestHref,
} from '@/lib/map/authored-raster';

function responseWithUrl(
  body: BodyInit | null,
  init: ResponseInit,
  url: string,
): Response {
  const response = new Response(body, init);
  Object.defineProperty(response, 'url', { configurable: true, value: url });
  return response;
}

function rasterSource() {
  if (AUTHORED_RASTER_LAYER_FIXTURE.source.type !== 'raster-tiles') {
    throw new Error('fixture must be raster');
  }
  return AUTHORED_RASTER_LAYER_FIXTURE.source;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('authored raster tile coverage', () => {
  it('exports the fixed V1 work/resource bounds', () => {
    expect(MAX_WEB_MERCATOR_LAT).toBe(85.0511287798066);
    expect(MAX_AUTHORED_RASTER_TILE_REQUESTS).toBe(10_000);
    expect(MAX_AUTHORED_RASTER_TILE_BYTES).toBe(4 * 1024 * 1024);
    expect(MAX_AUTHORED_RASTER_TOTAL_BYTES).toBe(96 * 1024 * 1024);
  });

  it('uses pinned tileIterator semantics in deterministic z/x/y order', () => {
    const result = enumerateAuthoredRasterLayers(
      { bbox: [-1, -1, 1, 1], minZoom: 0, maxZoom: 1 },
      [
        {
          layerId: AUTHORED_RASTER_LAYER_FIXTURE.id,
          sourceId: 'source',
          source: rasterSource(),
        },
      ],
    );
    expect(result[0]?.tiles.map(({ z, x, y }) => [z, x, y])).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [1, 1, 0],
      [1, 1, 1],
    ]);
  });

  it('clamps latitude only to Web Mercator', () => {
    const result = enumerateAuthoredRasterLayers(
      { bbox: [-10, -90, 10, 90], minZoom: 0, maxZoom: 0 },
      [
        {
          layerId: AUTHORED_RASTER_LAYER_FIXTURE.id,
          sourceId: 'source',
          source: rasterSource(),
        },
      ],
    );
    expect(result[0]?.bounds).toEqual([
      -10,
      -MAX_WEB_MERCATOR_LAT,
      10,
      MAX_WEB_MERCATOR_LAT,
    ]);
  });

  it.each([
    [0, -1, 0, 1],
    [-1, 0, 1, 0],
    [170, -10, -170, 10],
    [Number.NaN, -1, 1, 1],
  ])('rejects invalid/non-V1 bbox %#', (west, south, east, north) => {
    expect(() =>
      enumerateAuthoredRasterLayers(
        { bbox: [west, south, east, north], minZoom: 0, maxZoom: 1 },
        [
          {
            layerId: AUTHORED_RASTER_LAYER_FIXTURE.id,
            sourceId: 'source',
            source: rasterSource(),
          },
        ],
      ),
    ).toThrow();
  });

  it('accepts exactly 10,000 tuples and rejects tuple 10,001', () => {
    function* tuples(count: number) {
      for (let index = 0; index < count; index += 1)
        yield { z: 20, x: index, y: 0 };
    }
    expect(
      collectBoundedRasterTileTuples(
        tuples(MAX_AUTHORED_RASTER_TILE_REQUESTS),
        {
          maxOwnedTuples: MAX_AUTHORED_RASTER_TILE_REQUESTS,
        },
      ),
    ).toHaveLength(MAX_AUTHORED_RASTER_TILE_REQUESTS);
    expect(() =>
      collectBoundedRasterTileTuples(
        tuples(MAX_AUTHORED_RASTER_TILE_REQUESTS + 1),
        {
          maxOwnedTuples: MAX_AUTHORED_RASTER_TILE_REQUESTS,
        },
      ),
    ).toThrow(/AUTHORED_RASTER_TILE_LIMIT_EXCEEDED/);
  });
});

describe('raster request href', () => {
  it('uses XYZ y unchanged and TMS flips request y only', () => {
    const template = 'https://tiles.example.com/{z}/{x}/{y}.png';
    expect(rasterTileRequestHref(template, 'xyz', { z: 3, x: 4, y: 2 })).toBe(
      'https://tiles.example.com/3/4/2.png',
    );
    expect(rasterTileRequestHref(template, 'tms', { z: 3, x: 4, y: 2 })).toBe(
      'https://tiles.example.com/3/4/5.png',
    );
  });
});

describe('anonymous raster HEAD/GET', () => {
  it('rejects reserved concrete raster hosts even with a trailing DNS root dot', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      headAnonymousRasterTileSize(
        'https://tiles.internal./1/2/3.png',
        new AbortController().signal,
      ),
    ).rejects.toThrow(/external DNS hostname/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('HEAD uses the exact anonymous request policy and strict Content-Length', async () => {
    const href = 'https://tiles.example.com/1/2/3.png';
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init).toMatchObject({
          method: 'HEAD',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          mode: 'cors',
          redirect: 'error',
        });
        expect(init?.headers).toBeUndefined();
        return responseWithUrl(
          null,
          { status: 200, headers: { 'Content-Length': '123' } },
          href,
        );
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      headAnonymousRasterTileSize(href, new AbortController().signal),
    ).resolves.toEqual({ known: true, bytes: 123n });
  });

  it('streams GET without arrayBuffer and maps supported MIME', async () => {
    const href = 'https://tiles.example.com/1/2/3.png';
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3]));
        controller.close();
      },
    });
    const response = responseWithUrl(
      body,
      {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg; charset=binary' },
      },
      href,
    );
    const arrayBufferSpy = vi.spyOn(response, 'arrayBuffer');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response),
    );
    const budget = createAuthoredRasterByteBudget();
    const tile = await fetchAnonymousRasterTile(
      href,
      new AbortController().signal,
      budget,
    );
    expect(tile).toMatchObject({ format: 'jpg', bytesReceived: 3n });
    expect(tile.body).toEqual(new Uint8Array([1, 2, 3]));
    expect(budget.bytesReceived).toBe(3n);
    expect(arrayBufferSpy).not.toHaveBeenCalled();
  });

  it('cancels the owned response body when MIME fails before the first read', async () => {
    const href = 'https://tiles.example.com/1/2/3.png';
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        responseWithUrl(
          body,
          {
            status: 200,
            headers: { 'Content-Type': 'application/octet-stream' },
          },
          href,
        ),
      ),
    );
    await expect(
      fetchAnonymousRasterTile(
        href,
        new AbortController().signal,
        createAuthoredRasterByteBudget(),
      ),
    ).rejects.toThrow();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('enforces per-tile and aggregate streaming byte budgets', async () => {
    const href = 'https://tiles.example.com/1/2/3.png';
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_AUTHORED_RASTER_TILE_BYTES));
        controller.enqueue(new Uint8Array([1]));
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        responseWithUrl(
          body,
          { status: 200, headers: { 'Content-Type': 'image/png' } },
          href,
        ),
      ),
    );
    await expect(
      fetchAnonymousRasterTile(
        href,
        new AbortController().signal,
        createAuthoredRasterByteBudget(),
      ),
    ).rejects.toThrow();

    const body2 = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        responseWithUrl(
          body2,
          { status: 200, headers: { 'Content-Type': 'image/png' } },
          href,
        ),
      ),
    );
    const budget = createAuthoredRasterByteBudget();
    budget.bytesReceived = BigInt(MAX_AUTHORED_RASTER_TOTAL_BYTES - 1);
    await expect(
      fetchAnonymousRasterTile(href, new AbortController().signal, budget),
    ).rejects.toThrow();
    // The rejected chunk was already received, so its bytes remain charged.
    expect(budget.bytesReceived).toBe(
      BigInt(MAX_AUTHORED_RASTER_TOTAL_BYTES + 1),
    );
  });

  it.each(['', '-1', '01', '1.5', '+1', '1e3'])(
    'treats malformed HEAD Content-Length %j as unknown',
    async (contentLength) => {
      const href = 'https://tiles.example.com/1/2/3.png';
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          responseWithUrl(
            null,
            { status: 200, headers: { 'Content-Length': contentLength } },
            href,
          ),
        ),
      );
      await expect(
        headAnonymousRasterTileSize(href, new AbortController().signal),
      ).resolves.toEqual({ known: false });
    },
  );

  it('treats ordinary HEAD network failures as unknown but propagates caller abort', async () => {
    const href = 'https://tiles.example.com/1/2/3.png';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('CORS'))),
    );
    await expect(
      headAnonymousRasterTileSize(href, new AbortController().signal),
    ).resolves.toEqual({ known: false });

    const controller = new AbortController();
    controller.abort('caller-stop');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(
      headAnonymousRasterTileSize(href, controller.signal),
    ).rejects.toMatchObject({
      cause: 'caller-stop',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects oversized declared HEAD length as unsupported rather than unknown', async () => {
    const href = 'https://tiles.example.com/1/2/3.png';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        responseWithUrl(
          null,
          {
            status: 200,
            headers: {
              'Content-Length': String(MAX_AUTHORED_RASTER_TILE_BYTES + 1),
            },
          },
          href,
        ),
      ),
    );
    await expect(
      headAnonymousRasterTileSize(href, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'AUTHORED_RASTER_TILE_BYTES_EXCEEDED' });
  });

  it('rejects malformed GET Content-Length through owned-stream cleanup', async () => {
    const href = 'https://tiles.example.com/1/2/3.png';
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        responseWithUrl(
          body,
          {
            status: 200,
            headers: { 'Content-Type': 'image/png', 'Content-Length': '01' },
          },
          href,
        ),
      ),
    );
    await expect(
      fetchAnonymousRasterTile(
        href,
        new AbortController().signal,
        createAuthoredRasterByteBudget(),
      ),
    ).rejects.toMatchObject({ code: 'AUTHORED_RASTER_CONTENT_LENGTH_INVALID' });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('rejects an empty successful tile body', async () => {
    const href = 'https://tiles.example.com/1/2/3.png';
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        responseWithUrl(
          body,
          { status: 200, headers: { 'Content-Type': 'image/webp' } },
          href,
        ),
      ),
    );
    await expect(
      fetchAnonymousRasterTile(
        href,
        new AbortController().signal,
        createAuthoredRasterByteBudget(),
      ),
    ).rejects.toMatchObject({ code: 'AUTHORED_RASTER_TILE_EMPTY' });
  });

  it('times out a non-cooperative pre-header fetch', async () => {
    vi.useFakeTimers();
    const href = 'https://tiles.example.com/1/2/3.png';
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    const promise = fetchAnonymousRasterTile(
      href,
      new AbortController().signal,
      createAuthoredRasterByteBudget(),
    );
    const assertion = expect(promise).rejects.toBeInstanceOf(
      RasterRequestTimeoutError,
    );
    await vi.advanceTimersByTimeAsync(RASTER_REQUEST_TIMEOUT_MS);
    await assertion;
  });

  it('times out a stalled response body and cancels it', async () => {
    vi.useFakeTimers();
    const href = 'https://tiles.example.com/1/2/3.png';
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      pull() {
        return new Promise<void>(() => undefined);
      },
      cancel,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        responseWithUrl(
          body,
          { status: 200, headers: { 'Content-Type': 'image/png' } },
          href,
        ),
      ),
    );
    const promise = fetchAnonymousRasterTile(
      href,
      new AbortController().signal,
      createAuthoredRasterByteBudget(),
    );
    const assertion = expect(promise).rejects.toBeInstanceOf(
      RasterRequestTimeoutError,
    );
    await vi.advanceTimersByTimeAsync(RASTER_REQUEST_TIMEOUT_MS);
    await assertion;
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('bounds cleanup when response cancellation never settles', async () => {
    vi.useFakeTimers();
    const href = 'https://tiles.example.com/1/2/3.png';
    const cancel = vi.fn(() => new Promise<void>(() => undefined));
    const body = new ReadableStream<Uint8Array>({ cancel });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        responseWithUrl(
          body,
          {
            status: 200,
            headers: { 'Content-Type': 'application/octet-stream' },
          },
          href,
        ),
      ),
    );
    const promise = fetchAnonymousRasterTile(
      href,
      new AbortController().signal,
      createAuthoredRasterByteBudget(),
    );
    const assertion = expect(promise).rejects.toMatchObject({
      code: 'AUTHORED_RASTER_MIME_UNSUPPORTED',
    });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(RASTER_STREAM_CLEANUP_TIMEOUT_MS);
    await assertion;
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
