import { beforeEach, describe, expect, it } from 'vitest';

import type { SavedMap } from '@/lib/db';
import { getDb, resetDb } from '@/lib/db';
import {
  getProjectSavedMapIds,
  recoverCancelledMapDownload,
} from '@/lib/map/saved-map-lifecycle';

function createMap(overrides: Partial<SavedMap> = {}): SavedMap {
  return {
    id: 'map-1',
    projectLocalId: 'project-1',
    name: 'Territory map',
    type: 'raster',
    origin: 'authored',
    styleUrl: 'https://example.com/{z}/{x}/{y}.png',
    bbox: [-70, -5, -60, 2],
    minZoom: 0,
    maxZoom: 14,
    scheme: 'xyz',
    status: 'draft',
    createdAt: '2026-08-12T12:00:00.000Z',
    updatedAt: '2026-08-12T12:00:00.000Z',
    ...overrides,
  };
}

describe('saved-map lifecycle helpers', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('returns only map ids owned by the requested project', async () => {
    await getDb().maps.bulkAdd([
      createMap({ id: 'map-a' }),
      createMap({ id: 'map-b' }),
      createMap({ id: 'map-c', projectLocalId: 'project-2' }),
    ]);

    expect(await getProjectSavedMapIds('project-1')).toEqual([
      'map-a',
      'map-b',
    ]);
  });

  it('recovers a surviving cancelled download to a retryable draft state', async () => {
    await getDb().maps.add(
      createMap({
        status: 'downloading',
        errorMessage: 'old error',
      }),
    );

    await recoverCancelledMapDownload('map-1');

    const recovered = await getDb().maps.get('map-1');
    expect(recovered).toMatchObject({ status: 'draft' });
    expect(recovered).not.toHaveProperty('errorMessage');
  });
});
