import { describe, expect, it } from 'vitest';

import { DbError, wrapDb } from '@/lib/db-error';

describe('DbError', () => {
  it('is an instance of Error', () => {
    const err = new DbError('UNKNOWN', 'something went wrong');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DbError);
  });

  it('has correct name, code, and message', () => {
    const err = new DbError('FK_VIOLATION', 'project not found');
    expect(err.name).toBe('DbError');
    expect(err.code).toBe('FK_VIOLATION');
    expect(err.message).toBe('project not found');
  });

  it('stores the original cause', () => {
    const cause = new Error('original');
    const err = new DbError('CONSTRAINT', 'wrapped', cause);
    expect(err.cause).toBe(cause);
  });

  it('supports all error codes', () => {
    const codes = [
      'NOT_FOUND',
      'FK_VIOLATION',
      'CONSTRAINT',
      'UNKNOWN',
    ] as const;
    for (const code of codes) {
      const err = new DbError(code, 'msg');
      expect(err.code).toBe(code);
    }
  });
});

describe('wrapDb', () => {
  it('returns the result on success', async () => {
    const result = await wrapDb(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it('passes through DbError instances unchanged', async () => {
    const original = new DbError('FK_VIOLATION', 'bad ref');
    await expect(wrapDb(() => Promise.reject(original))).rejects.toBe(original);
  });

  it('wraps ConstraintError into DbError CONSTRAINT', async () => {
    const dexieError = new Error('Key already exists');
    dexieError.name = 'ConstraintError';

    await expect(wrapDb(() => Promise.reject(dexieError))).rejects.toThrow(
      DbError,
    );

    try {
      await wrapDb(() => Promise.reject(dexieError));
    } catch (err) {
      expect(err).toBeInstanceOf(DbError);
      expect((err as DbError).code).toBe('CONSTRAINT');
      expect((err as DbError).cause).toBe(dexieError);
    }
  });

  it('wraps DataError into DbError CONSTRAINT', async () => {
    const dexieError = new Error('Invalid key');
    dexieError.name = 'DataError';

    try {
      await wrapDb(() => Promise.reject(dexieError));
    } catch (err) {
      expect(err).toBeInstanceOf(DbError);
      expect((err as DbError).code).toBe('CONSTRAINT');
    }
  });

  it('wraps NotFoundError into DbError NOT_FOUND', async () => {
    const dexieError = new Error('Record not found');
    dexieError.name = 'NotFoundError';

    try {
      await wrapDb(() => Promise.reject(dexieError));
    } catch (err) {
      expect(err).toBeInstanceOf(DbError);
      expect((err as DbError).code).toBe('NOT_FOUND');
    }
  });

  it('wraps unknown errors into DbError UNKNOWN', async () => {
    try {
      await wrapDb(() => Promise.reject(new Error('random failure')));
    } catch (err) {
      expect(err).toBeInstanceOf(DbError);
      expect((err as DbError).code).toBe('UNKNOWN');
    }
  });

  it('wraps non-Error throws into DbError UNKNOWN', async () => {
    try {
      await wrapDb(() => Promise.reject('string error'));
    } catch (err) {
      expect(err).toBeInstanceOf(DbError);
      expect((err as DbError).code).toBe('UNKNOWN');
      expect((err as DbError).message).toBe('string error');
    }
  });
});
