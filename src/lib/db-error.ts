/**
 * Structured error class for database operations.
 * Wraps Dexie/IndexedDB errors into typed, catchable exceptions.
 */
export class DbError extends Error {
  readonly code: 'NOT_FOUND' | 'FK_VIOLATION' | 'CONSTRAINT' | 'UNKNOWN';

  constructor(
    code: DbError['code'],
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DbError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// wrapDb — error normalisation helper
// ---------------------------------------------------------------------------

/**
 * Wraps an async DB operation so that Dexie/IndexedDB errors are re-thrown as
 * structured {@link DbError} instances.  Existing `DbError` values pass through
 * unchanged.
 */
export async function wrapDb<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    // Already a DbError — pass through unchanged
    if (err instanceof DbError) throw err;

    // Dexie / IndexedDB error names
    if (err instanceof Error) {
      const name = err.name;

      if (name === 'ConstraintError') {
        throw new DbError('CONSTRAINT', err.message, err);
      }
      if (name === 'DataError') {
        throw new DbError('CONSTRAINT', err.message, err);
      }
      if (name === 'NotFoundError') {
        throw new DbError('NOT_FOUND', err.message, err);
      }
    }

    throw new DbError(
      'UNKNOWN',
      err instanceof Error ? err.message : String(err),
      err,
    );
  }
}
