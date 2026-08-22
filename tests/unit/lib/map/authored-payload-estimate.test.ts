import {
  AUTHORED_RASTER_LAYER_FIXTURE,
  AUTHORED_VECTOR_LAYER_FIXTURE,
} from '@tests/fixtures/authored-layers';
import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MAX_BASE_STYLE_JSON_BYTES_FOR_AUTHORED } from '@/lib/map/authored-layers';
import {
  buildSmpBlob,
  estimateAuthoredPayload,
  estimateDownloadSize,
} from '@/lib/map/smp-download';

const { mockDownload, mockGetStyle, MockStyleDownloader } = vi.hoisted(() => {
  const mockGetStyle = vi.fn();
  const MockStyleDownloader = vi.fn(function (this: {
    getStyle?: typeof mockGetStyle;
  }) {
    this.getStyle = mockGetStyle;
  });
  return { mockDownload: vi.fn(), mockGetStyle, MockStyleDownloader };
});

vi.mock('styled-map-package-api/download', () => ({ download: mockDownload }));
vi.mock('styled-map-package-api/style-downloader', () => ({
  StyleDownloader: MockStyleDownloader,
}));

function map(overrides: Record<string, unknown> = {}) {
  return {
    type: 'raster' as const,
    styleUrl: 'https://basemap.example.com/{z}/{x}/{y}.png',
    bbox: [-1, -1, 1, 1] as [number, number, number, number],
    minZoom: 0,
    maxZoom: 0,
    attribution: 'Example',
    scheme: 'xyz' as const,
    ...overrides,
  };
}

function styleMap(overrides: Record<string, unknown> = {}) {
  return {
    type: 'style' as const,
    styleUrl: 'https://styles.example.com/style.json',
    bbox: [-1, -1, 1, 1] as [number, number, number, number],
    minZoom: 0,
    maxZoom: 0,
    ...overrides,
  };
}

async function regionalBytes(): Promise<Uint8Array> {
  return regionalBytesForStyle({
    version: 8,
    sources: {
      raster: {
        type: 'raster',
        tiles: ['smp://maps.v1/s/0/{z}/{x}/{y}.png'],
        minzoom: 0,
        maxzoom: 0,
      },
    },
    layers: [{ id: 'raster', type: 'raster', source: 'raster' }],
    metadata: {
      'smp:bounds': [-1, -1, 1, 1],
      'smp:maxzoom': 0,
      'smp:sourceFolders': { raster: 's/0' },
    },
  });
}

async function regionalBytesForStyle(style: unknown): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('VERSION', '1.0');
  zip.file('style.json', JSON.stringify(style));
  zip.file('s/0/0/0/0.png', new Uint8Array([9]));
  return zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
}

function stream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function responseWithUrl(
  body: BodyInit | null,
  init: ResponseInit,
  url: string,
): Response {
  const response = new Response(body, init);
  Object.defineProperty(response, 'url', { configurable: true, value: url });
  return response;
}

afterEach(() => {
  mockDownload.mockReset();
  mockGetStyle.mockReset();
  MockStyleDownloader.mockClear();
  vi.unstubAllGlobals();
});

describe('buildSmpBlob', () => {
  it('preserves the legacy no-authored package result shape', async () => {
    const bytes = await regionalBytes();
    mockDownload.mockReturnValue(stream(bytes));
    const built = await buildSmpBlob({
      map: map(),
      authoredLayers: [],
      includeGlobalOverview: false,
    });
    expect(built.blob.size).toBe(bytes.byteLength);
    expect(built.smpSize).toBe(bytes.byteLength);
    expect(built.skippedTiles).toBe(0);
  });

  it('packages vector-only authored data without constructing/fetching raster Writer data', async () => {
    const bytes = await regionalBytes();
    mockDownload.mockReturnValue(stream(bytes));
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const built = await buildSmpBlob({
      map: map(),
      authoredLayers: [AUTHORED_VECTOR_LAYER_FIXTURE],
      includeGlobalOverview: false,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    const zip = await JSZip.loadAsync(await built.blob.arrayBuffer());
    const style = JSON.parse(await zip.file('style.json')!.async('string')) as {
      sources: Record<string, unknown>;
      layers: Array<{ id: string; layout?: { visibility?: string } }>;
    };
    expect(
      Object.keys(style.sources).some((id) =>
        id.startsWith('comapeo-authored:'),
      ),
    ).toBe(true);
    expect(
      style.layers.filter((layer) => layer.id.startsWith('comapeo-authored:')),
    ).toHaveLength(4);
  });

  it('treats an authored raster GET failure as fatal rather than skipped basemap tiles', async () => {
    const bytes = await regionalBytes();
    mockDownload.mockReturnValue(stream(bytes));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const href = String(input);
        if (
          init?.method === 'GET' &&
          href.startsWith('https://tiles.example.com/')
        ) {
          return responseWithUrl(null, { status: 503 }, href);
        }
        throw new Error(`Unexpected fetch ${href}`);
      }),
    );
    await expect(
      buildSmpBlob({
        map: map(),
        authoredLayers: [AUTHORED_RASTER_LAYER_FIXTURE],
        includeGlobalOverview: false,
      }),
    ).rejects.toThrow();
  });

  it('fails the 10,001st owned raster tuple before basemap download or authored fetch work', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(
      buildSmpBlob({
        map: map({ bbox: [-180, -85, 180, 85], maxZoom: 7 }),
        authoredLayers: [AUTHORED_RASTER_LAYER_FIXTURE],
        includeGlobalOverview: false,
      }),
    ).rejects.toThrow(/AUTHORED_RASTER_TILE_LIMIT_EXCEEDED/);
    expect(mockDownload).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('preflights the actual downloaded base style before any authored raster GET', async () => {
    const hugeStyle = {
      version: 8,
      sources: {
        raster: {
          type: 'raster',
          tiles: ['smp://maps.v1/s/0/{z}/{x}/{y}.png'],
        },
      },
      layers: [{ id: 'raster', type: 'raster', source: 'raster' }],
      metadata: {
        'smp:sourceFolders': { raster: 's/0' },
        // The bounded walker rejects this scalar well before a whole final style
        // can be serialized or any authored Writer work begins.
        huge: 'x'.repeat(256 * 1024 + 1),
      },
    };
    mockDownload.mockReturnValue(
      stream(await regionalBytesForStyle(hugeStyle)),
    );
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(
      buildSmpBlob({
        map: map(),
        authoredLayers: [AUTHORED_RASTER_LAYER_FIXTURE],
        includeGlobalOverview: false,
      }),
    ).rejects.toThrow(/supported JSON boundary|base style/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('packages a hidden authored raster only for the regional tuple set even with global overview enabled', async () => {
    const bytes = await regionalBytes();
    mockDownload.mockImplementation(() => stream(bytes));
    const getRequests: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const href = String(input);
        if (init?.method !== 'GET')
          throw new Error(`Unexpected method ${init?.method}`);
        getRequests.push(href);
        return responseWithUrl(
          new Uint8Array([1, 2, 3]),
          {
            status: 200,
            headers: { 'Content-Type': 'image/png', 'Content-Length': '3' },
          },
          href,
        );
      }),
    );
    const built = await buildSmpBlob({
      map: map(),
      authoredLayers: [AUTHORED_RASTER_LAYER_FIXTURE],
      includeGlobalOverview: true,
    });
    expect(mockDownload).toHaveBeenCalledTimes(2);
    expect(getRequests).toEqual(['https://tiles.example.com/0/0/0.png']);
    const zip = await JSZip.loadAsync(await built.blob.arrayBuffer());
    const style = JSON.parse(await zip.file('style.json')!.async('string')) as {
      layers: Array<{ id: string; layout?: { visibility?: string } }>;
    };
    const authored = style.layers.filter((layer) =>
      layer.id.startsWith('comapeo-authored:'),
    );
    expect(authored).toHaveLength(1);
    expect(authored[0]?.layout?.visibility).toBe('none');
  });

  it('GETs identical authored tile URLs separately for distinct layer namespaces', async () => {
    const bytes = await regionalBytes();
    mockDownload.mockReturnValue(stream(bytes));
    const second = {
      ...AUTHORED_RASTER_LAYER_FIXTURE,
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Second owner',
    };
    const getRequests: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const href = String(input);
        expect(init?.method).toBe('GET');
        getRequests.push(href);
        return responseWithUrl(
          new Uint8Array([1]),
          {
            status: 200,
            headers: { 'Content-Type': 'image/png', 'Content-Length': '1' },
          },
          href,
        );
      }),
    );
    await buildSmpBlob({
      map: map(),
      authoredLayers: [AUTHORED_RASTER_LAYER_FIXTURE, second],
      includeGlobalOverview: false,
    });
    expect(getRequests).toEqual([
      'https://tiles.example.com/0/0/0.png',
      'https://tiles.example.com/0/0/0.png',
    ]);
  });
});

describe('estimateAuthoredPayload', () => {
  it('loads style-map base styles through StyleDownloader before composition', async () => {
    mockGetStyle.mockResolvedValue({
      version: 8,
      sources: {},
      layers: [],
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await estimateAuthoredPayload({
      map: styleMap(),
      authoredLayers: [AUTHORED_VECTOR_LAYER_FIXTURE],
      includeGlobalOverview: false,
    });

    expect(MockStyleDownloader).toHaveBeenCalledWith(
      'https://styles.example.com/style.json',
    );
    expect(mockGetStyle).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.finalStyleUtf8Bytes).toBeGreaterThan(0n);
  });

  it('rejects an oversized fetched style-map base style at the authored JSON boundary', async () => {
    const value = 'x'.repeat(1024);
    const entryCount =
      Math.ceil(MAX_BASE_STYLE_JSON_BYTES_FOR_AUTHORED / value.length) + 512;
    mockGetStyle.mockResolvedValue({
      version: 8,
      sources: {},
      layers: [],
      metadata: Object.fromEntries(
        Array.from({ length: entryCount }, (_, index) => [`k${index}`, value]),
      ),
    });

    await expect(
      estimateAuthoredPayload({
        map: styleMap(),
        authoredLayers: [AUTHORED_VECTOR_LAYER_FIXTURE],
        includeGlobalOverview: false,
      }),
    ).rejects.toThrow(/base style exceeds the supported JSON boundary/i);
    expect(mockGetStyle).toHaveBeenCalledTimes(1);
  });

  it('counts known HEAD bytes plus basemap heuristic and final style exactly once', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const href = String(input);
        expect(init?.method).toBe('HEAD');
        return responseWithUrl(
          null,
          { status: 200, headers: { 'Content-Length': '123' } },
          href,
        );
      }),
    );
    const result = await estimateAuthoredPayload({
      map: map(),
      authoredLayers: [AUTHORED_RASTER_LAYER_FIXTURE],
      includeGlobalOverview: false,
    });
    const basemap = BigInt(estimateDownloadSize([-1, -1, 1, 1], 0, 0));
    expect(result.basemapTileBytes).toBe(basemap);
    expect(result.authoredRasterBytesKnown).toBe(true);
    expect(result.authoredRasterKnownBytes).toBe(123n);
    expect(result.knownLowerBoundBytes).toBe(
      basemap + result.finalStyleUtf8Bytes + 123n,
    );
    expect(result.safeTotalBytes).toBe(Number(result.knownLowerBoundBytes));
    expect(result.requiresLargeDownloadConfirmation).toBe(false);
  });

  it('uses conservative confirmation when a HEAD size is unknown', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        responseWithUrl(null, { status: 200 }, String(input)),
      ),
    );
    const result = await estimateAuthoredPayload({
      map: map(),
      authoredLayers: [AUTHORED_RASTER_LAYER_FIXTURE],
      includeGlobalOverview: false,
    });
    expect(result.authoredRasterBytesKnown).toBe(false);
    expect(result.safeTotalBytes).toBeUndefined();
    expect(result.requiresLargeDownloadConfirmation).toBe(true);
  });

  it('memoizes HEAD by request href but counts bytes independently per layer owner', async () => {
    const head = vi.fn(async (input: RequestInfo | URL) =>
      responseWithUrl(
        null,
        { status: 200, headers: { 'Content-Length': '10' } },
        String(input),
      ),
    );
    vi.stubGlobal('fetch', head);
    const second = {
      ...AUTHORED_RASTER_LAYER_FIXTURE,
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Second owner',
    };
    const result = await estimateAuthoredPayload({
      map: map(),
      authoredLayers: [AUTHORED_RASTER_LAYER_FIXTURE, second],
      includeGlobalOverview: false,
    });
    expect(head).toHaveBeenCalledTimes(1);
    expect(result.authoredRasterKnownBytes).toBe(20n);
  });

  it('requires confirmation for a safely representable total above the existing 100 MiB threshold', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        responseWithUrl(
          null,
          { status: 200, headers: { 'Content-Length': '0' } },
          String(input),
        ),
      ),
    );
    const largeMap = map({
      bbox: [-180, -85, 180, 85],
      maxZoom: 6,
    });
    const result = await estimateAuthoredPayload({
      map: largeMap,
      authoredLayers: [],
      includeGlobalOverview: false,
    });
    expect(result.safeTotalBytes).toBeGreaterThan(100 * 1024 * 1024);
    expect(result.requiresLargeDownloadConfirmation).toBe(true);
  });

  it('propagates caller cancellation before issuing authored HEAD requests', async () => {
    const controller = new AbortController();
    controller.abort('estimate-stop');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(
      estimateAuthoredPayload({
        map: map(),
        authoredLayers: [AUTHORED_RASTER_LAYER_FIXTURE],
        includeGlobalOverview: false,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ cause: 'estimate-stop' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
