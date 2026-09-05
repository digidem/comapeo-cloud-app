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

describe('createDisclosureSafeMediaDerivative', () => {
  it('strips JPEG EXIF/GPS/device metadata and binds original to derivative hashes', async () => {
    const sentinel =
      'GPSLatitude=-3.123;GPSLongitude=-60.456;Device=SECRET_PHONE';
    const exif = concat(encoder.encode('Exif\0\0'), encoder.encode(sentinel));
    const jpeg = concat(
      Uint8Array.of(0xff, 0xd8),
      jpegSegment(0xe1, exif),
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
    expect(result.manifest.sourceOriginalHash).toBe('upstream-hash');
    expect(result.manifest.originalSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.manifest.derivativeSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.manifest.derivativeSha256).not.toBe(
      result.manifest.originalSha256,
    );
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
    expect(text).toContain('IHDR');
    expect(text).toContain('IDAT');
    expect(text).toContain('IEND');
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
    const audioFrames = Uint8Array.of(0xff, 0xfb, 0x90, 0x64, 1, 2, 3, 4);
    const id3v1 = new Uint8Array(128);
    id3v1.set(encoder.encode('TAGGPS=-3.123,-60.456;RECORDER_SECRET'));
    const mp3 = concat(id3v2, audioFrames, id3v1);

    const result = await createDisclosureSafeMediaDerivative({
      bytes: mp3,
      contentType: 'audio/mpeg',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const text = decoder.decode(result.bytes);
    expect(text).not.toContain('GPS=-3.123,-60.456');
    expect(text).not.toContain('RECORDER_SECRET');
    expect(result.bytes).toEqual(audioFrames);
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
