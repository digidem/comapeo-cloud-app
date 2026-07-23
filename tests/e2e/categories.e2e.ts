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

const PROJECT_SEED = {
  selectedProjectId: 'test-project-local-1',
  selectedServerId: null,
};

const NOW = new Date().toISOString();

/**
 * Run BEFORE page loads — sets localStorage so Zustand persist middleware
 * reads it on initialization.
 */
function registerSeedScript(page: Page) {
  return page.addInitScript(
    ({ authSeed, projectSeed }) => {
      localStorage.setItem(
        'comapeo-auth',
        JSON.stringify({ state: authSeed, version: 0 }),
      );
      localStorage.setItem(
        'comapeo-project',
        JSON.stringify({ state: projectSeed, version: 0 }),
      );
    },
    { authSeed: AUTH_SEED, projectSeed: PROJECT_SEED },
  );
}

/**
 * Run AFTER page loads and Dexie has created IndexedDB stores.
 * Seeds project + field records.
 */
async function seedDb(page: Page) {
  await page.evaluate(
    ({ now, remoteId }) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('comapeo-cloud-app');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['projects', 'fields'], 'readwrite');
          tx.objectStore('projects').put({
            localId: 'test-project-local-1',
            sourceType: 'remoteArchive',
            sourceId: 'server-1',
            remoteId,
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
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
        req.onerror = () => reject(req.error);
      }),
    { now: NOW, remoteId: TEST_PROJECT_REMOTE_ID },
  );
}

async function setupCategoriesPage(page: Page) {
  await setupMockServer(page);
  // addInitScript fires BEFORE page load → Zustand reads seeded localStorage.
  await registerSeedScript(page);
  // Load / first so Dexie creates all IndexedDB stores.
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // Now seed IndexedDB — stores already created by Dexie.
  await seedDb(page);
  // Navigate to categories. React mounts fresh → useProjects reads seeded DB
  // → finds project → useApiPresets fetches from mock server.
  await page.goto('/categories', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible({
    timeout: 10_000,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('renders categories from server data', async ({ page }) => {
  await setupCategoriesPage(page);
  const presetNames = presetsFixture.data.map((p) => p.name);
  for (const name of presetNames) {
    await expect(page.getByText(name, { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    });
  }
});

test('search filters categories', async ({ page }) => {
  await setupCategoriesPage(page);
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
  await registerSeedScript(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await seedDb(page);
  await page.goto('/categories', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  // "No categories found" renders inside the CategoriesEditor after heading
  await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText('No categories found')).toBeVisible({
    timeout: 5_000,
  });
});
