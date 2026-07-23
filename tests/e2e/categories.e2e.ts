import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { presetsFixture } from '@tests/fixtures/presets';

import { setupMockServer } from './mock-server';

const TEST_PROJECT_REMOTE_ID = 'test-project-id-1';
const ARCHIVE_BASE_URL = 'http://archive.test';
const ARCHIVE_TOKEN = 'test-bearer-token';

const AUTH_SEED = {
  tier: 'remoteArchive',
  servers: [
    {
      id: 'server-1',
      label: 'Test Server',
      baseUrl: ARCHIVE_BASE_URL,
      token: ARCHIVE_TOKEN,
      status: 'connected',
    },
  ],
  activeServerId: 'server-1',
  token: ARCHIVE_TOKEN,
  baseUrl: ARCHIVE_BASE_URL,
  isAuthenticated: true,
};

async function seedStores(page: Page) {
  await page.evaluate((authSeed) => {
    localStorage.setItem(
      'comapeo-auth',
      JSON.stringify({ state: authSeed, version: 0 }),
    );
    localStorage.setItem(
      'comapeo-project',
      JSON.stringify({
        state: { selectedProjectId: 'test-project-local-1', selectedServerId: null },
        version: 0,
      }),
    );
  }, AUTH_SEED);
}

async function seedDb(page: Page) {
  await page.evaluate(
    ({ now }) => {
      const openDb = new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('comapeo-cloud-app');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['projects', 'fields'], 'readwrite');
          tx.objectStore('projects').put({
            localId: 'test-project-local-1',
            sourceType: 'remoteArchive',
            sourceId: 'server-1',
            remoteId: TEST_PROJECT_REMOTE_ID,
            name: 'Test Project',
            createdAt: now,
            updatedAt: now,
            dirtyLocal: false,
            deleted: false,
          });
          tx.objectStore('fields').put({
            localId: 'field-local-001',
            projectLocalId: 'test-project-local-1',
            sourceType: 'remoteArchive',
            sourceId: 'server-1',
            remoteId: 'field-001',
            type: 'text',
            key: 'notes',
            label: 'Notes',
            universal: false,
            createdAt: now,
            updatedAt: now,
            dirtyLocal: false,
            deleted: false,
          });
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => { db.close(); reject(tx.error); };
        };
        req.onerror = () => reject(req.error);
      });
      return openDb;
    },
    { now: new Date().toISOString() },
  );
}

async function setupCategoriesPage(page: Page) {
  await setupMockServer(page);
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await seedStores(page);
  await seedDb(page);
  await page.goto('/categories');
  await page.waitForLoadState('domcontentloaded');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('renders categories from server data', async ({ page }) => {
  await setupCategoriesPage(page);
  await expect(page.getByText('Categories')).toBeVisible({ timeout: 10_000 });
  const presetNames = presetsFixture.data.map((p) => p.name);
  for (const name of presetNames) {
    await expect(page.getByText(name, { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    });
  }
});

test('search filters categories', async ({ page }) => {
  await setupCategoriesPage(page);
  await expect(page.getByText('Categories')).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByText(presetsFixture.data[0]!.name, { exact: false }).first(),
  ).toBeVisible({ timeout: 10_000 });

  await page.getByPlaceholder('Search categories...').fill('Water');
  await expect(page.getByText('Water Contamination').first()).toBeVisible({
    timeout: 5_000,
  });
  await expect(
    page.getByText('Deforestation', { exact: false }).first(),
  ).not.toBeVisible({ timeout: 3_000 });
});

test('selecting a category shows detail', async ({ page }) => {
  await setupCategoriesPage(page);
  await expect(page.getByText('Categories')).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByText(presetsFixture.data[0]!.name, { exact: false }).first(),
  ).toBeVisible({ timeout: 10_000 });

  await page.getByText('Deforestation', { exact: false }).first().click();
  await expect(page.getByText('Notes').first()).toBeVisible({ timeout: 5_000 });
});

test('empty state when no presets', async ({ page }) => {
  await setupMockServer(page);
  await page.route('**/projects/*/preset', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    }),
  );
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await seedStores(page);
  await seedDb(page);
  await page.goto('/categories');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByText('No categories found')).toBeVisible({
    timeout: 10_000,
  });
});
