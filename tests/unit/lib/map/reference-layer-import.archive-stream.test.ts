import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_REFERENCE_ARCHIVE_ENTRY_BYTES,
  MAX_REFERENCE_ARCHIVE_UNCOMPRESSED_BYTES,
} from '@/lib/map/reference-layer-import';

type FakeArchiveEntry = {
  name: string;
  isDirectory: boolean;
  compressedSize: number;
  uncompressedSize: number;
  zip64: boolean;
  isEncrypted: boolean;
  compressionMethod: number;
  readable: () => ReadableStream<Uint8Array>;
};

function fakeEntry(name: string, emittedBytes: number): FakeArchiveEntry {
  return {
    name,
    isDirectory: false,
    compressedSize: 1,
    uncompressedSize: 1,
    zip64: false,
    isEncrypted: false,
    compressionMethod: 0,
    readable: () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(emittedBytes));
          controller.close();
        },
      }),
  };
}

async function prepareWithFakeArchive(
  entries: readonly FakeArchiveEntry[],
  file: File,
  signal?: AbortSignal,
) {
  const fakeZip = {
    isZip64: false,
    async *[Symbol.asyncIterator]() {
      for (const entry of entries) yield entry;
    },
  };

  vi.resetModules();
  vi.doMock('@gmaclennan/zip-reader', () => ({
    ZipReader: {
      from: vi.fn(async () => fakeZip),
    },
  }));
  vi.doMock('@gmaclennan/zip-reader/blob-source', () => ({
    BlobSource: class BlobSource {},
  }));

  const { prepareReferenceImportBatch } =
    await import('@/lib/map/reference-layer-import');
  return prepareReferenceImportBatch(
    [file],
    { minZoom: 0, maxZoom: 22 },
    signal ? { signal } : undefined,
  );
}

describe('reference layer import actual archive stream bounds', () => {
  afterEach(() => {
    vi.doUnmock('@gmaclennan/zip-reader');
    vi.doUnmock('@gmaclennan/zip-reader/blob-source');
    vi.resetModules();
  });

  it('rejects an actually emitted entry above 10 MiB even when metadata declares it small', async () => {
    const result = await prepareWithFakeArchive(
      [fakeEntry('doc.kml', MAX_REFERENCE_ARCHIVE_ENTRY_BYTES + 1)],
      new File(['tiny'], 'reference.kmz', {
        type: 'application/vnd.google-earth.kmz',
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({
      kind: 'conversion',
      error: { code: 'archive-entry-too-large', format: 'kmz' },
    });
  });

  it('propagates caller cancellation during entry streaming instead of mapping it to archive-invalid', async () => {
    const controller = new AbortController();
    const cancelSpy = vi.fn(async () => undefined);
    const entry = fakeEntry('doc.kml', 1);
    entry.readable = () =>
      ({
        getReader: () => ({
          closed: Promise.resolve(undefined),
          read: async () => {
            controller.abort();
            return { done: false as const, value: new Uint8Array([60]) };
          },
          cancel: cancelSpy,
          releaseLock: vi.fn(),
        }),
      }) as unknown as ReadableStream<Uint8Array>;

    await expect(
      prepareWithFakeArchive(
        [entry],
        new File(['tiny'], 'reference.kmz', {
          type: 'application/vnd.google-earth.kmz',
        }),
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });

  it('does not hang indefinitely when stream cancellation itself never settles', async () => {
    const controller = new AbortController();
    const releaseLockSpy = vi.fn();
    const entry = fakeEntry('doc.kml', 1);
    entry.readable = () =>
      ({
        getReader: () => ({
          closed: Promise.resolve(undefined),
          read: async () => {
            controller.abort();
            return { done: false as const, value: new Uint8Array([60]) };
          },
          cancel: () => new Promise<never>(() => undefined),
          releaseLock: releaseLockSpy,
        }),
      }) as unknown as ReadableStream<Uint8Array>;

    const outcome = await Promise.race([
      prepareWithFakeArchive(
        [entry],
        new File(['tiny'], 'reference.kmz', {
          type: 'application/vnd.google-earth.kmz',
        }),
        controller.signal,
      ).then(
        () => ({ kind: 'resolved' as const }),
        (error: unknown) => ({ kind: 'rejected' as const, error }),
      ),
      new Promise<{ kind: 'timeout' }>((resolve) => {
        setTimeout(() => resolve({ kind: 'timeout' }), 250);
      }),
    ]);

    expect(outcome.kind).toBe('rejected');
    if (outcome.kind !== 'rejected') return;
    expect(outcome.error).toMatchObject({ name: 'AbortError' });
    expect(releaseLockSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects actual aggregate emitted data above 20 MiB across selected Shapefile bodies', async () => {
    const eightMiB = 8 * 1024 * 1024;
    const overRemainingBudget =
      MAX_REFERENCE_ARCHIVE_UNCOMPRESSED_BYTES - eightMiB * 2 + 1;
    const result = await prepareWithFakeArchive(
      [
        fakeEntry('data.shp', eightMiB),
        fakeEntry('data.dbf', eightMiB),
        fakeEntry('data.prj', overRemainingBudget),
      ],
      new File(['tiny'], 'reference.zip', { type: 'application/zip' }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({
      kind: 'conversion',
      error: {
        code: 'archive-uncompressed-too-large',
        format: 'shapefile-zip',
      },
    });
  });
});
