export const MAX_SMP_MERGE_INPUT_BYTES = 192 * 1024 * 1024;
export const MAX_SMP_MERGE_ENTRIES = 20_000;
export const MAX_SMP_CENTRAL_DIRECTORY_BYTES = 16 * 1024 * 1024;
export const MAX_SMP_MERGE_ENTRY_BYTES = 32 * 1024 * 1024;
export const MAX_SMP_MERGE_UNCOMPRESSED_BYTES = 160 * 1024 * 1024;
export const MAX_SMP_MERGED_OUTPUT_BYTES = 256 * 1024 * 1024;
export const MAX_SMP_ZIP_NAME_BYTES = 1_024;
export const SMP_ZIP_STREAM_CLEANUP_TIMEOUT_MS = 5_000;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const CLASSIC_EOCD_BYTES = 22;
const MAX_ZIP_COMMENT_BYTES = 65_535;
const SUPPORTED_FLAGS = 0x0008 | 0x0800;
const DATA_DESCRIPTOR_FLAG = 0x0008;
const UTF8_FLAG = 0x0800;
const ZIP64_EXTRA_FIELD_ID = 0x0001;
const ZIP64_UINT16 = 0xffff;
const ZIP64_UINT32 = 0xffffffff;

export class SmpZipError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SmpZipError';
    this.code = code;
  }
}

export type SmpZipEntry = {
  name: string;
  rawNameBytes: Uint8Array;
  generalPurposeFlags: number;
  compressionMethod: 0 | 8;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  isDirectory: boolean;
};

export type SmpZipInspection = {
  blobSize: number;
  eocdOffset: number;
  centralDirectoryOffset: number;
  centralDirectorySize: number;
  entries: SmpZipEntry[];
  declaredUncompressedBytes: bigint;
};

export type SmpZipAggregateBudget = {
  emittedBytes: bigint;
};

type LocalEntryLayout = {
  dataStart: number;
  dataEnd: number;
  rangeStart: number;
  rangeEnd: number;
};

function zipError(code: string, message: string): SmpZipError {
  return new SmpZipError(code, message);
}

function normalizeFailure(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  return new Error('SMP ZIP operation failed', { cause: reason });
}

function abortFailure(signal: AbortSignal): Error {
  return normalizeFailure(
    signal.reason ?? new DOMException('Download cancelled', 'AbortError'),
  );
}

function byteArraysEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function containsZip64Extra(extra: Uint8Array): boolean {
  const view = new DataView(extra.buffer, extra.byteOffset, extra.byteLength);
  let offset = 0;
  while (offset < extra.byteLength) {
    if (offset + 4 > extra.byteLength) {
      throw zipError('SMP_ZIP_EXTRA_INVALID', 'Truncated ZIP extra field');
    }
    const fieldId = view.getUint16(offset, true);
    const fieldSize = view.getUint16(offset + 2, true);
    offset += 4;
    if (offset + fieldSize > extra.byteLength) {
      throw zipError(
        'SMP_ZIP_EXTRA_INVALID',
        'ZIP extra field exceeds its header range',
      );
    }
    if (fieldId === ZIP64_EXTRA_FIELD_ID) return true;
    offset += fieldSize;
  }
  return false;
}

function validateSupportedFlags(flags: number): void {
  if ((flags & ~SUPPORTED_FLAGS) !== 0) {
    throw zipError(
      'SMP_ZIP_FLAGS_UNSUPPORTED',
      `Unsupported ZIP general-purpose flags: 0x${flags.toString(16)}`,
    );
  }
}

/**
 * Decode one ZIP filename using the single canonical algorithm shared by the
 * central-directory and local-header boundaries.
 */
export function decodeCanonicalSmpZipName(
  rawBytes: Uint8Array,
  generalPurposeFlags: number,
): string {
  validateSupportedFlags(generalPurposeFlags);
  if (
    rawBytes.byteLength === 0 ||
    rawBytes.byteLength > MAX_SMP_ZIP_NAME_BYTES
  ) {
    throw zipError(
      'SMP_ZIP_NAME_INVALID',
      `ZIP entry names must contain 1..${MAX_SMP_ZIP_NAME_BYTES} bytes`,
    );
  }

  let name: string;
  if ((generalPurposeFlags & UTF8_FLAG) !== 0) {
    let decoder: TextDecoder;
    try {
      decoder = new TextDecoder('utf-8', { fatal: true });
      name = decoder.decode(rawBytes);
    } catch (cause) {
      throw new SmpZipError(
        'SMP_ZIP_NAME_UTF8_INVALID',
        'ZIP UTF-8 filename is not valid UTF-8',
        { cause },
      );
    }
    const roundTrip = new TextEncoder().encode(name);
    if (!byteArraysEqual(roundTrip, rawBytes)) {
      throw zipError(
        'SMP_ZIP_NAME_UTF8_NONCANONICAL',
        'ZIP UTF-8 filename does not round-trip to the original bytes',
      );
    }
  } else {
    for (const byte of rawBytes) {
      if (byte < 0x20 || byte > 0x7e) {
        throw zipError(
          'SMP_ZIP_NAME_ASCII_INVALID',
          'Non-UTF8 ZIP filenames must use printable ASCII only',
        );
      }
    }
    name = String.fromCharCode(...rawBytes);
  }

  if (name !== name.normalize('NFC')) {
    throw zipError(
      'SMP_ZIP_NAME_NFC_INVALID',
      'ZIP entry name must already be Unicode NFC',
    );
  }
  const hasControlCharacter = [...name].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f;
  });
  if (
    hasControlCharacter ||
    name.includes('\\') ||
    name.startsWith('/') ||
    /^[A-Za-z]:/.test(name) ||
    name.includes('//')
  ) {
    throw zipError(
      'SMP_ZIP_NAME_UNSAFE',
      `Unsafe ZIP entry name: ${JSON.stringify(name)}`,
    );
  }
  const isDirectory = name.endsWith('/');
  const pathForSegments = isDirectory ? name.slice(0, -1) : name;
  if (pathForSegments.length === 0) {
    throw zipError(
      'SMP_ZIP_NAME_UNSAFE',
      'Root directory entry is not permitted',
    );
  }
  const segments = pathForSegments.split('/');
  if (
    segments.some(
      (segment) => segment.length === 0 || segment === '.' || segment === '..',
    )
  ) {
    throw zipError(
      'SMP_ZIP_NAME_UNSAFE',
      `ZIP entry name contains a non-canonical path segment: ${name}`,
    );
  }
  return name;
}

function findEocd(
  tail: Uint8Array,
  tailStart: number,
  blobSize: number,
): {
  eocdOffset: number;
  totalEntries: number;
  centralDirectoryOffset: number;
  centralDirectorySize: number;
} {
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  const valid: Array<{
    eocdOffset: number;
    totalEntries: number;
    centralDirectoryOffset: number;
    centralDirectorySize: number;
  }> = [];
  let sawZip64AtEof = false;

  for (
    let offset = 0;
    offset <= tail.byteLength - CLASSIC_EOCD_BYTES;
    offset += 1
  ) {
    if (view.getUint32(offset, true) !== EOCD_SIGNATURE) continue;
    const diskNumber = view.getUint16(offset + 4, true);
    const centralStartDisk = view.getUint16(offset + 6, true);
    const entriesOnDisk = view.getUint16(offset + 8, true);
    const totalEntries = view.getUint16(offset + 10, true);
    const centralDirectorySize = view.getUint32(offset + 12, true);
    const centralDirectoryOffset = view.getUint32(offset + 16, true);
    const commentLength = view.getUint16(offset + 20, true);
    const absoluteOffset = tailStart + offset;
    const endsAtEof =
      absoluteOffset + CLASSIC_EOCD_BYTES + commentLength === blobSize;
    if (!endsAtEof) continue;

    if (
      entriesOnDisk === ZIP64_UINT16 ||
      totalEntries === ZIP64_UINT16 ||
      centralDirectorySize === ZIP64_UINT32 ||
      centralDirectoryOffset === ZIP64_UINT32
    ) {
      sawZip64AtEof = true;
      continue;
    }
    if (
      diskNumber !== 0 ||
      centralStartDisk !== 0 ||
      entriesOnDisk !== totalEntries
    ) {
      continue;
    }
    valid.push({
      eocdOffset: absoluteOffset,
      totalEntries,
      centralDirectoryOffset,
      centralDirectorySize,
    });
  }

  if (valid.length === 0 && sawZip64AtEof) {
    throw zipError(
      'SMP_ZIP_ZIP64_UNSUPPORTED',
      'ZIP64 archives are not supported',
    );
  }
  if (valid.length !== 1) {
    throw zipError(
      'SMP_ZIP_EOCD_INVALID',
      `Expected exactly one valid classic EOCD at EOF, found ${valid.length}`,
    );
  }
  return valid[0]!;
}

/** Inspect only ZIP metadata; no input entry is decompressed/materialized here. */
export async function inspectSmpZipCentralDirectory(
  blob: Blob,
): Promise<SmpZipInspection> {
  if (blob.size < CLASSIC_EOCD_BYTES) {
    throw zipError(
      'SMP_ZIP_TOO_SMALL',
      'SMP archive is too small to contain an EOCD',
    );
  }
  if (blob.size > MAX_SMP_MERGE_INPUT_BYTES) {
    throw zipError(
      'SMP_ZIP_INPUT_BYTES_EXCEEDED',
      `SMP input exceeds ${MAX_SMP_MERGE_INPUT_BYTES} bytes`,
    );
  }

  const tailLength = Math.min(
    blob.size,
    CLASSIC_EOCD_BYTES + MAX_ZIP_COMMENT_BYTES,
  );
  const tailStart = blob.size - tailLength;
  const tail = new Uint8Array(
    await blob.slice(tailStart, blob.size).arrayBuffer(),
  );
  const eocd = findEocd(tail, tailStart, blob.size);

  if (eocd.totalEntries > MAX_SMP_MERGE_ENTRIES) {
    throw zipError(
      'SMP_ZIP_ENTRY_COUNT_EXCEEDED',
      `SMP archive exceeds ${MAX_SMP_MERGE_ENTRIES} entries`,
    );
  }
  if (eocd.centralDirectorySize > MAX_SMP_CENTRAL_DIRECTORY_BYTES) {
    throw zipError(
      'SMP_ZIP_CENTRAL_DIRECTORY_BYTES_EXCEEDED',
      `SMP central directory exceeds ${MAX_SMP_CENTRAL_DIRECTORY_BYTES} bytes`,
    );
  }
  if (
    eocd.centralDirectoryOffset < 0 ||
    eocd.centralDirectorySize < 0 ||
    eocd.centralDirectoryOffset + eocd.centralDirectorySize !==
      eocd.eocdOffset ||
    eocd.centralDirectoryOffset + eocd.centralDirectorySize > blob.size
  ) {
    throw zipError(
      'SMP_ZIP_CENTRAL_DIRECTORY_RANGE_INVALID',
      'ZIP central directory must end exactly at the EOCD with no unexplained gap or trailing record',
    );
  }

  const centralBytes = new Uint8Array(
    await blob
      .slice(
        eocd.centralDirectoryOffset,
        eocd.centralDirectoryOffset + eocd.centralDirectorySize,
      )
      .arrayBuffer(),
  );
  const view = new DataView(
    centralBytes.buffer,
    centralBytes.byteOffset,
    centralBytes.byteLength,
  );
  const entries: SmpZipEntry[] = [];
  const names = new Set<string>();
  let declaredUncompressedBytes = 0n;
  let offset = 0;

  for (let index = 0; index < eocd.totalEntries; index += 1) {
    if (offset + 46 > centralBytes.byteLength) {
      throw zipError(
        'SMP_ZIP_CENTRAL_DIRECTORY_TRUNCATED',
        'Truncated ZIP central-directory record',
      );
    }
    if (view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw zipError(
        'SMP_ZIP_CENTRAL_DIRECTORY_INVALID',
        'Invalid ZIP central-directory signature',
      );
    }
    const flags = view.getUint16(offset + 8, true);
    const compressionMethod = view.getUint16(offset + 10, true);
    const crc32 = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const diskStart = view.getUint16(offset + 34, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);

    if (
      compressedSize === ZIP64_UINT32 ||
      uncompressedSize === ZIP64_UINT32 ||
      localHeaderOffset === ZIP64_UINT32 ||
      diskStart === ZIP64_UINT16
    ) {
      throw zipError(
        'SMP_ZIP_ZIP64_UNSUPPORTED',
        'ZIP64 entry fields are not supported',
      );
    }
    validateSupportedFlags(flags);
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      throw zipError(
        'SMP_ZIP_COMPRESSION_UNSUPPORTED',
        `Unsupported ZIP compression method ${compressionMethod}`,
      );
    }
    if (diskStart !== 0) {
      throw zipError(
        'SMP_ZIP_MULTIDISK_UNSUPPORTED',
        'Multi-disk ZIP archives are not supported',
      );
    }
    if (nameLength === 0 || nameLength > MAX_SMP_ZIP_NAME_BYTES) {
      throw zipError(
        'SMP_ZIP_NAME_INVALID',
        `ZIP entry name length must be 1..${MAX_SMP_ZIP_NAME_BYTES} bytes`,
      );
    }
    const recordEnd = offset + 46 + nameLength + extraLength + commentLength;
    if (recordEnd > centralBytes.byteLength) {
      throw zipError(
        'SMP_ZIP_CENTRAL_DIRECTORY_TRUNCATED',
        'ZIP central-directory record exceeds the declared range',
      );
    }
    const rawNameBytes = centralBytes.slice(
      offset + 46,
      offset + 46 + nameLength,
    );
    const extra = centralBytes.slice(
      offset + 46 + nameLength,
      offset + 46 + nameLength + extraLength,
    );
    if (containsZip64Extra(extra)) {
      throw zipError(
        'SMP_ZIP_ZIP64_UNSUPPORTED',
        'ZIP64 extra fields are not supported',
      );
    }
    const name = decodeCanonicalSmpZipName(rawNameBytes, flags);
    if (names.has(name)) {
      throw zipError(
        'SMP_ZIP_DUPLICATE_NAME',
        `Duplicate canonical ZIP entry name: ${name}`,
      );
    }
    names.add(name);
    if (uncompressedSize > MAX_SMP_MERGE_ENTRY_BYTES) {
      throw zipError(
        'SMP_ZIP_ENTRY_BYTES_EXCEEDED',
        `ZIP entry ${name} exceeds the 32 MiB uncompressed entry cap`,
      );
    }
    declaredUncompressedBytes += BigInt(uncompressedSize);
    if (declaredUncompressedBytes > BigInt(MAX_SMP_MERGE_UNCOMPRESSED_BYTES)) {
      throw zipError(
        'SMP_ZIP_UNCOMPRESSED_BYTES_EXCEEDED',
        'ZIP declared uncompressed bytes exceed the 160 MiB merge cap',
      );
    }
    if (localHeaderOffset >= eocd.centralDirectoryOffset) {
      throw zipError(
        'SMP_ZIP_LOCAL_OFFSET_INVALID',
        `ZIP entry ${name} points outside the local-entry region`,
      );
    }

    entries.push({
      name,
      rawNameBytes,
      generalPurposeFlags: flags,
      compressionMethod: compressionMethod as 0 | 8,
      crc32,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      isDirectory: name.endsWith('/'),
    });
    offset = recordEnd;
  }

  if (offset !== centralBytes.byteLength) {
    throw zipError(
      'SMP_ZIP_CENTRAL_DIRECTORY_LENGTH_INVALID',
      'ZIP central-directory parsing did not consume the exact declared range',
    );
  }

  return {
    blobSize: blob.size,
    eocdOffset: eocd.eocdOffset,
    centralDirectoryOffset: eocd.centralDirectoryOffset,
    centralDirectorySize: eocd.centralDirectorySize,
    entries,
    declaredUncompressedBytes,
  };
}

async function inspectLocalEntry(
  blob: Blob,
  entry: SmpZipEntry,
  inspection: SmpZipInspection,
): Promise<LocalEntryLayout> {
  const fixedHeaderBytes = new Uint8Array(
    await blob
      .slice(entry.localHeaderOffset, entry.localHeaderOffset + 30)
      .arrayBuffer(),
  );
  if (fixedHeaderBytes.byteLength !== 30) {
    throw zipError(
      'SMP_ZIP_LOCAL_HEADER_TRUNCATED',
      `Truncated local header for ${entry.name}`,
    );
  }
  const view = new DataView(
    fixedHeaderBytes.buffer,
    fixedHeaderBytes.byteOffset,
    fixedHeaderBytes.byteLength,
  );
  if (view.getUint32(0, true) !== LOCAL_SIGNATURE) {
    throw zipError(
      'SMP_ZIP_LOCAL_HEADER_INVALID',
      `Invalid local-header signature for ${entry.name}`,
    );
  }
  const flags = view.getUint16(6, true);
  const compressionMethod = view.getUint16(8, true);
  const localCrc32 = view.getUint32(14, true);
  const localCompressedSize = view.getUint32(18, true);
  const localUncompressedSize = view.getUint32(22, true);
  const nameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);
  validateSupportedFlags(flags);
  if (
    localCompressedSize === ZIP64_UINT32 ||
    localUncompressedSize === ZIP64_UINT32
  ) {
    throw zipError(
      'SMP_ZIP_ZIP64_UNSUPPORTED',
      'ZIP64 local fields are not supported',
    );
  }
  if (
    flags !== entry.generalPurposeFlags ||
    compressionMethod !== entry.compressionMethod
  ) {
    throw zipError(
      'SMP_ZIP_LOCAL_CENTRAL_MISMATCH',
      `Local flags/compression do not match central directory for ${entry.name}`,
    );
  }
  if (nameLength !== entry.rawNameBytes.byteLength) {
    throw zipError(
      'SMP_ZIP_LOCAL_NAME_MISMATCH',
      `Local filename length does not match central directory for ${entry.name}`,
    );
  }
  const variableBytes = new Uint8Array(
    await blob
      .slice(
        entry.localHeaderOffset + 30,
        entry.localHeaderOffset + 30 + nameLength + extraLength,
      )
      .arrayBuffer(),
  );
  if (variableBytes.byteLength !== nameLength + extraLength) {
    throw zipError(
      'SMP_ZIP_LOCAL_HEADER_TRUNCATED',
      `Truncated local name/extra fields for ${entry.name}`,
    );
  }
  const rawNameBytes = variableBytes.slice(0, nameLength);
  if (!byteArraysEqual(rawNameBytes, entry.rawNameBytes)) {
    throw zipError(
      'SMP_ZIP_LOCAL_NAME_MISMATCH',
      `Local filename bytes do not match central directory for ${entry.name}`,
    );
  }
  const decoded = decodeCanonicalSmpZipName(rawNameBytes, flags);
  if (decoded !== entry.name) {
    throw zipError(
      'SMP_ZIP_LOCAL_NAME_MISMATCH',
      `Local filename does not decode to central canonical name for ${entry.name}`,
    );
  }
  const extra = variableBytes.slice(nameLength);
  if (containsZip64Extra(extra)) {
    throw zipError(
      'SMP_ZIP_ZIP64_UNSUPPORTED',
      `ZIP64 local extra field is not supported for ${entry.name}`,
    );
  }

  if ((flags & DATA_DESCRIPTOR_FLAG) === 0) {
    const fields: Array<[number, number, string]> = [
      [localCrc32, entry.crc32, 'CRC32'],
      [localCompressedSize, entry.compressedSize, 'compressed size'],
      [localUncompressedSize, entry.uncompressedSize, 'uncompressed size'],
    ];
    for (const [localValue, centralValue, label] of fields) {
      if (localValue !== 0 && localValue !== centralValue) {
        throw zipError(
          'SMP_ZIP_LOCAL_CENTRAL_MISMATCH',
          `Local ${label} does not match central directory for ${entry.name}`,
        );
      }
    }
  }

  const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (
    dataStart < entry.localHeaderOffset ||
    dataEnd < dataStart ||
    dataEnd > inspection.centralDirectoryOffset ||
    dataEnd > blob.size
  ) {
    throw zipError(
      'SMP_ZIP_LOCAL_DATA_RANGE_INVALID',
      `Compressed data range is invalid for ${entry.name}`,
    );
  }
  return {
    dataStart,
    dataEnd,
    rangeStart: entry.localHeaderOffset,
    rangeEnd: dataEnd,
  };
}

/** Validate every local header/data range and prove those ranges do not overlap. */
export async function validateSmpZipLocalEntryLayout(
  blob: Blob,
  inspection: SmpZipInspection,
): Promise<void> {
  const ranges: Array<LocalEntryLayout & { name: string }> = [];
  for (const entry of inspection.entries) {
    const layout = await inspectLocalEntry(blob, entry, inspection);
    ranges.push({ ...layout, name: entry.name });
  }
  ranges.sort((left, right) => left.rangeStart - right.rangeStart);
  for (let index = 1; index < ranges.length; index += 1) {
    const previous = ranges[index - 1]!;
    const current = ranges[index]!;
    if (current.rangeStart < previous.rangeEnd) {
      throw zipError(
        'SMP_ZIP_LOCAL_RANGE_OVERLAP',
        `ZIP local/data ranges overlap: ${previous.name} and ${current.name}`,
      );
    }
  }
}

export function createSmpZipAggregateBudget(): SmpZipAggregateBudget {
  return { emittedBytes: 0n };
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function updateCrc32(crc: number, bytes: Uint8Array): number {
  let value = crc;
  for (const byte of bytes) {
    value = CRC32_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8);
  }
  return value >>> 0;
}

function createStreamCancelOnce(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): (reason: unknown) => Promise<void> {
  let observed: Promise<void> | undefined;
  return (reason: unknown) => {
    if (observed) return observed;
    let raw: Promise<void>;
    try {
      raw = reader.cancel(normalizeFailure(reason));
    } catch (error) {
      raw = Promise.reject(error);
    }
    observed = raw.then(
      () => undefined,
      () => undefined,
    );
    return observed;
  };
}

async function awaitStreamCleanupBounded(
  cancelPromise: Promise<void>,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), SMP_ZIP_STREAM_CLEANUP_TIMEOUT_MS);
  });
  try {
    return await Promise.race([cancelPromise.then(() => true), timeout]);
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
  if (signal.aborted) throw abortFailure(signal);
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(abortFailure(signal));
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([readPromise, aborted]);
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}

async function compressedBlobStream(
  compressed: Blob,
): Promise<ReadableStream<Uint8Array>> {
  if (typeof compressed.stream === 'function') {
    return compressed.stream() as ReadableStream<Uint8Array>;
  }
  // Some unit-test DOM Blob polyfills omit Blob.stream(). Browser packaging
  // never takes this branch. The fallback materializes only the already-bounded
  // compressed slice, never an inflated input entry.
  const bytes = new Uint8Array(await compressed.arrayBuffer());
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function decompressedEntryStream(
  compressed: Blob,
  method: 0 | 8,
): Promise<ReadableStream<Uint8Array>> {
  if (method === 0) return compressedBlobStream(compressed);
  const DecompressionStreamCtor = globalThis.DecompressionStream;
  if (typeof DecompressionStreamCtor !== 'function') {
    throw zipError(
      'SMP_ZIP_DEFLATE_RAW_UNSUPPORTED',
      'This browser does not support DecompressionStream(deflate-raw)',
    );
  }
  let decompressor: DecompressionStream;
  try {
    // TS's CompressionFormat union can lag browser support; #279 deliberately
    // feature-detects the exact runtime format required by the supported matrix.
    decompressor = new DecompressionStreamCtor(
      'deflate-raw' as CompressionFormat,
    );
  } catch (cause) {
    throw new SmpZipError(
      'SMP_ZIP_DEFLATE_RAW_UNSUPPORTED',
      'This browser does not support DecompressionStream(deflate-raw)',
      { cause },
    );
  }
  const stream = await compressedBlobStream(compressed);
  return stream.pipeThrough(
    decompressor as unknown as ReadableWritablePair<Uint8Array, Uint8Array>,
  ) as ReadableStream<Uint8Array>;
}

/**
 * Read one validated input entry with streaming inflation, CRC32 and hard
 * per-entry/aggregate emitted-byte bounds. Input ZipObject.async() is never used.
 */
export async function readBoundedSmpZipEntry(
  blob: Blob,
  entry: SmpZipEntry,
  aggregateBudget: SmpZipAggregateBudget,
  signal: AbortSignal,
  inspection: SmpZipInspection,
): Promise<Uint8Array> {
  if (signal.aborted) throw abortFailure(signal);
  if (entry.isDirectory) return new Uint8Array();
  const layout = await inspectLocalEntry(blob, entry, inspection);
  if (signal.aborted) throw abortFailure(signal);
  const stream = await decompressedEntryStream(
    blob.slice(layout.dataStart, layout.dataEnd),
    entry.compressionMethod,
  );
  const reader = stream.getReader();
  const cancelOnce = createStreamCancelOnce(reader);
  const chunks: Uint8Array[] = [];
  let emitted = 0n;
  let crc = 0xffffffff;
  let reachedEof = false;
  let localError: Error | undefined;

  try {
    while (true) {
      const { done, value } = await readWithAbort(reader, signal);
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
        throw zipError(
          'SMP_ZIP_STREAM_CHUNK_INVALID',
          `ZIP stream yielded a non-byte chunk for ${entry.name}`,
        );
      }
      const chunkBytes = BigInt(chunk.byteLength);
      emitted += chunkBytes;
      aggregateBudget.emittedBytes += chunkBytes;
      crc = updateCrc32(crc, chunk);
      if (emitted > BigInt(MAX_SMP_MERGE_ENTRY_BYTES)) {
        throw zipError(
          'SMP_ZIP_ENTRY_BYTES_EXCEEDED',
          `Inflated entry ${entry.name} exceeds the 32 MiB cap`,
        );
      }
      if (
        aggregateBudget.emittedBytes > BigInt(MAX_SMP_MERGE_UNCOMPRESSED_BYTES)
      ) {
        throw zipError(
          'SMP_ZIP_UNCOMPRESSED_BYTES_EXCEEDED',
          'Inflated SMP entries exceed the 160 MiB aggregate cap',
        );
      }
      chunks.push(chunk);
    }
    if (emitted !== BigInt(entry.uncompressedSize)) {
      throw zipError(
        'SMP_ZIP_UNCOMPRESSED_SIZE_MISMATCH',
        `Inflated byte count does not match central directory for ${entry.name}`,
      );
    }
    const actualCrc = (crc ^ 0xffffffff) >>> 0;
    if (actualCrc !== entry.crc32) {
      throw zipError('SMP_ZIP_CRC_MISMATCH', `CRC mismatch for ${entry.name}`);
    }
    const output = new Uint8Array(Number(emitted));
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return output;
  } catch (error) {
    localError = signal.aborted
      ? abortFailure(signal)
      : normalizeFailure(error);
    throw localError;
  } finally {
    if (reachedEof) {
      try {
        reader.releaseLock();
      } catch {
        // Cleanup diagnostics do not replace the operation result.
      }
    } else {
      const settled = await awaitStreamCleanupBounded(
        cancelOnce(
          signal.reason ??
            localError ??
            new DOMException('SMP entry stream cancelled', 'AbortError'),
        ),
      );
      if (settled) {
        try {
          reader.releaseLock();
        } catch {
          // Cleanup diagnostics do not replace the operation result.
        }
      }
    }
  }
}
