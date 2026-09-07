import { describe, expect, it } from 'vitest';

import { createDisclosureSafeMediaDerivative } from '@/lib/case-evidence-derivative';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function concat(...parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function jpegSegment(marker: number, payload: Uint8Array): Uint8Array {
  const length = payload.length + 2;
  return concat(
    Uint8Array.of(0xff, marker, (length >> 8) & 0xff, length & 0xff),
    payload,
  );
}

function pngChunk(type: string, payload: Uint8Array): Uint8Array {
  const typeBytes = encoder.encode(type);
  const length = payload.length;
  // CRC is deliberately fixture-only; the scrubber preserves critical chunks and
  // drops metadata chunks without needing to interpret image pixels.
  return concat(
    Uint8Array.of(
      (length >>> 24) & 0xff,
      (length >>> 16) & 0xff,
      (length >>> 8) & 0xff,
      length & 0xff,
    ),
    typeBytes,
    payload,
    Uint8Array.of(0, 0, 0, 0),
  );
}

function synchsafeSize(size: number): Uint8Array {
  return Uint8Array.of(
    (size >> 21) & 0x7f,
    (size >> 14) & 0x7f,
    (size >> 7) & 0x7f,
    size & 0x7f,
  );
}

function uint32Le(value: number): Uint8Array {
  return Uint8Array.of(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

function riffChunk(type: string, payload: Uint8Array): Uint8Array {
  const padding =
    payload.length % 2 === 0 ? new Uint8Array() : Uint8Array.of(0);
  return concat(
    encoder.encode(type),
    uint32Le(payload.length),
    payload,
    padding,
  );
}

function riff(type: string, ...chunks: Uint8Array[]): Uint8Array {
  const body = concat(encoder.encode(type), ...chunks);
  return concat(encoder.encode('RIFF'), uint32Le(body.length), body);
}

function mpeg1Layer3Frame(): Uint8Array {
  // MPEG-1 Layer III, 128 kbps, 44.1 kHz, no padding => 417-byte frame.
  const frame = new Uint8Array(417);
  frame.set(Uint8Array.of(0xff, 0xfb, 0x90, 0x64));
  for (let index = 4; index < frame.length; index += 1) {
    frame[index] = index & 0x7f;
  }
  return frame;
}

describe('createDisclosureSafeMediaDerivative', () => {
  it('strips JPEG EXIF/GPS/device metadata and binds original to derivative hashes', async () => {
    const sentinel =
      'GPSLatitude=-3.123;GPSLongitude=-60.456;Device=SECRET_PHONE';
    const exif = concat(encoder.encode('Exif\0\0'), encoder.encode(sentinel));
    const privateAppMetadata = 'APP2_PRIVATE_GPS=-3.2,-60.4';
    const jpeg = concat(
      Uint8Array.of(0xff, 0xd8),
      jpegSegment(0xe1, exif),
      jpegSegment(0xe2, encoder.encode(privateAppMetadata)),
      jpegSegment(0xe0, encoder.encode('JFIF\0SAFE')),
      Uint8Array.of(0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0x33, 0xff, 0xd9),
    );

    const result = await createDisclosureSafeMediaDerivative({
      bytes: jpeg,
      contentType: 'image/jpeg',
      sourceOriginalHash: 'upstream-hash',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(decoder.decode(result.bytes)).not.toContain(sentinel);
    expect(decoder.decode(result.bytes)).not.toContain('Exif');
    expect(decoder.decode(result.bytes)).not.toContain(privateAppMetadata);
    expect(result.manifest.sourceOriginalHash).toBe('upstream-hash');
    expect(result.manifest.originalSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.manifest.derivativeSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.manifest.derivativeSha256).not.toBe(
      result.manifest.originalSha256,
    );
  });

  it('drops bytes appended after the JPEG end marker so hidden trailer metadata cannot survive', async () => {
    const trailerSentinel = 'Exif GPSLatitude=-3.2 Device=TRAILER_SECRET';
    const jpeg = concat(
      Uint8Array.of(0xff, 0xd8),
      jpegSegment(0xe0, encoder.encode('JFIF\0SAFE')),
      Uint8Array.of(0xff, 0xda, 0x00, 0x02, 0x11, 0xff, 0x00, 0x22, 0xff, 0xd9),
      encoder.encode(trailerSentinel),
    );

    const result = await createDisclosureSafeMediaDerivative({
      bytes: jpeg,
      contentType: 'image/jpeg',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(decoder.decode(result.bytes)).not.toContain(trailerSentinel);
    expect(Array.from(result.bytes.slice(-2))).toEqual([0xff, 0xd9]);
  });

  it('removes PNG textual/EXIF metadata while preserving critical image chunks', async () => {
    const png = concat(
      Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
      pngChunk('IHDR', new Uint8Array(13)),
      pngChunk(
        'tEXt',
        encoder.encode('GPS=-3.123,-60.456;Device=SECRET_PHONE'),
      ),
      pngChunk('eXIf', encoder.encode('SECRET_EXIF')),
      pngChunk('vpAg', encoder.encode('PRIVATE_PNG_GPS=-3.1,-60.4')),
      pngChunk('IDAT', Uint8Array.of(1, 2, 3, 4)),
      pngChunk('IEND', new Uint8Array()),
    );

    const result = await createDisclosureSafeMediaDerivative({
      bytes: png,
      contentType: 'image/png',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const text = decoder.decode(result.bytes);
    expect(text).not.toContain('SECRET_PHONE');
    expect(text).not.toContain('SECRET_EXIF');
    expect(text).not.toContain('PRIVATE_PNG_GPS');
    expect(text).toContain('IHDR');
    expect(text).toContain('IDAT');
    expect(text).toContain('IEND');
  });

  it('drops unknown WebP chunks so vendor-private metadata cannot survive', async () => {
    const webp = riff(
      'WEBP',
      riffChunk('VP8X', Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 0, 0, 0)),
      riffChunk('PRIV', encoder.encode('WEBP_PRIVATE_GPS=-3.5,-60.5')),
      riffChunk('VP8 ', Uint8Array.of(1, 2, 3, 4)),
    );

    const result = await createDisclosureSafeMediaDerivative({
      bytes: webp,
      contentType: 'image/webp',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const text = decoder.decode(result.bytes);
    expect(text).not.toContain('WEBP_PRIVATE_GPS');
    expect(text).toContain('VP8 ');
  });

  it('strips MP3 ID3v2 and ID3v1 metadata including hidden location text', async () => {
    const id3v2Payload = encoder.encode(
      'TXXX\0GPS=-3.123,-60.456;Device=RECORDER',
    );
    const id3v2 = concat(
      encoder.encode('ID3'),
      Uint8Array.of(4, 0, 0),
      synchsafeSize(id3v2Payload.length),
      id3v2Payload,
    );
    const audioFrames = mpeg1Layer3Frame();
    const trailingMetadata = encoder.encode(
      'APETAGEX GPS=-3.999,-60.999;VENDOR_PRIVATE=SECRET',
    );
    const id3v1 = new Uint8Array(128);
    id3v1.set(encoder.encode('TAGGPS=-3.123,-60.456;RECORDER_SECRET'));
    const mp3 = concat(id3v2, audioFrames, trailingMetadata, id3v1);

    const result = await createDisclosureSafeMediaDerivative({
      bytes: mp3,
      contentType: 'audio/mpeg',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const text = decoder.decode(result.bytes);
    expect(text).not.toContain('GPS=-3.123,-60.456');
    expect(text).not.toContain('RECORDER_SECRET');
    expect(text).not.toContain('VENDOR_PRIVATE=SECRET');
    expect(result.bytes).toEqual(audioFrames);
  });

  it('keeps only WAV audio structure/data and drops arbitrary metadata chunks', async () => {
    const fmt = new Uint8Array(16);
    const audio = Uint8Array.of(1, 2, 3, 4, 5, 6);
    const privateMetadata = encoder.encode(
      'GPS=-3.777,-60.888;DEVICE=FIELD_RECORDER_SECRET',
    );
    const wav = riff(
      'WAVE',
      riffChunk('fmt ', fmt),
      riffChunk('JUNK', privateMetadata),
      riffChunk('data', audio),
    );

    const result = await createDisclosureSafeMediaDerivative({
      bytes: wav,
      contentType: 'audio/wav',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const text = decoder.decode(result.bytes);
    expect(text).not.toContain('FIELD_RECORDER_SECRET');
    expect(text).toContain('fmt ');
    expect(text).toContain('data');
  });

  it('fails closed for an unsupported media format and never returns original bytes', async () => {
    const result = await createDisclosureSafeMediaDerivative({
      bytes: encoder.encode('raw-original-secret-metadata'),
      contentType: 'audio/mp4',
    });

    expect(result).toEqual({
      ok: false,
      contentType: 'audio/mp4',
      reason: 'unsupported-format',
    });
    expect('bytes' in result).toBe(false);
  });
});
