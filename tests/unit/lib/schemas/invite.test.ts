import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import {
  decryptInviteRequestSchema,
  encryptInviteRequestSchema,
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
});
