export interface DisclosureSafeDerivativeManifest {
  contentType: string;
  sourceOriginalHash?: string;
  originalSha256: string;
  derivativeSha256: string;
  originalByteLength: number;
  derivativeByteLength: number;
}

export type DisclosureSafeDerivativeResult =
  | {
      ok: true;
      contentType: string;
      bytes: Uint8Array;
      manifest: DisclosureSafeDerivativeManifest;
    }
  | {
      ok: false;
      contentType: string;
      reason: 'unsupported-format' | 'invalid-format';
    };

export interface CreateDisclosureSafeMediaDerivativeInput {
  bytes: Uint8Array;
  contentType: string;
  /** Optional source-provided hash retained only as provenance alongside SHA-256. */
  sourceOriginalHash?: string;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function uint32Be(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! * 0x1000000 +
    bytes[offset + 1]! * 0x10000 +
    bytes[offset + 2]! * 0x100 +
    bytes[offset + 3]!
  );
}

function uint32Le(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! +
    bytes[offset + 1]! * 0x100 +
    bytes[offset + 2]! * 0x10000 +
    bytes[offset + 3]! * 0x1000000
  );
}

function writeUint32Le(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

/**
 * Strip JPEG metadata-bearing segments without decoding pixels. APP1 carries
 * EXIF/XMP (including GPS/device data), APP13 carries IPTC, and COM is free-form
 * metadata. Structural/color segments such as JFIF, ICC and Adobe APP14 remain
 * untouched so the encoded image remains display-compatible.
 */
function scrubJpeg(bytes: Uint8Array): Uint8Array | null {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }
  const parts: Uint8Array[] = [bytes.slice(0, 2)];
  let offset = 2;

  while (offset < bytes.byteLength) {
    const markerStart = offset;
    if (bytes[offset] !== 0xff) return null;
    while (offset < bytes.byteLength && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.byteLength) return null;
    const marker = bytes[offset]!;
    offset += 1;

    // Start of scan: keep encoded image bytes only through the first real EOI
    // marker. Bytes after EOI are not part of the JPEG and may contain a second
    // image or arbitrary metadata. Ignore byte-stuffed FF 00 pairs while
    // searching the entropy-coded stream.
    if (marker === 0xda) {
      if (offset + 2 > bytes.byteLength) return null;
      const length = (bytes[offset]! << 8) | bytes[offset + 1]!;
      if (length < 2 || offset + length > bytes.byteLength) return null;
      let scanOffset = offset + length;
      while (scanOffset + 1 < bytes.byteLength) {
        if (bytes[scanOffset] !== 0xff) {
          scanOffset += 1;
          continue;
        }
        let markerOffset = scanOffset + 1;
        while (
          markerOffset < bytes.byteLength &&
          bytes[markerOffset] === 0xff
        ) {
          markerOffset += 1;
        }
        if (markerOffset >= bytes.byteLength) return null;
        const scanMarker = bytes[markerOffset]!;
        if (scanMarker === 0x00) {
          scanOffset = markerOffset + 1;
          continue;
        }
        if (scanMarker === 0xd9) {
          parts.push(bytes.slice(markerStart, markerOffset + 1));
          return concatBytes(parts);
        }
        scanOffset = markerOffset + 1;
      }
      return null;
    }

    // Stand-alone markers carry no length field.
    if (
      marker === 0xd9 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      parts.push(bytes.slice(markerStart, offset));
      if (marker === 0xd9) return concatBytes(parts);
      continue;
    }

    if (offset + 2 > bytes.byteLength) return null;
    const length = (bytes[offset]! << 8) | bytes[offset + 1]!;
    if (length < 2 || offset + length > bytes.byteLength) return null;
    const segmentEnd = offset + length;
    const isSensitiveMetadata =
      marker === 0xe1 || marker === 0xed || marker === 0xfe;
    if (!isSensitiveMetadata) {
      parts.push(bytes.slice(markerStart, segmentEnd));
    }
    offset = segmentEnd;
  }

  return concatBytes(parts);
}

const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const PNG_METADATA_CHUNKS = new Set([
  'tEXt',
  'zTXt',
  'iTXt',
  'eXIf',
  'tIME',
  'iCCP',
]);

function scrubPng(bytes: Uint8Array): Uint8Array | null {
  if (bytes.byteLength < PNG_SIGNATURE.byteLength) return null;
  for (let index = 0; index < PNG_SIGNATURE.byteLength; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) return null;
  }

  const parts: Uint8Array[] = [bytes.slice(0, PNG_SIGNATURE.byteLength)];
  let offset = PNG_SIGNATURE.byteLength;
  let sawIend = false;
  while (offset < bytes.byteLength) {
    if (offset + 12 > bytes.byteLength) return null;
    const length = uint32Be(bytes, offset);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > bytes.byteLength) return null;
    const type = ascii(bytes, offset + 4, 4);
    if (!PNG_METADATA_CHUNKS.has(type)) {
      parts.push(bytes.slice(offset, chunkEnd));
    }
    offset = chunkEnd;
    if (type === 'IEND') {
      sawIend = true;
      break;
    }
  }
  if (!sawIend) return null;
  return concatBytes(parts);
}

const WEBP_METADATA_CHUNKS = new Set(['EXIF', 'XMP ', 'ICCP']);

function scrubWebp(bytes: Uint8Array): Uint8Array | null {
  if (
    bytes.byteLength < 12 ||
    ascii(bytes, 0, 4) !== 'RIFF' ||
    ascii(bytes, 8, 4) !== 'WEBP'
  ) {
    return null;
  }
  const declaredSize = uint32Le(bytes, 4) + 8;
  if (declaredSize > bytes.byteLength) return null;

  const parts: Uint8Array[] = [bytes.slice(0, 12)];
  let offset = 12;
  while (offset + 8 <= declaredSize) {
    const type = ascii(bytes, offset, 4);
    const length = uint32Le(bytes, offset + 4);
    const paddedLength = length + (length % 2);
    const chunkEnd = offset + 8 + paddedLength;
    if (chunkEnd > declaredSize) return null;

    if (!WEBP_METADATA_CHUNKS.has(type)) {
      const chunk = bytes.slice(offset, chunkEnd);
      if (type === 'VP8X' && length >= 1) {
        // Clear ICCP, EXIF and XMP feature flags after removing their chunks.
        chunk[8] = chunk[8]! & ~0x2c;
      }
      parts.push(chunk);
    }
    offset = chunkEnd;
  }

  const output = concatBytes(parts);
  writeUint32Le(output, 4, output.byteLength - 8);
  return output;
}

function synchsafeInt(bytes: Uint8Array, offset: number): number | null {
  if (offset + 4 > bytes.byteLength) return null;
  const values = [
    bytes[offset]!,
    bytes[offset + 1]!,
    bytes[offset + 2]!,
    bytes[offset + 3]!,
  ];
  if (values.some((value) => (value & 0x80) !== 0)) return null;
  return (
    (values[0]! << 21) | (values[1]! << 14) | (values[2]! << 7) | values[3]!
  );
}

function scrubMp3(bytes: Uint8Array): Uint8Array | null {
  let start = 0;
  if (bytes.byteLength >= 10 && ascii(bytes, 0, 3) === 'ID3') {
    const size = synchsafeInt(bytes, 6);
    if (size === null) return null;
    const hasFooter = (bytes[5]! & 0x10) !== 0;
    start = 10 + size + (hasFooter ? 10 : 0);
    if (start > bytes.byteLength) return null;
  }

  let end = bytes.byteLength;
  if (end - start >= 128 && ascii(bytes, end - 128, 3) === 'TAG') {
    end -= 128;
  }
  if (end <= start) return null;
  return bytes.slice(start, end);
}

const WAV_METADATA_CHUNKS = new Set([
  'LIST',
  'ID3 ',
  'id3 ',
  'bext',
  'iXML',
  'axml',
  'cart',
  'DISP',
  'cue ',
]);

function scrubWav(bytes: Uint8Array): Uint8Array | null {
  if (
    bytes.byteLength < 12 ||
    ascii(bytes, 0, 4) !== 'RIFF' ||
    ascii(bytes, 8, 4) !== 'WAVE'
  ) {
    return null;
  }
  const declaredSize = uint32Le(bytes, 4) + 8;
  if (declaredSize > bytes.byteLength) return null;

  const parts: Uint8Array[] = [bytes.slice(0, 12)];
  let offset = 12;
  let hasAudioData = false;
  while (offset + 8 <= declaredSize) {
    const type = ascii(bytes, offset, 4);
    const length = uint32Le(bytes, offset + 4);
    const paddedLength = length + (length % 2);
    const chunkEnd = offset + 8 + paddedLength;
    if (chunkEnd > declaredSize) return null;
    if (type === 'data') hasAudioData = true;
    if (!WAV_METADATA_CHUNKS.has(type)) {
      parts.push(bytes.slice(offset, chunkEnd));
    }
    offset = chunkEnd;
  }
  if (!hasAudioData) return null;
  const output = concatBytes(parts);
  writeUint32Le(output, 4, output.byteLength - 8);
  return output;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Make an owned ArrayBuffer so this is accepted consistently by browser and
  // Node WebCrypto even when the input view was backed by a shared buffer.
  const owned = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest('SHA-256', owned);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

/**
 * Build a disclosure-safe media derivative without uploading or persisting the
 * raw original. Supported formats are rewritten/stripped deterministically;
 * unsupported or malformed formats fail closed and return no byte payload.
 */
export async function createDisclosureSafeMediaDerivative(
  input: CreateDisclosureSafeMediaDerivativeInput,
): Promise<DisclosureSafeDerivativeResult> {
  const contentType =
    input.contentType.trim().toLowerCase().split(';', 1)[0] ?? '';
  let derivative: Uint8Array | null;

  switch (contentType) {
    case 'image/jpeg':
    case 'image/jpg':
      derivative = scrubJpeg(input.bytes);
      break;
    case 'image/png':
      derivative = scrubPng(input.bytes);
      break;
    case 'image/webp':
      derivative = scrubWebp(input.bytes);
      break;
    case 'audio/mpeg':
    case 'audio/mp3':
      derivative = scrubMp3(input.bytes);
      break;
    case 'audio/wav':
    case 'audio/x-wav':
      derivative = scrubWav(input.bytes);
      break;
    default:
      return { ok: false, contentType, reason: 'unsupported-format' };
  }

  if (!derivative) {
    return { ok: false, contentType, reason: 'invalid-format' };
  }

  const [originalSha256, derivativeSha256] = await Promise.all([
    sha256Hex(input.bytes),
    sha256Hex(derivative),
  ]);
  return {
    ok: true,
    contentType,
    bytes: derivative,
    manifest: {
      contentType,
      sourceOriginalHash: input.sourceOriginalHash,
      originalSha256,
      derivativeSha256,
      originalByteLength: input.bytes.byteLength,
      derivativeByteLength: derivative.byteLength,
    },
  };
}
