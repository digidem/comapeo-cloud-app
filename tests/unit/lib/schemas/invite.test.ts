import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import {
  decryptInviteRequestSchema,
  encryptInviteRequestSchema,
  encryptedPayloadSchema,
} from '@/lib/schemas/invite';

describe('encryptInviteRequestSchema', () => {
  it('parses a valid request with default ttlHours', () => {
    const result = v.parse(encryptInviteRequestSchema, {
      url: 'https://archive.example.com',
      token: 'bearer-abc',
    });
    expect(result.url).toBe('https://archive.example.com');
    expect(result.token).toBe('bearer-abc');
    expect(result.ttlHours).toBe(24);
  });

  it('parses a valid request with explicit ttlHours', () => {
    const result = v.parse(encryptInviteRequestSchema, {
      url: 'https://archive.example.com',
      token: 'bearer-abc',
      ttlHours: 1,
    });
    expect(result.ttlHours).toBe(1);
  });

  it('accepts the upper-bound ttlHours of 168', () => {
    const result = v.parse(encryptInviteRequestSchema, {
      url: 'https://archive.example.com',
      token: 'bearer-abc',
      ttlHours: 168,
    });
    expect(result.ttlHours).toBe(168);
  });

  it('rejects an empty url', () => {
    expect(() =>
      v.parse(encryptInviteRequestSchema, { url: '', token: 'bearer-abc' }),
    ).toThrow();
  });

  it('rejects a non-URL string', () => {
    expect(() =>
      v.parse(encryptInviteRequestSchema, {
        url: 'not-a-url',
        token: 'bearer-abc',
      }),
    ).toThrow();
  });

  it('rejects an empty token', () => {
    expect(() =>
      v.parse(encryptInviteRequestSchema, {
        url: 'https://archive.example.com',
        token: '',
      }),
    ).toThrow();
  });

  it('rejects ttlHours below the minimum (1)', () => {
    expect(() =>
      v.parse(encryptInviteRequestSchema, {
        url: 'https://archive.example.com',
        token: 'bearer-abc',
        ttlHours: 0,
      }),
    ).toThrow();
  });

  it('rejects ttlHours above the maximum (168)', () => {
    expect(() =>
      v.parse(encryptInviteRequestSchema, {
        url: 'https://archive.example.com',
        token: 'bearer-abc',
        ttlHours: 169,
      }),
    ).toThrow();
  });
});

describe('decryptInviteRequestSchema', () => {
  it('parses a valid request', () => {
    const result = v.parse(decryptInviteRequestSchema, { code: 'opaque-code' });
    expect(result.code).toBe('opaque-code');
  });

  it('rejects an empty code', () => {
    expect(() => v.parse(decryptInviteRequestSchema, { code: '' })).toThrow();
  });

  it('rejects a missing code', () => {
    expect(() => v.parse(decryptInviteRequestSchema, {})).toThrow();
  });

  it('accepts a code at the 2048-char boundary', () => {
    const code = 'a'.repeat(2048);
    expect(v.parse(decryptInviteRequestSchema, { code }).code).toHaveLength(
      2048,
    );
  });

  it('rejects a code longer than 2048 chars', () => {
    const code = 'a'.repeat(2049);
    expect(() => v.parse(decryptInviteRequestSchema, { code })).toThrow();
  });
});

describe('encryptedPayloadSchema', () => {
  it('parses a valid decrypted payload', () => {
    const result = v.parse(encryptedPayloadSchema, {
      url: 'https://archive.example.com',
      token: 'bearer-abc',
      exp: 1_700_000_000,
    });
    expect(result).toEqual({
      url: 'https://archive.example.com',
      token: 'bearer-abc',
      exp: 1_700_000_000,
    });
  });

  it('rejects a payload missing url', () => {
    expect(() =>
      v.parse(encryptedPayloadSchema, { token: 'x', exp: 1 }),
    ).toThrow();
  });

  it('rejects a payload missing token', () => {
    expect(() =>
      v.parse(encryptedPayloadSchema, { url: 'https://a', exp: 1 }),
    ).toThrow();
  });

  it('rejects a payload missing exp', () => {
    expect(() =>
      v.parse(encryptedPayloadSchema, { url: 'https://a', token: 'x' }),
    ).toThrow();
  });

  it('rejects a payload where exp is not a number', () => {
    expect(() =>
      v.parse(encryptedPayloadSchema, {
        url: 'https://a',
        token: 'x',
        exp: '1',
      }),
    ).toThrow();
  });

  it('rejects a payload where url is not a string', () => {
    expect(() =>
      v.parse(encryptedPayloadSchema, { url: 42, token: 'x', exp: 1 }),
    ).toThrow();
  });
});
