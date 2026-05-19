import { beforeAll, describe, expect, it } from 'vitest';

import {
  type EncryptedInvitePayload,
  decryptInvite,
  encryptInvite,
} from '@/lib/invite-crypto';

describe('invite-crypto', () => {
  let key: Uint8Array;

  beforeAll(() => {
    const buffer = new ArrayBuffer(32);
    const bytes = new Uint8Array(buffer);
    globalThis.crypto.getRandomValues(bytes);
    key = bytes;
  });

  function makePayload(
    overrides: Partial<EncryptedInvitePayload> = {},
  ): EncryptedInvitePayload {
    return {
      url: 'https://archive.example.com',
      token: 'super-secret-bearer-token',
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
      ...overrides,
    };
  }

  it('round-trips an encrypted payload back to the original value', async () => {
    const payload = makePayload();
    const code = await encryptInvite(payload, key);
    const result = await decryptInvite(code, key);
    expect(result).toEqual({ ok: true, value: payload });
  });

  it('produces a different ciphertext for the same payload (random IV)', async () => {
    const payload = makePayload();
    const first = await encryptInvite(payload, key);
    const second = await encryptInvite(payload, key);
    expect(first).not.toBe(second);
    expect(first.startsWith('v1.')).toBe(true);
    expect(second.startsWith('v1.')).toBe(true);
    expect(first.slice(3)).not.toBe(second.slice(3));
  });

  it('returns INVITE_DECRYPT_FAILED when the ciphertext is mutated', async () => {
    const payload = makePayload();
    const code = await encryptInvite(payload, key);
    const prefix = 'v1.';
    const body = code.slice(prefix.length);
    // Flip the last char to something different but still in the base64url
    // alphabet so we exercise the AES-GCM auth-tag failure path.
    const lastChar = body.charAt(body.length - 1);
    const replacement = lastChar === 'A' ? 'B' : 'A';
    const mutated = `${prefix}${body.slice(0, -1)}${replacement}`;
    const result = await decryptInvite(mutated, key);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVITE_DECRYPT_FAILED');
    }
  });

  it('returns INVITE_BAD_VERSION when the version prefix is missing', async () => {
    const result = await decryptInvite('totally-not-an-invite', key);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVITE_BAD_VERSION');
    }
  });

  it('returns INVITE_BAD_VERSION when the version prefix is v2.', async () => {
    const result = await decryptInvite('v2.abc', key);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVITE_BAD_VERSION');
    }
  });

  it('returns INVITE_BAD_FORMAT when the encoded body is not base64url', async () => {
    const result = await decryptInvite('v1.!@#$', key);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVITE_BAD_FORMAT');
    }
  });

  it('returns INVITE_EXPIRED when now is past exp', async () => {
    const exp = 1_000_000;
    const payload = makePayload({ exp });
    const code = await encryptInvite(payload, key);
    const result = await decryptInvite(code, key, exp + 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVITE_EXPIRED');
    }
  });

  it('returns INVITE_EXPIRED at the exact second the payload expires', async () => {
    const exp = 1_000_000;
    const payload = makePayload({ exp });
    const code = await encryptInvite(payload, key);
    const result = await decryptInvite(code, key, exp);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVITE_EXPIRED');
    }
  });

  it('returns INVITE_DECRYPT_FAILED when the decrypting key differs from the encrypting key', async () => {
    const code = await encryptInvite(makePayload(), key);
    const wrongKey = new Uint8Array(32);
    globalThis.crypto.getRandomValues(wrongKey);
    const result = await decryptInvite(code, wrongKey);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVITE_DECRYPT_FAILED');
    }
  });

  it('throws when encryptInvite is called with a 31-byte key', async () => {
    const shortKey = new Uint8Array(31);
    await expect(encryptInvite(makePayload(), shortKey)).rejects.toThrow(
      /32 bytes/,
    );
  });

  it('returns INVITE_BAD_FORMAT when the body after the version prefix is empty', async () => {
    const result = await decryptInvite('v1.', key);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVITE_BAD_FORMAT');
      expect(result.message).toMatch(/empty/i);
    }
  });

  it('returns INVITE_BAD_FORMAT when the decoded payload is shorter than the IV (<=12 bytes)', async () => {
    // 8 zero bytes → base64url 'AAAAAAAAAAA' (still valid alphabet,
    // decodes to fewer than 12 bytes → fails the IV-length guard).
    const result = await decryptInvite('v1.AAAAAAAAAAA', key);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVITE_BAD_FORMAT');
      expect(result.message).toMatch(/too short/i);
    }
  });

  it('returns INVITE_DECRYPT_FAILED when the decrypted plaintext is not valid JSON', async () => {
    // Encrypt a non-JSON payload directly by hand-crafting the AES-GCM
    // output so we exercise the JSON.parse catch branch.
    const subtle = globalThis.crypto.subtle;
    const cryptoKey = await subtle.importKey(
      'raw',
      key.buffer.slice(0) as ArrayBuffer,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt'],
    );
    const iv = new Uint8Array(12);
    globalThis.crypto.getRandomValues(iv);
    const plaintext = new TextEncoder().encode('this-is-not-json');
    const cipherBuffer = await subtle.encrypt(
      { name: 'AES-GCM', iv: iv.buffer.slice(0) as ArrayBuffer },
      cryptoKey,
      plaintext.buffer.slice(0) as ArrayBuffer,
    );
    const cipherBytes = new Uint8Array(cipherBuffer);
    const combined = new Uint8Array(iv.byteLength + cipherBytes.byteLength);
    combined.set(iv, 0);
    combined.set(cipherBytes, iv.byteLength);
    let binary = '';
    for (let i = 0; i < combined.byteLength; i += 1) {
      binary += String.fromCharCode(combined[i] as number);
    }
    const b64url = btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const code = `v1.${b64url}`;

    const result = await decryptInvite(code, key);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVITE_DECRYPT_FAILED');
      expect(result.message).toMatch(/json/i);
    }
  });

  it('returns INVITE_DECRYPT_FAILED when the decrypted JSON has the wrong shape', async () => {
    // Same approach as above but the plaintext IS valid JSON, just missing
    // the required url/token/exp fields.
    const subtle = globalThis.crypto.subtle;
    const cryptoKey = await subtle.importKey(
      'raw',
      key.buffer.slice(0) as ArrayBuffer,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt'],
    );
    const iv = new Uint8Array(12);
    globalThis.crypto.getRandomValues(iv);
    const plaintext = new TextEncoder().encode(
      JSON.stringify({ foo: 'bar', exp: 'not-a-number' }),
    );
    const cipherBuffer = await subtle.encrypt(
      { name: 'AES-GCM', iv: iv.buffer.slice(0) as ArrayBuffer },
      cryptoKey,
      plaintext.buffer.slice(0) as ArrayBuffer,
    );
    const cipherBytes = new Uint8Array(cipherBuffer);
    const combined = new Uint8Array(iv.byteLength + cipherBytes.byteLength);
    combined.set(iv, 0);
    combined.set(cipherBytes, iv.byteLength);
    let binary = '';
    for (let i = 0; i < combined.byteLength; i += 1) {
      binary += String.fromCharCode(combined[i] as number);
    }
    const b64url = btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const code = `v1.${b64url}`;

    const result = await decryptInvite(code, key);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVITE_DECRYPT_FAILED');
      expect(result.message).toMatch(/shape/i);
    }
  });
});
