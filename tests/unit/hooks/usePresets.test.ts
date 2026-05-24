import { renderHook, waitFor } from '@testing-library/react';
import { createQueryWrapper } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import { usePresets } from '@/hooks/usePresets';
import { getDb, resetDb } from '@/lib/db';

beforeEach(async () => {
  await resetDb();
});

describe('usePresets', () => {
  it('returns presets for a valid projectLocalId', async () => {
    // Seed presets directly in DB
    const db = getDb();
    await db.presets.bulkPut([
      {
        localId: 'preset-1',
        projectLocalId: 'proj-local-1',
        sourceType: 'remoteArchive',
        sourceId: 's1',
        remoteId: 'forest',
        name: 'Forest',
        terms: [],
        fieldRefs: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        dirtyLocal: false,
        deleted: false,
      },
      {
        localId: 'preset-2',
        projectLocalId: 'proj-local-1',
        sourceType: 'remoteArchive',
        sourceId: 's1',
        remoteId: 'water',
        name: 'Water',
        terms: [],
        fieldRefs: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        dirtyLocal: false,
        deleted: false,
      },
    ]);

    const { result } = renderHook(() => usePresets('proj-local-1'), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeInstanceOf(Array);
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data![0]!.name).toBe('Forest');
  });

  it('does not fetch when projectLocalId is null', async () => {
    const { result } = renderHook(() => usePresets(null), {
      wrapper: createQueryWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
  });
});
