import JSZip from 'jszip';
import { Writer } from 'styled-map-package-api/writer';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_SMP_CENTRAL_DIRECTORY_BYTES,
  MAX_SMP_MERGED_OUTPUT_BYTES,
  MAX_SMP_MERGE_ENTRIES,
  MAX_SMP_MERGE_ENTRY_BYTES,
  MAX_SMP_MERGE_INPUT_BYTES,
  MAX_SMP_MERGE_UNCOMPRESSED_BYTES,
  createSmpZipAggregateBudget,
  decodeCanonicalSmpZipName,
  inspectSmpZipCentralDirectory,
  readBoundedSmpZipEntry,
  validateSmpZipLocalEntryLayout,
} from '@/lib/map/smp-zip';

async function makeZip(
  compression: 'STORE' | 'DEFLATE' = 'STORE',
): Promise<Blob> {
  const zip = new JSZip();
  zip.file('VERSION', '1.0');
  zip.file(
    'style.json',
    JSON.stringify({ version: 8, sources: {}, layers: [] }),
  );
  zip.file('s/0/0/0/0.png', new Uint8Array([1, 2, 3, 4]));
  return zip.generateAsync({ type: 'blob', compression });
}

async function makeWriterZip(): Promise<Blob> {
  const writer = new Writer(
    {
      version: 8,
      sources: {
        source: {
          type: 'raster',
          tiles: ['https://tiles.example.com/{z}/{x}/{y}.png'],
          tileSize: 256,
        },
      },
      layers: [{ id: 'layer', type: 'raster', source: 'source' }],
    },
    { dedupe: false },
  );
  const reader = writer.outputStream.getReader();
  const chunks: Uint8Array[] = [];
  const drain = (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  })();
  await writer.addTile(new Uint8Array([1, 2, 3]), {
    z: 0,
    x: 0,
    y: 0,
    sourceId: 'source',
    format: 'png',
  });
  await writer.finish();
  await drain;
  return new Blob(chunks as BlobPart[], { type: 'application/zip' });
}

function mutateUint16(
  bytes: Uint8Array,
  offset: number,
  value: number,
): Uint8Array {
  const copy = bytes.slice();
  new DataView(copy.buffer, copy.byteOffset, copy.byteLength).setUint16(
    offset,
    value,
    true,
  );
  return copy;
}

function mutateUint32(
  bytes: Uint8Array,
  offset: number,
  value: number,
): Uint8Array {
  const copy = bytes.slice();
  new DataView(copy.buffer, copy.byteOffset, copy.byteLength).setUint32(
    offset,
    value,
    true,
  );
  return copy;
}

function findSignature(bytes: Uint8Array, signature: number, from = 0): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = from; offset <= bytes.byteLength - 4; offset += 1) {
    if (view.getUint32(offset, true) === signature) return offset;
  }
  return -1;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SMP ZIP central-directory inspection', () => {
  it('exports the non-bypassable authored merge limits', () => {
    expect(MAX_SMP_MERGE_INPUT_BYTES).toBe(192 * 1024 * 1024);
    expect(MAX_SMP_MERGE_ENTRIES).toBe(20_000);
    expect(MAX_SMP_CENTRAL_DIRECTORY_BYTES).toBe(16 * 1024 * 1024);
    expect(MAX_SMP_MERGE_ENTRY_BYTES).toBe(32 * 1024 * 1024);
    expect(MAX_SMP_MERGE_UNCOMPRESSED_BYTES).toBe(160 * 1024 * 1024);
    expect(MAX_SMP_MERGED_OUTPUT_BYTES).toBe(256 * 1024 * 1024);
  });

  it('inspects a canonical classic ZIP and records exact central metadata', async () => {
    const blob = await makeZip('STORE');
    const inspection = await inspectSmpZipCentralDirectory(blob);
    expect(inspection.entries.map((entry) => entry.name)).toEqual([
      'VERSION',
      'style.json',
      's/',
      's/0/',
      's/0/0/',
      's/0/0/0/',
      's/0/0/0/0.png',
    ]);
    expect(
      inspection.centralDirectoryOffset + inspection.centralDirectorySize,
    ).toBe(inspection.eocdOffset);
    expect(
      inspection.entries.find((entry) => entry.name === 'style.json'),
    ).toMatchObject({
      compressionMethod: 0,
      isDirectory: false,
    });
  });

  it.each([
    ['plain/ascii.txt', 0],
    ['unicodé/雪.txt', 1 << 11],
    ['folder/', 0],
  ] as const)('decodes canonical name %s', (name, flags) => {
    const raw = new TextEncoder().encode(name);
    expect(decodeCanonicalSmpZipName(raw, flags)).toBe(name);
  });

  it.each([
    '../evil.txt',
    './evil.txt',
    '/absolute.txt',
    'C:/drive.txt',
    'a//b.txt',
    'a\\b.txt',
    'a/../b.txt',
  ])('rejects unsafe canonical name %s', (name) => {
    expect(() =>
      decodeCanonicalSmpZipName(new TextEncoder().encode(name), 1 << 11),
    ).toThrow();
  });

  it('rejects trailing/polyglot bytes because the EOCD must end exactly at blob.size', async () => {
    const blob = await makeZip();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const withTrailing = new Blob([bytes, new Uint8Array([0])]);
    await expect(inspectSmpZipCentralDirectory(withTrailing)).rejects.toThrow();
  });

  it('rejects ZIP64 sentinel values in the EOCD', async () => {
    const blob = await makeZip();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const eocd = findSignature(bytes, 0x06054b50);
    expect(eocd).toBeGreaterThanOrEqual(0);
    const copy = bytes.slice();
    const view = new DataView(copy.buffer, copy.byteOffset, copy.byteLength);
    view.setUint16(eocd + 10, 0xffff, true);
    await expect(
      inspectSmpZipCentralDirectory(new Blob([copy])),
    ).rejects.toThrow(/ZIP64/i);
  });

  it('rejects unsupported compression methods from the central directory', async () => {
    const blob = await makeZip();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const central = findSignature(bytes, 0x02014b50);
    expect(central).toBeGreaterThanOrEqual(0);
    const copy = bytes.slice();
    new DataView(copy.buffer, copy.byteOffset, copy.byteLength).setUint16(
      central + 10,
      99,
      true,
    );
    await expect(
      inspectSmpZipCentralDirectory(new Blob([copy])),
    ).rejects.toThrow(/compression/i);
  });

  it('rejects unsupported general-purpose flags from the central directory', async () => {
    const blob = await makeZip();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const central = findSignature(bytes, 0x02014b50);
    expect(central).toBeGreaterThanOrEqual(0);
    const mutated = mutateUint16(bytes, central + 8, 0x0001);
    await expect(
      inspectSmpZipCentralDirectory(
        new Blob([
          mutated.buffer.slice(
            mutated.byteOffset,
            mutated.byteOffset + mutated.byteLength,
          ) as ArrayBuffer,
        ]),
      ),
    ).rejects.toThrow(/general-purpose flags|flags/i);
  });

  it('rejects central-directory entries that claim a nonzero start disk', async () => {
    const blob = await makeZip();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const central = findSignature(bytes, 0x02014b50);
    expect(central).toBeGreaterThanOrEqual(0);
    const mutated = mutateUint16(bytes, central + 34, 1);
    await expect(
      inspectSmpZipCentralDirectory(
        new Blob([
          mutated.buffer.slice(
            mutated.byteOffset,
            mutated.byteOffset + mutated.byteLength,
          ) as ArrayBuffer,
        ]),
      ),
    ).rejects.toThrow(/multi-disk/i);
  });

  it('rejects duplicate canonical entry names', async () => {
    const zip = new JSZip();
    zip.file('a.txt', 'a');
    zip.file('b.txt', 'b');
    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'STORE',
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const firstCentral = findSignature(bytes, 0x02014b50);
    const secondCentral = findSignature(bytes, 0x02014b50, firstCentral + 4);
    expect(firstCentral).toBeGreaterThanOrEqual(0);
    expect(secondCentral).toBeGreaterThan(firstCentral);
    const mutated = bytes.slice();
    mutated[secondCentral + 46] = 'a'.charCodeAt(0);
    await expect(
      inspectSmpZipCentralDirectory(new Blob([mutated])),
    ).rejects.toThrow(/duplicate canonical ZIP entry name/i);
  });

  it('rejects a declared entry above the per-entry uncompressed cap', async () => {
    const blob = await makeZip();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const central = findSignature(bytes, 0x02014b50);
    const mutated = mutateUint32(
      bytes,
      central + 24,
      MAX_SMP_MERGE_ENTRY_BYTES + 1,
    );
    await expect(
      inspectSmpZipCentralDirectory(
        new Blob([
          mutated.buffer.slice(
            mutated.byteOffset,
            mutated.byteOffset + mutated.byteLength,
          ) as ArrayBuffer,
        ]),
      ),
    ).rejects.toThrow(/32 MiB|entry/i);
  });
});

describe('bounded SMP ZIP entry reads', () => {
  it.each(['STORE', 'DEFLATE'] as const)(
    'reads and CRC-validates %s entries',
    async (compression) => {
      const blob = await makeZip(compression);
      const inspection = await inspectSmpZipCentralDirectory(blob);
      await validateSmpZipLocalEntryLayout(blob, inspection);
      const styleEntry = inspection.entries.find(
        (entry) => entry.name === 'style.json',
      );
      expect(styleEntry).toBeDefined();
      const bytes = await readBoundedSmpZipEntry(
        blob,
        styleEntry!,
        createSmpZipAggregateBudget(),
        new AbortController().signal,
        inspection,
      );
      expect(JSON.parse(new TextDecoder().decode(bytes))).toMatchObject({
        version: 8,
      });
    },
  );

  it('rejects overlapping local entry/data ranges', async () => {
    const blob = await makeZip('STORE');
    const inspection = await inspectSmpZipCentralDirectory(blob);
    const ordered = [...inspection.entries].sort(
      (left, right) => left.localHeaderOffset - right.localHeaderOffset,
    );
    const first = ordered[0]!;
    const second = ordered[1]!;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const copy = bytes.slice();
    const view = new DataView(copy.buffer, copy.byteOffset, copy.byteLength);
    const nameLength = view.getUint16(first.localHeaderOffset + 26, true);
    const extraLength = view.getUint16(first.localHeaderOffset + 28, true);
    const dataStart = first.localHeaderOffset + 30 + nameLength + extraLength;
    const overlappingCompressedSize = second.localHeaderOffset - dataStart + 1;
    expect(overlappingCompressedSize).toBeGreaterThan(0);
    view.setUint32(
      first.localHeaderOffset + 18,
      overlappingCompressedSize,
      true,
    );
    const firstCentral = findSignature(copy, 0x02014b50);
    expect(firstCentral).toBeGreaterThanOrEqual(0);
    view.setUint32(firstCentral + 20, overlappingCompressedSize, true);

    const mutated = new Blob([copy]);
    const mutatedInspection = await inspectSmpZipCentralDirectory(mutated);
    await expect(
      validateSmpZipLocalEntryLayout(mutated, mutatedInspection),
    ).rejects.toThrow(/overlap/i);
  });

  it('rejects a local filename that does not match the central raw bytes', async () => {
    const blob = await makeZip('STORE');
    const inspection = await inspectSmpZipCentralDirectory(blob);
    const entry = inspection.entries.find(
      (candidate) => candidate.name === 'VERSION',
    )!;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const localNameOffset = entry.localHeaderOffset + 30;
    const copy = bytes.slice();
    copy[localNameOffset] = 'X'.charCodeAt(0);
    await expect(
      readBoundedSmpZipEntry(
        new Blob([copy]),
        entry,
        createSmpZipAggregateBudget(),
        new AbortController().signal,
        inspection,
      ),
    ).rejects.toThrow(/filename|name/i);
  });

  it('rejects CRC mismatch after bounded streaming read', async () => {
    const blob = await makeZip('STORE');
    const inspection = await inspectSmpZipCentralDirectory(blob);
    const entry = inspection.entries.find(
      (candidate) => candidate.name === 'VERSION',
    )!;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const nameLength = view.getUint16(entry.localHeaderOffset + 26, true);
    const extraLength = view.getUint16(entry.localHeaderOffset + 28, true);
    const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength;
    const copy = bytes.slice();
    copy[dataStart] = (copy[dataStart] ?? 0) ^ 0xff;
    await expect(
      readBoundedSmpZipEntry(
        new Blob([copy]),
        entry,
        createSmpZipAggregateBudget(),
        new AbortController().signal,
        inspection,
      ),
    ).rejects.toThrow(/CRC/i);
  });

  it('fails closed when deflate-raw is unavailable', async () => {
    const blob = await makeZip('DEFLATE');
    const inspection = await inspectSmpZipCentralDirectory(blob);
    const entry = inspection.entries.find(
      (candidate) => candidate.name === 'style.json',
    )!;
    vi.stubGlobal('DecompressionStream', undefined);
    await expect(
      readBoundedSmpZipEntry(
        blob,
        entry,
        createSmpZipAggregateBudget(),
        new AbortController().signal,
        inspection,
      ),
    ).rejects.toThrow(/deflate-raw|browser/i);
  });

  it('propagates caller cancellation before retaining entry bytes', async () => {
    const blob = await makeZip('STORE');
    const inspection = await inspectSmpZipCentralDirectory(blob);
    const entry = inspection.entries.find(
      (candidate) => candidate.name === 'style.json',
    )!;
    const controller = new AbortController();
    controller.abort('zip-stop');
    await expect(
      readBoundedSmpZipEntry(
        blob,
        entry,
        createSmpZipAggregateBudget(),
        controller.signal,
        inspection,
      ),
    ).rejects.toMatchObject({ cause: 'zip-stop' });
  });

  it('accepts and reads the real Writer data-descriptor form', async () => {
    const blob = await makeWriterZip();
    const inspection = await inspectSmpZipCentralDirectory(blob);
    expect(
      inspection.entries.some(
        (entry) => (entry.generalPurposeFlags & 0x0008) !== 0,
      ),
    ).toBe(true);
    await validateSmpZipLocalEntryLayout(blob, inspection);
    const styleEntry = inspection.entries.find(
      (candidate) => candidate.name === 'style.json',
    )!;
    const bytes = await readBoundedSmpZipEntry(
      blob,
      styleEntry,
      createSmpZipAggregateBudget(),
      new AbortController().signal,
      inspection,
    );
    expect(JSON.parse(new TextDecoder().decode(bytes))).toMatchObject({
      version: 8,
    });
  });

  it('stops a DEFLATE zip bomb at the emitted-byte cap even when headers claim one byte', async () => {
    const zip = new JSZip();
    zip.file('bomb.bin', new Uint8Array(MAX_SMP_MERGE_ENTRY_BYTES + 1));
    const original = new Uint8Array(
      await (
        await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
      ).arrayBuffer(),
    );
    const local = findSignature(original, 0x04034b50);
    const central = findSignature(original, 0x02014b50);
    expect(local).toBeGreaterThanOrEqual(0);
    expect(central).toBeGreaterThanOrEqual(0);
    const copy = original.slice();
    const view = new DataView(copy.buffer, copy.byteOffset, copy.byteLength);
    view.setUint32(local + 22, 1, true);
    view.setUint32(central + 24, 1, true);
    const blob = new Blob([
      copy.buffer.slice(
        copy.byteOffset,
        copy.byteOffset + copy.byteLength,
      ) as ArrayBuffer,
    ]);
    const inspection = await inspectSmpZipCentralDirectory(blob);
    const entry = inspection.entries.find(
      (candidate) => candidate.name === 'bomb.bin',
    )!;
    expect(entry.uncompressedSize).toBe(1);
    await expect(
      readBoundedSmpZipEntry(
        blob,
        entry,
        createSmpZipAggregateBudget(),
        new AbortController().signal,
        inspection,
      ),
    ).rejects.toMatchObject({ code: 'SMP_ZIP_ENTRY_BYTES_EXCEEDED' });
  }, 20_000);
});
