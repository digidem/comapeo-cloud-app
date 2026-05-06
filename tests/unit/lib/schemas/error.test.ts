import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { errorResponseSchema } from '@/lib/schemas/error';

describe('errorResponseSchema', () => {
  const validError = {
    error: {
      code: 'UNAUTHORIZED',
      message: 'Invalid or missing authentication token',
    },
  };

  it('parses valid error response', () => {
    const result = v.parse(errorResponseSchema, validError);
    expect(result).toEqual(validError);
  });

  it('extracts error code correctly', () => {
    const result = v.parse(errorResponseSchema, validError);
    expect(result.error.code).toBe('UNAUTHORIZED');
  });

  it('extracts error message correctly', () => {
    const result = v.parse(errorResponseSchema, validError);
    expect(result.error.message).toBe(
      'Invalid or missing authentication token',
    );
  });

  it('rejects missing error wrapper', () => {
    expect(() =>
      v.parse(errorResponseSchema, {
        code: 'UNAUTHORIZED',
        message: 'Invalid token',
      }),
    ).toThrow();
  });

  it('rejects missing code', () => {
    expect(() =>
      v.parse(errorResponseSchema, {
        error: { message: 'Some error' },
      }),
    ).toThrow();
  });

  it('rejects missing message', () => {
    expect(() =>
      v.parse(errorResponseSchema, {
        error: { code: 'ERROR' },
      }),
    ).toThrow();
  });

  it('rejects non-string code', () => {
    expect(() =>
      v.parse(errorResponseSchema, {
        error: { code: 500, message: 'Server error' },
      }),
    ).toThrow();
  });

  it('rejects non-string message', () => {
    expect(() =>
      v.parse(errorResponseSchema, {
        error: { code: 'ERROR', message: 42 },
      }),
    ).toThrow();
  });

  it('rejects empty object', () => {
    expect(() => v.parse(errorResponseSchema, {})).toThrow();
  });

  it('rejects non-object input', () => {
    expect(() => v.parse(errorResponseSchema, 'error')).toThrow();
    expect(() => v.parse(errorResponseSchema, null)).toThrow();
    expect(() => v.parse(errorResponseSchema, 123)).toThrow();
  });
});
