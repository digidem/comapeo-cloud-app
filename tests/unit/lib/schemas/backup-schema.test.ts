import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { backupSchema } from '@/lib/schemas/backup-schema';

describe('backupSchema', () => {
  const validBackup = {
    version: 1,
    exportedAt: '2025-01-15T10:30:00.000Z',
    data: {
      'auth-store': '{"token":"abc123","baseUrl":"https://example.com"}',
      'theme-preference': '"dark"',
    },
  };

  it('accepts a valid backup object', () => {
    const result = v.parse(backupSchema, validBackup);
    expect(result).toEqual(validBackup);
  });

  it('rejects missing version field', () => {
    expect(() =>
      v.parse(backupSchema, {
        exportedAt: '2025-01-15T10:30:00.000Z',
        data: { key: 'value' },
      }),
    ).toThrow();
  });

  it('rejects missing data field', () => {
    expect(() =>
      v.parse(backupSchema, {
        version: 1,
        exportedAt: '2025-01-15T10:30:00.000Z',
      }),
    ).toThrow();
  });

  it('rejects data with non-string values', () => {
    expect(() =>
      v.parse(backupSchema, {
        version: 1,
        exportedAt: '2025-01-15T10:30:00.000Z',
        data: { key: 123 },
      }),
    ).toThrow();
  });

  it('rejects unknown version numbers', () => {
    expect(() =>
      v.parse(backupSchema, {
        version: 2,
        exportedAt: '2025-01-15T10:30:00.000Z',
        data: { key: 'value' },
      }),
    ).toThrow();
  });

  it('rejects missing exportedAt field', () => {
    expect(() =>
      v.parse(backupSchema, {
        version: 1,
        data: { key: 'value' },
      }),
    ).toThrow();
  });
});
