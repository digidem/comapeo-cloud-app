import * as v from 'valibot';

import { encryptedPayloadSchema } from '@/lib/schemas/invite';

export type EncryptedInvitePayload = {
  url: string;
  token: string;
  exp: number;
};

export type DecryptResult =
  | { ok: true; value: EncryptedInvitePayload }
  | {
      ok: false;
      code:
        | 'INVITE_BAD_FORMAT'
        | 'INVITE_BAD_VERSION'
        | 'INVITE_DECRYPT_FAILED'
        | 'INVITE_EXPIRED';
      message: string;
    };

const VERSION_PREFIX = 'v1.';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

function assertKeyLength(rawKey: Uint8Array): void {
  if (rawKey.byteLength !== KEY_LENGTH) {
    throw new Error(
      `invite-crypto: rawKey must be exactly ${KEY_LENGTH} bytes (received ${rawKey.byteLength})`,
    );
  }
}

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('invite-crypto: Web Crypto SubtleCrypto is not available');
  }
  return subtle;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(input)) {
    throw new Error('invalid base64url');
  }
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLength);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toCryptoBufferSource(bytes: Uint8Array): BufferSource {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes);
  }
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

async function importAesKey(rawKey: Uint8Array): Promise<CryptoKey> {
  const subtle = getSubtle();
  return subtle.importKey(
    'raw',
    toCryptoBufferSource(rawKey),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptInvite(
  payload: EncryptedInvitePayload,
  rawKey: Uint8Array,
): Promise<string> {
  assertKeyLength(rawKey);
  const subtle = getSubtle();
  const key = await importAesKey(rawKey);
  const iv = new Uint8Array(IV_LENGTH);
  globalThis.crypto.getRandomValues(iv);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const cipherBuffer = await subtle.encrypt(
    { name: 'AES-GCM', iv: toCryptoBufferSource(iv) },
    key,
    toCryptoBufferSource(plaintext),
  );
  const cipherBytes = new Uint8Array(cipherBuffer);
  const combined = new Uint8Array(iv.byteLength + cipherBytes.byteLength);
  combined.set(iv, 0);
  combined.set(cipherBytes, iv.byteLength);
  return `${VERSION_PREFIX}${toBase64Url(combined)}`;
}

export async function decryptInvite(
  code: string,
  rawKey: Uint8Array,
  now?: number,
): Promise<DecryptResult> {
  assertKeyLength(rawKey);

  if (!code.startsWith(VERSION_PREFIX)) {
    return {
      ok: false,
      code: 'INVITE_BAD_VERSION',
      message: 'Unsupported invite version',
    };
  }

  const encoded = code.slice(VERSION_PREFIX.length);
  if (encoded.length === 0) {
    return {
      ok: false,
      code: 'INVITE_BAD_FORMAT',
      message: 'Invite payload is empty',
    };
  }

  let combined: Uint8Array;
  try {
    combined = fromBase64Url(encoded);
  } catch {
    return {
      ok: false,
      code: 'INVITE_BAD_FORMAT',
      message: 'Invite payload is not valid base64url',
    };
  }

  if (combined.byteLength <= IV_LENGTH) {
    return {
      ok: false,
      code: 'INVITE_BAD_FORMAT',
      message: 'Invite payload is too short',
    };
  }

  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  let plaintextBuffer: ArrayBuffer;
  try {
    const subtle = getSubtle();
    const key = await importAesKey(rawKey);
    plaintextBuffer = await subtle.decrypt(
      { name: 'AES-GCM', iv: toCryptoBufferSource(iv) },
      key,
      toCryptoBufferSource(ciphertext),
    );
  } catch {
    return {
      ok: false,
      code: 'INVITE_DECRYPT_FAILED',
      message: 'Invite could not be decrypted',
    };
  }

  let parsed: unknown;
  try {
    const json = new TextDecoder().decode(plaintextBuffer);
    parsed = JSON.parse(json);
  } catch {
    return {
      ok: false,
      code: 'INVITE_DECRYPT_FAILED',
      message: 'Invite payload is not valid JSON',
    };
  }

  const parsedResult = v.safeParse(encryptedPayloadSchema, parsed);
  if (!parsedResult.success) {
    return {
      ok: false,
      code: 'INVITE_DECRYPT_FAILED',
      message: 'Invite payload shape is invalid',
    };
  }

  const value: EncryptedInvitePayload = parsedResult.output;

  const currentTime = now ?? Math.floor(Date.now() / 1000);
  if (currentTime >= value.exp) {
    return {
      ok: false,
      code: 'INVITE_EXPIRED',
      message: 'Invite has expired',
    };
  }

  return { ok: true, value };
}
