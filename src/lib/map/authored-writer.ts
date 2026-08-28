import { Writer } from 'styled-map-package-api/writer';

import { MAX_AUTHORED_WRITER_OUTPUT_BYTES } from '@/lib/map/authored-layers';
import {
  AUTHORED_RASTER_CONCURRENCY,
  type AuthoredRasterByteBudget,
  AuthoredRasterError,
  type EnumeratedAuthoredRasterLayer,
  type FetchedAnonymousRasterTile,
  MAX_AUTHORED_RASTER_TILE_REQUESTS,
  createAuthoredRasterByteBudget,
  fetchAnonymousRasterTile,
} from '@/lib/map/authored-raster';

export const WRITER_ADD_TILE_TIMEOUT_MS = 30_000;
export const WRITER_TERMINAL_TIMEOUT_MS = 30_000;
export const WRITER_SETTLEMENT_TIMEOUT_MS = 5_000;
export const WRITER_CLEANUP_TIMEOUT_MS = 5_000;

export class WriterAddTileTimeoutError extends Error {
  readonly code = 'WRITER_ADD_TILE_TIMEOUT' as const;

  constructor() {
    super(
      `Writer.addTile did not settle within ${WRITER_ADD_TILE_TIMEOUT_MS} ms`,
    );
    this.name = 'WriterAddTileTimeoutError';
  }
}

export class WriterTerminalTimeoutError extends Error {
  readonly code = 'WRITER_TERMINAL_TIMEOUT' as const;

  constructor() {
    super(
      `Writer finish/output did not begin settling within ${WRITER_TERMINAL_TIMEOUT_MS} ms`,
    );
    this.name = 'WriterTerminalTimeoutError';
  }
}

export class WriterSettlementTimeoutError extends Error {
  readonly code = 'WRITER_SETTLEMENT_TIMEOUT' as const;

  constructor(message: string) {
    super(message);
    this.name = 'WriterSettlementTimeoutError';
  }
}

export type AuthoredWriterLike = {
  readonly outputStream: ReadableStream<Uint8Array>;
  addTile(
    tileData: Uint8Array,
    options: {
      z: number;
      x: number;
      y: number;
      sourceId: string;
      format: 'png' | 'jpg' | 'webp';
    },
  ): Promise<void>;
  finish(): Promise<void>;
};

export type AuthoredWriterFactory = (style: unknown) => AuthoredWriterLike;
export type AuthoredRasterTileFetcher = (
  requestHref: string,
  signal: AbortSignal,
  byteBudget: AuthoredRasterByteBudget,
) => Promise<FetchedAnonymousRasterTile>;

export type BuildAuthoredWriterSmpConfig = {
  authoredStyle: unknown;
  rasterLayers: readonly EnumeratedAuthoredRasterLayer[];
  signal?: AbortSignal;
  writerFactory?: AuthoredWriterFactory;
  fetchTile?: AuthoredRasterTileFetcher;
};

type FirstFailure = {
  original: unknown;
  error: Error;
};

type DrainResult = { ok: true } | { ok: false; error: Error };

type TerminalEvent =
  | { source: 'finish'; ok: true }
  | { source: 'finish'; ok: false; error: Error }
  | { source: 'drain'; ok: true }
  | { source: 'drain'; ok: false; error: Error };

function normalizeFailure(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  return new Error('Authored raster packaging failed', { cause: reason });
}

function defaultWriterFactory(style: unknown): AuthoredWriterLike {
  return new Writer(style, { dedupe: false }) as AuthoredWriterLike;
}

/**
 * Observe cleanup promises immediately, then wait for them only through the
 * fixed cleanup bound. Cleanup failure/timeout is diagnostic only and never
 * replaces the operation's already-recorded primary error.
 */
export async function awaitWriterCleanupBounded(
  promises: readonly Promise<unknown>[],
): Promise<void> {
  const observed = promises.map((promise) =>
    Promise.resolve(promise).then(
      () => undefined,
      () => undefined,
    ),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, WRITER_CLEANUP_TIMEOUT_MS);
  });
  try {
    await Promise.race([
      Promise.allSettled(observed).then(() => undefined),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function addTileWithTimeout(
  writer: AuthoredWriterLike,
  tile: FetchedAnonymousRasterTile,
  options: Parameters<AuthoredWriterLike['addTile']>[1],
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const addPromise = writer.addTile(tile.body, options);
  void addPromise.catch(() => undefined);
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new WriterAddTileTimeoutError()),
      WRITER_ADD_TILE_TIMEOUT_MS,
    );
  });
  try {
    await Promise.race([addPromise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

type FatalTerminalEvent = { source: 'fatal'; failure: FirstFailure };

async function raceTerminalWithTimeout(
  finish: Promise<TerminalEvent>,
  drain: Promise<TerminalEvent>,
  fatal: Promise<FirstFailure>,
): Promise<
  TerminalEvent | FatalTerminalEvent | { source: 'terminal-timeout' }
> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ source: 'terminal-timeout' }>((resolve) => {
    timer = setTimeout(
      () => resolve({ source: 'terminal-timeout' }),
      WRITER_TERMINAL_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([
      finish,
      drain,
      fatal.then((failure) => ({ source: 'fatal' as const, failure })),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function waitForCounterpart(
  promise: Promise<TerminalEvent>,
  fatal: Promise<FirstFailure>,
  timeoutError: WriterSettlementTimeoutError,
): Promise<
  | TerminalEvent
  | FatalTerminalEvent
  | { source: 'settlement-timeout'; error: Error }
> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{
    source: 'settlement-timeout';
    error: Error;
  }>((resolve) => {
    timer = setTimeout(
      () => resolve({ source: 'settlement-timeout', error: timeoutError }),
      WRITER_SETTLEMENT_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([
      promise,
      fatal.then((failure) => ({ source: 'fatal' as const, failure })),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function buildAuthoredWriterSmp(
  config: BuildAuthoredWriterSmpConfig,
): Promise<Blob | undefined> {
  const {
    authoredStyle,
    rasterLayers,
    signal: callerSignal,
    writerFactory = defaultWriterFactory,
    fetchTile = fetchAnonymousRasterTile,
  } = config;

  if (callerSignal?.aborted) {
    throw normalizeFailure(
      callerSignal.reason ??
        new DOMException('Download cancelled', 'AbortError'),
    );
  }
  if (rasterLayers.length === 0) return undefined;

  let declaredTileCount = 0;
  for (const layer of rasterLayers) {
    declaredTileCount += layer.tiles.length;
    if (declaredTileCount > MAX_AUTHORED_RASTER_TILE_REQUESTS) {
      throw new AuthoredRasterError(
        'AUTHORED_RASTER_TILE_LIMIT_EXCEEDED',
        `Authored raster packaging supports at most ${MAX_AUTHORED_RASTER_TILE_REQUESTS} owned tile requests`,
      );
    }
  }

  const operationController = new AbortController();
  let firstFailure: FirstFailure | undefined;
  let resolveFatal: ((failure: FirstFailure) => void) | undefined;
  const fatalPromise = new Promise<FirstFailure>((resolve) => {
    resolveFatal = resolve;
  });
  const recordPrimaryFailure = (reason: unknown): FirstFailure => {
    if (firstFailure) return firstFailure;
    const error = normalizeFailure(reason);
    firstFailure = { original: reason, error };
    resolveFatal?.(firstFailure);
    return firstFailure;
  };
  const abortOperation = (failure: FirstFailure) => {
    if (!operationController.signal.aborted) {
      operationController.abort(failure.error);
    }
  };

  let outputReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let cancelOutputOnce: ((reason: unknown) => Promise<void>) | undefined;
  let cancelOutputPromise: Promise<void> | undefined;
  let cancelOutputSettled = false;
  let drainSettled = false;
  let drainPromise: Promise<DrainResult> | undefined;
  let workersPromise: Promise<PromiseSettledResult<void>[]> | undefined;
  let finishPromise: Promise<void> | undefined;

  const onCallerAbort = () => {
    const failure = recordPrimaryFailure(
      callerSignal?.reason ??
        new DOMException('Download cancelled', 'AbortError'),
    );
    abortOperation(failure);
    if (cancelOutputOnce) void cancelOutputOnce(failure.error);
  };
  callerSignal?.addEventListener('abort', onCallerAbort, { once: true });

  const cleanupAndThrow = async (
    failure: FirstFailure,
    extraPromises: readonly Promise<unknown>[] = [],
  ): Promise<never> => {
    abortOperation(failure);
    if (cancelOutputOnce) {
      void cancelOutputOnce(failure.error);
    }
    const cleanup: Promise<unknown>[] = [...extraPromises];
    if (workersPromise) cleanup.push(workersPromise);
    if (drainPromise) cleanup.push(drainPromise);
    if (cancelOutputPromise) cleanup.push(cancelOutputPromise);
    await awaitWriterCleanupBounded(cleanup);
    throw failure.error;
  };

  try {
    if (callerSignal?.aborted) {
      throw normalizeFailure(
        callerSignal.reason ??
          new DOMException('Download cancelled', 'AbortError'),
      );
    }

    let writer: AuthoredWriterLike;
    try {
      writer = writerFactory(authoredStyle);
    } catch (error) {
      const failure = recordPrimaryFailure(error);
      await awaitWriterCleanupBounded([]);
      throw failure.error;
    }

    try {
      outputReader = writer.outputStream.getReader();
    } catch (error) {
      const failure = recordPrimaryFailure(error);
      await awaitWriterCleanupBounded([]);
      throw failure.error;
    }

    let cancellationRequested = false;
    cancelOutputOnce = (reason: unknown): Promise<void> => {
      if (cancelOutputPromise) return cancelOutputPromise;
      cancellationRequested = true;
      const error = normalizeFailure(reason);
      let raw: Promise<void>;
      try {
        raw = outputReader!.cancel(error);
      } catch (cancelError) {
        raw = Promise.reject(cancelError);
      }
      // Attach both observers immediately so a late cancel rejection can never
      // become unhandled. The primary operation error is preserved elsewhere.
      cancelOutputPromise = raw.then(
        () => {
          cancelOutputSettled = true;
        },
        () => {
          cancelOutputSettled = true;
        },
      );
      return cancelOutputPromise;
    };

    const outputChunks: Uint8Array[] = [];
    drainPromise = (async (): Promise<DrainResult> => {
      let outputBytes = 0n;
      try {
        while (true) {
          const { done, value } = await outputReader!.read();
          if (done) return { ok: true };
          const nextBytes = outputBytes + BigInt(value.byteLength);
          if (nextBytes > BigInt(MAX_AUTHORED_WRITER_OUTPUT_BYTES)) {
            const failure = recordPrimaryFailure(
              new Error(
                `Authored Writer output exceeds ${MAX_AUTHORED_WRITER_OUTPUT_BYTES} bytes`,
              ),
            );
            abortOperation(failure);
            void cancelOutputOnce!(failure.error);
            return { ok: false, error: failure.error };
          }
          outputBytes = nextBytes;
          outputChunks.push(value);
        }
      } catch (error) {
        const failure = recordPrimaryFailure(error);
        abortOperation(failure);
        return { ok: false, error: failure.error };
      } finally {
        drainSettled = true;
      }
    })();
    // The drain catches every read rejection internally, but observe it here as
    // well so future refactors cannot accidentally introduce an unhandled path.
    void drainPromise.then(
      () => undefined,
      () => undefined,
    );

    const work = rasterLayers.flatMap((layer) =>
      layer.tiles.map((tile) => ({ layer, tile })),
    );
    const byteBudget = createAuthoredRasterByteBudget();
    let cursor = 0;

    const runWorker = async (): Promise<void> => {
      try {
        while (true) {
          if (operationController.signal.aborted) {
            throw (
              operationController.signal.reason ??
              new DOMException('Download cancelled', 'AbortError')
            );
          }
          const index = cursor;
          cursor += 1;
          const item = work[index];
          if (!item) return;
          const fetched = await fetchTile(
            item.tile.requestHref,
            operationController.signal,
            byteBudget,
          );
          if (operationController.signal.aborted) {
            throw (
              operationController.signal.reason ??
              new DOMException('Download cancelled', 'AbortError')
            );
          }
          await addTileWithTimeout(writer, fetched, {
            z: item.tile.z,
            x: item.tile.x,
            y: item.tile.y,
            sourceId: item.layer.sourceId,
            format: fetched.format,
          });
        }
      } catch (error) {
        const failure = recordPrimaryFailure(error);
        abortOperation(failure);
        throw failure.error;
      }
    };

    if (callerSignal?.aborted) onCallerAbort();
    if (firstFailure) {
      return await cleanupAndThrow(firstFailure);
    }

    const workerCount = Math.min(AUTHORED_RASTER_CONCURRENCY, work.length);
    const workers = Array.from({ length: workerCount }, () => runWorker());
    for (const worker of workers) void worker.catch(() => undefined);
    workersPromise = Promise.allSettled(workers);
    void workersPromise.then(
      () => undefined,
      () => undefined,
    );

    const workerOutcome = await Promise.race([
      workersPromise.then((results) => ({ kind: 'workers' as const, results })),
      fatalPromise.then((failure) => ({ kind: 'fatal' as const, failure })),
    ]);
    if (workerOutcome.kind === 'fatal') {
      return await cleanupAndThrow(workerOutcome.failure);
    }
    const rejectedWorker = workerOutcome.results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (rejectedWorker) {
      const failure = recordPrimaryFailure(rejectedWorker.reason);
      return await cleanupAndThrow(failure);
    }

    if (callerSignal?.aborted) onCallerAbort();
    if (operationController.signal.aborted || firstFailure) {
      const failure =
        firstFailure ??
        recordPrimaryFailure(
          operationController.signal.reason ??
            new DOMException('Download cancelled', 'AbortError'),
        );
      return await cleanupAndThrow(failure);
    }

    // Finalization begins only after every worker fulfilled and after a final
    // cancellation/failure check. finish() is called exactly once.
    try {
      finishPromise = writer.finish();
    } catch (error) {
      const failure = recordPrimaryFailure(error);
      return await cleanupAndThrow(failure);
    }
    const finishObserved: Promise<TerminalEvent> = finishPromise.then(
      () => ({ source: 'finish', ok: true }),
      (error: unknown) => ({
        source: 'finish',
        ok: false,
        error: normalizeFailure(error),
      }),
    );
    const drainObserved: Promise<TerminalEvent> = drainPromise.then((result) =>
      result.ok
        ? { source: 'drain', ok: true }
        : { source: 'drain', ok: false, error: result.error },
    );

    const firstTerminal = await raceTerminalWithTimeout(
      finishObserved,
      drainObserved,
      fatalPromise,
    );
    if (firstTerminal.source === 'fatal') {
      return await cleanupAndThrow(firstTerminal.failure, [finishPromise]);
    }
    if (firstTerminal.source === 'terminal-timeout') {
      const failure = recordPrimaryFailure(new WriterTerminalTimeoutError());
      return await cleanupAndThrow(failure, [finishPromise]);
    }
    if (!firstTerminal.ok) {
      const failure = recordPrimaryFailure(firstTerminal.error);
      return await cleanupAndThrow(failure, [finishPromise]);
    }

    const counterpart =
      firstTerminal.source === 'drain'
        ? await waitForCounterpart(
            finishObserved,
            fatalPromise,
            new WriterSettlementTimeoutError(
              'finish did not settle after output EOF',
            ),
          )
        : await waitForCounterpart(
            drainObserved,
            fatalPromise,
            new WriterSettlementTimeoutError(
              'output did not reach EOF after finish',
            ),
          );

    if (counterpart.source === 'fatal') {
      return await cleanupAndThrow(counterpart.failure, [finishPromise]);
    }
    if (counterpart.source === 'settlement-timeout') {
      const failure = recordPrimaryFailure(counterpart.error);
      return await cleanupAndThrow(failure, [finishPromise]);
    }
    if (!counterpart.ok) {
      const failure = recordPrimaryFailure(counterpart.error);
      return await cleanupAndThrow(failure, [finishPromise]);
    }

    if (
      firstFailure ||
      cancellationRequested ||
      operationController.signal.aborted
    ) {
      const failure =
        firstFailure ??
        recordPrimaryFailure(
          operationController.signal.reason ??
            new DOMException('Download cancelled', 'AbortError'),
        );
      return await cleanupAndThrow(failure, [finishPromise]);
    }

    return new Blob(outputChunks as BlobPart[], { type: 'application/zip' });
  } finally {
    callerSignal?.removeEventListener('abort', onCallerAbort);
    if (outputReader && (drainSettled || cancelOutputSettled)) {
      try {
        outputReader.releaseLock();
      } catch {
        // Cleanup-only diagnostic. Never replace the operation result.
      }
    }
  }
}
