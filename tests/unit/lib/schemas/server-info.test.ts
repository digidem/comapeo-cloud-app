import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { serverInfoResponseSchema } from '@/lib/schemas/server-info';

describe('serverInfoResponseSchema', () => {
  const validData = {
    data: {
      deviceId: 'abc-123',
      name: 'Test Server',
    },
  };

  it('parses valid server info response', () => {
    const result = v.parse(serverInfoResponseSchema, validData);
    expect(result).toEqual(validData);
  });

  it('extracts deviceId correctly', () => {
    const result = v.parse(serverInfoResponseSchema, validData);
    expect(result.data.deviceId).toBe('abc-123');
  });

  it('extracts name correctly', () => {
    const result = v.parse(serverInfoResponseSchema, validData);
    expect(result.data.name).toBe('Test Server');
  });

  it('rejects missing data wrapper', () => {
    expect(() =>
      v.parse(serverInfoResponseSchema, {
        deviceId: 'abc-123',
        name: 'Test Server',
      }),
    ).toThrow();
  });

  it('rejects missing deviceId', () => {
    expect(() =>
      v.parse(serverInfoResponseSchema, {
        data: { name: 'Test Server' },
      }),
    ).toThrow();
  });

  it('rejects missing name', () => {
    expect(() =>
      v.parse(serverInfoResponseSchema, {
        data: { deviceId: 'abc-123' },
      }),
    ).toThrow();
  });

  it('rejects non-string deviceId', () => {
    expect(() =>
      v.parse(serverInfoResponseSchema, {
        data: { deviceId: 123, name: 'Test Server' },
      }),
    ).toThrow();
  });

  it('rejects non-string name', () => {
    expect(() =>
      v.parse(serverInfoResponseSchema, {
        data: { deviceId: 'abc-123', name: 42 },
      }),
    ).toThrow();
  });

  it('rejects empty object', () => {
    expect(() => v.parse(serverInfoResponseSchema, {})).toThrow();
  });

  it('rejects non-object input', () => {
    expect(() => v.parse(serverInfoResponseSchema, 'not an object')).toThrow();
    expect(() => v.parse(serverInfoResponseSchema, null)).toThrow();
  });
});
