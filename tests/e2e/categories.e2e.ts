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
 * Seed IndexedDB via page.evaluate AFTER Dexie has created its stores.
 *
 * On webkit, Dexie's own `db.open()` (triggered by the app mounting) can
 * still be mid-upgrade when this code runs. Calling `indexedDB.open(name)`
 * with no version — before the database exists at all — would itself
 * create an empty v1 database and steal the upgrade race from Dexie. To
 * avoid that, first check for existence non-destructively via
 * `indexedDB.databases()`; only once the database is known to exist do we
 * open it (which, given it already exists, won't trigger a competing
 * upgrade) and verify the required object stores are present. Retry (via
 * `expect.toPass`) until both the database and its stores are ready.
 */
async function seedDbAndHydrate(page: Page) {
  const REQUIRED_STORES = ['remoteServers', 'projects', 'fields'] as const;
  const DB_NAME = 'comapeo-cloud-app';

  await expect(async () => {
    const dbExists = await page.evaluate(async (name) => {
      const dbs = await indexedDB.databases();
      return dbs.some(
        (entry) => entry.name === name && (entry.version ?? 0) > 0,
      );
    }, DB_NAME);

    if (!dbExists) {
      throw new Error('IndexedDB database not created yet');
    }

    await page.evaluate(
      ({ now, remoteId, requiredStores, dbName }) =>
        new Promise<void>((resolve, reject) => {
          const req = indexedDB.open(dbName);
          req.onsuccess = () => {
            const db = req.result;
            const missing = requiredStores.filter(
              (name) => !db.objectStoreNames.contains(name),
            );
            if (missing.length > 0) {
              db.close();
              reject(
                new Error(
                  `IndexedDB stores not ready yet: ${missing.join(', ')}`,
                ),
              );
              return;
            }
            try {
              const tx = db.transaction(requiredStores, 'readwrite');
              tx.objectStore('remoteServers').put({
                id: 'server-1',
                baseUrl: 'http://archive.test',
                token: 'test-bearer-token',
                status: 'connected',
                lastSyncedAt: now,
              });
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
              tx.onabort = () => {
                db.close();
                reject(tx.error ?? new Error('Transaction aborted'));
              };
            } catch (err) {
              db.close();
              reject(err);
            }
          };
          req.onerror = () => reject(req.error);
        }),
      {
        now: NOW,
        remoteId: TEST_PROJECT_REMOTE_ID,
        requiredStores: REQUIRED_STORES,
        dbName: DB_NAME,
      },
    );
  }).toPass({ timeout: 10_000, intervals: [100, 200, 500] });
}

async function setupCategoriesPage(page: Page) {
  await setupMockServer(page);
  await registerSeedScript(page);
  // Load / first so Dexie creates IndexedDB stores.
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // Seed IndexedDB and call hydrateServers() so the auth store picks up the seeded remoteServers.
  await seedDbAndHydrate(page);
  // Navigate to categories. React mounts fresh → useProjects refetches
  // from IndexedDB (staleTime=0), useAuthStore is hydrated.
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
  // With Latest filter (default), only the most recent cluster shows.
  // Preset-001 (Deforestation, 2024-03-15) is in the latest cluster;
  // Preset-002 (Water Contamination, 2024-03-14) is in an older cluster.
  await expect(
    page.getByText(presetsFixture.data[0]!.name, { exact: false }).first(),
  ).toBeVisible({ timeout: 10_000 });
  // Older cluster preset should be hidden by default
  await expect(
    page.getByText(presetsFixture.data[1]!.name, { exact: false }).first(),
  ).not.toBeVisible({ timeout: 3_000 });
});

test('search filters categories', async ({ page }) => {
  await setupCategoriesPage(page);
  await expect(
    page.getByText(presetsFixture.data[0]!.name, { exact: false }).first(),
  ).toBeVisible({ timeout: 10_000 });

  // Search within the latest cluster — "Deforestation" is visible
  await page.getByPlaceholder('Search categories...').fill('Defor');
  await expect(page.getByText('Deforestation').first()).toBeVisible({
    timeout: 5_000,
  });

  // Search for something not in the latest cluster shows empty
  await page.getByPlaceholder('Search categories...').fill('Water');
  await expect(page.getByText('No categories match your search')).toBeVisible({
    timeout: 5_000,
  });
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
  await seedDbAndHydrate(page);
  await page.goto('/categories', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText('No categories found')).toBeVisible({
    timeout: 5_000,
  });
});

test('category cards render SVG icons from server', async ({ page }) => {
  await setupCategoriesPage(page);
  await expect(
    page.getByText('Deforestation', { exact: false }).first(),
  ).toBeVisible({ timeout: 10_000 });

  // Select the Deforestation category to see its detail view with icon
  await page.getByText('Deforestation', { exact: false }).first().click();

  // The detail view should show a category icon img (rendered by AuthImg
  // after fetching the SVG blob from our mock route)
  const iconImg = page.locator(
    '[data-testid="category-icon"] img[alt="Deforestation icon"]',
  );
  await expect(iconImg.first()).toBeVisible({ timeout: 10_000 });
});
