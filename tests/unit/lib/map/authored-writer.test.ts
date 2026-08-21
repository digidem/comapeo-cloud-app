import JSZip from 'jszip';
import { Writer } from 'styled-map-package-api/writer';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  EnumeratedAuthoredRasterLayer,
  FetchedAnonymousRasterTile,
} from '@/lib/map/authored-raster';
import {
  type AuthoredWriterLike,
  WRITER_ADD_TILE_TIMEOUT_MS,
  WRITER_CLEANUP_TIMEOUT_MS,
  WRITER_SETTLEMENT_TIMEOUT_MS,
  WRITER_TERMINAL_TIMEOUT_MS,
  WriterAddTileTimeoutError,
  WriterSettlementTimeoutError,
  WriterTerminalTimeoutError,
  buildAuthoredWriterSmp,
} from '@/lib/map/authored-writer';

const STYLE = {
  version: 8 as const,
  sources: {
    source: {
      type: 'raster' as const,
      tiles: ['https://tiles.example.com/{z}/{x}/{y}.png'],
      tileSize: 256,
    },
  },
  layers: [{ id: 'layer', type: 'raster' as const, source: 'source' }],
};

const RASTER_LAYER: EnumeratedAuthoredRasterLayer = {
  layerId: '22222222-2222-4222-8222-222222222222',
  sourceId: 'source',
  source: {
    type: 'raster-tiles',
    tiles: ['https://tiles.example.com/{z}/{x}/{y}.png'],
    tileSize: 256,
    scheme: 'tms',
  },
  bounds: [-1, -1, 1, 1],
  effectiveMinZoom: 3,
  effectiveMaxZoom: 3,
  tiles: [
    { z: 3, x: 4, y: 2, requestHref: 'https://tiles.example.com/3/4/5.png' },
  ],
};

function fetchedTile() {
  return {
    body: new Uint8Array([1, 2, 3]),
    format: 'png' as const,
    bytesReceived: 3n,
  };
}

function fakeWriter(
  options: {
    stream?: ReadableStream<Uint8Array>;
    addTile?: AuthoredWriterLike['addTile'];
    finish?: AuthoredWriterLike['finish'];
  } = {},
): AuthoredWriterLike {
  return {
    outputStream:
      options.stream ??
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      }),
    addTile: options.addTile ?? vi.fn(async () => undefined),
    finish: options.finish ?? vi.fn(async () => undefined),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('buildAuthoredWriterSmp', () => {
  it('exports the exact V1 Writer watchdog bounds', () => {
    expect(WRITER_ADD_TILE_TIMEOUT_MS).toBe(30_000);
    expect(WRITER_TERMINAL_TIMEOUT_MS).toBe(30_000);
    expect(WRITER_SETTLEMENT_TIMEOUT_MS).toBe(5_000);
    expect(WRITER_CLEANUP_TIMEOUT_MS).toBe(5_000);
  });

  it('skips Writer construction entirely when there are no raster sources', async () => {
    const writerFactory = vi.fn();
    await expect(
      buildAuthoredWriterSmp({
        authoredStyle: { version: 8, sources: {}, layers: [] },
        rasterLayers: [],
        writerFactory,
      }),
    ).resolves.toBeUndefined();
    expect(writerFactory).not.toHaveBeenCalled();
  });

  it('checks caller cancellation before Writer construction even with zero raster work', async () => {
    const controller = new AbortController();
    controller.abort('cancel-before-writer');
    const writerFactory = vi.fn();
    await expect(
      buildAuthoredWriterSmp({
        authoredStyle: { version: 8, sources: {}, layers: [] },
        rasterLayers: [],
        writerFactory,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ cause: 'cancel-before-writer' });
    expect(writerFactory).not.toHaveBeenCalled();
  });

  it('drains from construction, fetches replayable bytes, and preserves XYZ y for Writer.addTile', async () => {
    let outputController:
      ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        outputController = controller;
      },
    });
    const addTile = vi.fn(async () => undefined);
    const finish = vi.fn(async () => {
      outputController?.enqueue(new Uint8Array([7, 8]));
      outputController?.close();
    });
    const writer = fakeWriter({ stream, addTile, finish });
    const fetchTile = vi.fn(async () => fetchedTile());
    const result = await buildAuthoredWriterSmp({
      authoredStyle: STYLE,
      rasterLayers: [RASTER_LAYER],
      writerFactory: vi.fn(() => writer),
      fetchTile,
    });
    expect(fetchTile).toHaveBeenCalledWith(
      'https://tiles.example.com/3/4/5.png',
      expect.any(AbortSignal),
      expect.any(Object),
    );
    expect(addTile).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), {
      z: 3,
      x: 4,
      y: 2,
      sourceId: 'source',
      format: 'png',
    });
    expect(finish).toHaveBeenCalledTimes(1);
    expect(await result?.arrayBuffer()).toEqual(new Uint8Array([7, 8]).buffer);
  });

  it('times out a never-settling addTile and never calls finish', async () => {
    vi.useFakeTimers();
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        return new Promise<void>(() => undefined);
      },
    });
    const finish = vi.fn();
    const writer = fakeWriter({
      stream,
      addTile: vi.fn(() => new Promise<void>(() => undefined)),
      finish,
    });
    const promise = buildAuthoredWriterSmp({
      authoredStyle: STYLE,
      rasterLayers: [RASTER_LAYER],
      writerFactory: vi.fn(() => writer),
      fetchTile: vi.fn(async () => fetchedTile()),
    });
    const assertion = expect(promise).rejects.toBeInstanceOf(
      WriterAddTileTimeoutError,
    );
    await vi.advanceTimersByTimeAsync(
      WRITER_ADD_TILE_TIMEOUT_MS + WRITER_CLEANUP_TIMEOUT_MS,
    );
    await assertion;
    expect(finish).not.toHaveBeenCalled();
  });

  it('does not wait for a hung addTile after the output stream fails', async () => {
    vi.useFakeTimers();
    let outputController:
      ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        outputController = controller;
      },
    });
    const finish = vi.fn();
    const writer = fakeWriter({
      stream,
      addTile: vi.fn(() => new Promise<void>(() => undefined)),
      finish,
    });
    const primary = new Error('output exploded');
    const promise = buildAuthoredWriterSmp({
      authoredStyle: STYLE,
      rasterLayers: [RASTER_LAYER],
      writerFactory: vi.fn(() => writer),
      fetchTile: vi.fn(async () => fetchedTile()),
    });
    const assertion = expect(promise).rejects.toBe(primary);
    await Promise.resolve();
    outputController?.error(primary);
    await vi.advanceTimersByTimeAsync(WRITER_CLEANUP_TIMEOUT_MS);
    await assertion;
    expect(finish).not.toHaveBeenCalled();
  });

  it('fails when drain reaches EOF but finish hangs past settlement timeout', async () => {
    vi.useFakeTimers();
    const writer = fakeWriter({
      finish: vi.fn(() => new Promise<void>(() => undefined)),
    });
    const promise = buildAuthoredWriterSmp({
      authoredStyle: STYLE,
      rasterLayers: [RASTER_LAYER],
      writerFactory: vi.fn(() => writer),
      fetchTile: vi.fn(async () => fetchedTile()),
    });
    const assertion = expect(promise).rejects.toBeInstanceOf(
      WriterSettlementTimeoutError,
    );
    await vi.advanceTimersByTimeAsync(
      WRITER_SETTLEMENT_TIMEOUT_MS + WRITER_CLEANUP_TIMEOUT_MS,
    );
    await assertion;
  });

  it('fails when finish succeeds but output never reaches EOF', async () => {
    vi.useFakeTimers();
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        return new Promise<void>(() => undefined);
      },
    });
    const writer = fakeWriter({ stream, finish: vi.fn(async () => undefined) });
    const promise = buildAuthoredWriterSmp({
      authoredStyle: STYLE,
      rasterLayers: [RASTER_LAYER],
      writerFactory: vi.fn(() => writer),
      fetchTile: vi.fn(async () => fetchedTile()),
    });
    const assertion = expect(promise).rejects.toBeInstanceOf(
      WriterSettlementTimeoutError,
    );
    await vi.advanceTimersByTimeAsync(
      WRITER_SETTLEMENT_TIMEOUT_MS + WRITER_CLEANUP_TIMEOUT_MS,
    );
    await assertion;
  });

  it('uses the terminal timeout when finish and output both remain pending', async () => {
    vi.useFakeTimers();
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        return new Promise<void>(() => undefined);
      },
    });
    const writer = fakeWriter({
      stream,
      finish: vi.fn(() => new Promise<void>(() => undefined)),
    });
    const promise = buildAuthoredWriterSmp({
      authoredStyle: STYLE,
      rasterLayers: [RASTER_LAYER],
      writerFactory: vi.fn(() => writer),
      fetchTile: vi.fn(async () => fetchedTile()),
    });
    const assertion = expect(promise).rejects.toBeInstanceOf(
      WriterTerminalTimeoutError,
    );
    await vi.advanceTimersByTimeAsync(
      WRITER_TERMINAL_TIMEOUT_MS + WRITER_CLEANUP_TIMEOUT_MS,
    );
    await assertion;
  });

  it('preserves a non-Error first failure as the sole normalized primary error', async () => {
    vi.useFakeTimers();
    let outputController:
      ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        outputController = controller;
      },
    });
    const writer = fakeWriter({
      stream,
      addTile: vi.fn(() => new Promise<void>(() => undefined)),
    });
    const promise = buildAuthoredWriterSmp({
      authoredStyle: STYLE,
      rasterLayers: [RASTER_LAYER],
      writerFactory: vi.fn(() => writer),
      fetchTile: vi.fn(async () => fetchedTile()),
    });
    const assertion = expect(promise).rejects.toMatchObject({
      message: 'Authored raster packaging failed',
      cause: 'stream-non-error',
    });
    await Promise.resolve();
    outputController?.error('stream-non-error');
    await vi.advanceTimersByTimeAsync(WRITER_CLEANUP_TIMEOUT_MS);
    await assertion;
  });

  it('honors caller abort while a non-cooperative tile fetch is still pending', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const finish = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        return new Promise<void>(() => undefined);
      },
    });
    const promise = buildAuthoredWriterSmp({
      authoredStyle: STYLE,
      rasterLayers: [RASTER_LAYER],
      writerFactory: vi.fn(() => fakeWriter({ stream, finish })),
      fetchTile: vi.fn(
        () => new Promise<FetchedAnonymousRasterTile>(() => undefined),
      ),
      signal: controller.signal,
    });
    const assertion = expect(promise).rejects.toMatchObject({
      cause: 'caller-mid-fetch',
    });
    controller.abort('caller-mid-fetch');
    await vi.advanceTimersByTimeAsync(WRITER_CLEANUP_TIMEOUT_MS);
    await assertion;
    expect(finish).not.toHaveBeenCalled();
  });

  it('rechecks caller abort after workers settle and never calls finish', async () => {
    const controller = new AbortController();
    const finish = vi.fn();
    const addTile = vi.fn(async () => {
      controller.abort('post-worker-abort');
    });
    await expect(
      buildAuthoredWriterSmp({
        authoredStyle: STYLE,
        rasterLayers: [RASTER_LAYER],
        writerFactory: vi.fn(() => fakeWriter({ addTile, finish })),
        fetchTile: vi.fn(async () => fetchedTile()),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ cause: 'post-worker-abort' });
    expect(finish).not.toHaveBeenCalled();
  });

  it('preserves output failure that occurs after finish has begun', async () => {
    vi.useFakeTimers();
    let outputController:
      ReadableStreamDefaultController<Uint8Array> | undefined;
    let finishStarted = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        outputController = controller;
      },
    });
    const finish = vi.fn(() => {
      finishStarted = true;
      return new Promise<void>(() => undefined);
    });
    const writer = fakeWriter({ stream, finish });
    const primary = new Error('drain failed after finish');
    const promise = buildAuthoredWriterSmp({
      authoredStyle: STYLE,
      rasterLayers: [RASTER_LAYER],
      writerFactory: vi.fn(() => writer),
      fetchTile: vi.fn(async () => fetchedTile()),
    });
    while (!finishStarted) await Promise.resolve();
    const assertion = expect(promise).rejects.toBe(primary);
    outputController?.error(primary);
    await vi.advanceTimersByTimeAsync(WRITER_CLEANUP_TIMEOUT_MS);
    await assertion;
  });

  it('preserves finish rejection even when drain and cancel never settle', async () => {
    vi.useFakeTimers();
    const primary = new Error('finish-primary');
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        return new Promise<void>(() => undefined);
      },
      cancel() {
        return new Promise<void>(() => undefined);
      },
    });
    const promise = buildAuthoredWriterSmp({
      authoredStyle: STYLE,
      rasterLayers: [RASTER_LAYER],
      writerFactory: vi.fn(() =>
        fakeWriter({
          stream,
          finish: vi.fn(async () => Promise.reject(primary)),
        }),
      ),
      fetchTile: vi.fn(async () => fetchedTile()),
    });
    const assertion = expect(promise).rejects.toBe(primary);
    await vi.advanceTimersByTimeAsync(WRITER_CLEANUP_TIMEOUT_MS);
    await assertion;
  });
});

describe('styled-map-package-api pre.5 source normalization', () => {
  it('normalizes TMS sources to XYZ after fetching the pre-flipped TMS request href', async () => {
    const tmsStyle = {
      ...STYLE,
      sources: {
        source: {
          ...STYLE.sources.source,
          scheme: 'tms' as const,
        },
      },
    };
    const fetchTile = vi.fn(async () => fetchedTile());
    const blob = await buildAuthoredWriterSmp({
      authoredStyle: tmsStyle,
      rasterLayers: [RASTER_LAYER],
      fetchTile,
    });
    expect(fetchTile).toHaveBeenCalledWith(
      'https://tiles.example.com/3/4/5.png',
      expect.any(AbortSignal),
      expect.any(Object),
    );
    expect(blob).toBeDefined();
    if (!blob) return;

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const style = JSON.parse(await zip.file('style.json')!.async('string')) as {
      sources: Record<string, { scheme?: string }>;
      metadata?: { 'smp:sourceFolders'?: Record<string, string> };
    };
    expect(style.sources.source?.scheme).toBe('xyz');
    const folder = style.metadata?.['smp:sourceFolders']?.source;
    expect(folder).toBeDefined();
    expect(zip.file(`${folder}/3/4/2.png`)).not.toBeNull();
  });
});

describe('styled-map-package-api pre.5 cancellation regression', () => {
  it('outputReader.cancel makes an otherwise-open real Writer finish settle/reject', async () => {
    const writer = new Writer(STYLE, { dedupe: false });
    const reader = writer.outputStream.getReader();
    await writer.addTile(new Uint8Array([1, 2, 3]), {
      z: 0,
      x: 0,
      y: 0,
      sourceId: 'source',
      format: 'png',
    });
    const finishPromise = writer.finish();
    void finishPromise.catch(() => undefined);
    const reason = new Error('cancel-real-writer');
    await reader.cancel(reason);
    await expect(finishPromise).rejects.toBeDefined();
  });
});
