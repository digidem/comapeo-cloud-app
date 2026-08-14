import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  closeDbForStorageReset,
  getDb,
  resetDb,
  resetDbIsolated,
} from '@/lib/db';

async function ensureDbOpen() {
  const db = getDb();
  if (!db.isOpen()) await db.open();
  return db;
}

describe('primary database reset coordination', () => {
  beforeEach(async () => {
    await ensureDbOpen();
    await resetDb();
  });

  afterEach(async () => {
    await ensureDbOpen();
    await resetDb();
  });

  it('removes a stale write that lands after the initiating reset clear', async () => {
    const db = await ensureDbOpen();

    // Model the initiator's successful primary-database clear.
    await db.syncMetadata.put({
      id: 'before-reset',
      serverId: 'server-1',
      status: 'syncing',
      updatedAt: '2026-08-14T00:00:00.000Z',
    });
    await resetDb();
    expect(await db.syncMetadata.count()).toBe(0);

    // Model a transaction from another tab that was already in flight and
    // commits after the initiator's clear but before that tab is fully quiesced.
    await db.syncMetadata.put({
      id: 'stale-after-reset',
      serverId: 'server-1',
      status: 'complete',
      updatedAt: '2026-08-14T00:00:01.000Z',
    });
    expect(await db.syncMetadata.count()).toBe(1);

    closeDbForStorageReset();
    await resetDbIsolated();
    expect(db.isOpen()).toBe(false);

    await db.open();
    expect(await db.syncMetadata.count()).toBe(0);
  });
});
