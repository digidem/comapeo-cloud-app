import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  closeDbForStorageReset,
  getDb,
  resetDb,
  resetDbIsolated,
  resumeDbAfterStorageReset,
} from '@/lib/db';

async function resetToUnquiescedEmptyState(): Promise<void> {
  // Force any existing singleton closed/null, then clear shared data through a
  // normal app-owned connection so each test starts from a deterministic state.
  closeDbForStorageReset();
  resumeDbAfterStorageReset();
  await resetDb();
  closeDbForStorageReset();
  resumeDbAfterStorageReset();
}

describe('primary database storage-reset quiescence latch', () => {
  beforeEach(async () => {
    await resetToUnquiescedEmptyState();
  });

  afterEach(async () => {
    resumeDbAfterStorageReset();
    await resetDb();
  });

  it('prevents creating a singleton when reset quiesces before the database was initialized', async () => {
    closeDbForStorageReset();

    expect(() => getDb()).toThrow(
      'Primary database is quiesced for local-data reset.',
    );

    // Recovery may still use an isolated connection, but it must not make the
    // app-owned singleton writable again in this mounted tab.
    await resetDbIsolated();
    expect(() => getDb()).toThrow(
      'Primary database is quiesced for local-data reset.',
    );
  });

  it('only permits a fresh app-owned singleton after reset coordination explicitly resumes it', () => {
    closeDbForStorageReset();
    expect(() => getDb()).toThrow();

    resumeDbAfterStorageReset();
    expect(() => getDb()).not.toThrow();
  });
});
