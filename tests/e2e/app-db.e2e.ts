import { expect, test } from '@playwright/test';

import {
  countAppDatabaseRecords,
  getAppDatabaseRecord,
  seedAppDatabase,
  updateAppDatabaseRecord,
} from './app-db';

test.describe('shared E2E app database helper', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
  });

  test('waits for the app schema before seeding and reading records', async ({
    page,
  }) => {
    const now = '2026-08-17T09:00:00.000Z';
    await seedAppDatabase(page, {
      projects: [
        {
          localId: 'app-db-helper-project',
          sourceType: 'local',
          sourceId: 'local:app-db-helper-project',
          name: 'E2E App DB Helper',
          createdAt: now,
          updatedAt: now,
          dirtyLocal: false,
          deleted: false,
        },
      ],
    });

    await expect(countAppDatabaseRecords(page, 'projects')).resolves.toBe(1);
    await expect(
      getAppDatabaseRecord<{ name?: string }>(
        page,
        'projects',
        'app-db-helper-project',
      ),
    ).resolves.toMatchObject({ name: 'E2E App DB Helper' });
  });

  test('reports deterministic errors for invalid mutations', async ({
    page,
  }) => {
    await expect(
      updateAppDatabaseRecord(page, 'projects', 'missing-project', {
        name: 'Should fail',
      }),
    ).rejects.toThrow(
      'E2E database operation failed (update): Cannot update missing projects record missing-project',
    );
  });
});
