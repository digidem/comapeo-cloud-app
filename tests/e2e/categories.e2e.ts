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
 * Run BEFORE page loads.
 * - localStorage: Zustand persist stores read this on init.
 * - DON'T seed IndexedDB here — use page.evaluate after page load and reload.
 */
function registerSeedScript(page: Page) {
  return page.addInitScript(
    ({ authSeed, projectSeed, now, remoteId }) => {
      localStorage.setItem(
        'comapeo-auth',
        JSON.stringify({ state: authSeed, version: 0 }),
      );
      localStorage.setItem(
        'comapeo-project',
        JSON.stringify({ state: projectSeed, version: 0 }),
      );

      // Seed IndexedDB ONLY if stores don't exist yet (first load).
      // After reload, stores exist from Dexie and we skip creation.
      const req = indexedDB.open('comapeo-cloud-app');
      let created = false;
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('remoteServers')) {
          const srv = db.createObjectStore('remoteServers', { keyPath: 'id' });
          srv.createIndex('baseUrl', 'baseUrl', { unique: false });
        }
        if (!db.objectStoreNames.contains('projects')) {
          const p = db.createObjectStore('projects', { keyPath: 'localId' });
          p.createIndex(
            'sourceType+sourceId+remoteId',
            ['sourceType', 'sourceId', 'remoteId'],
            { unique: true },
          );
        }
        if (!db.objectStoreNames.contains('fields')) {
          const f = db.createObjectStore('fields', { keyPath: 'localId' });
          f.createIndex(
            'projectLocalId+remoteId',
            ['projectLocalId', 'remoteId'],
            { unique: true },
          );
        }
        created = true;
      };
      req.onsuccess = () => {
        // Only seed on first creation — after reload, Dexie owns the schema.
        if (!created) return;
        const db = req.result;
        try {
          const tx = db.transaction(
            ['remoteServers', 'projects', 'fields'],
            'readwrite',
          );
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
          tx.oncomplete = () => db.close();
          tx.onerror = () => db.close();
        } catch {
          db.close();
        }
      };
    },
    {
      authSeed: AUTH_SEED,
      projectSeed: PROJECT_SEED,
      now: NOW,
      remoteId: TEST_PROJECT_REMOTE_ID,
    },
  );
}

async function setupCategoriesPage(page: Page) {
  await setupMockServer(page);
  await registerSeedScript(page);
  // First load — addInitScript creates IndexedDB stores + seeds data.
  // But Dexie will upgrade the schema, so our data may be in an old-version DB.
  // Reload so Dexie opens at its correct version and hydrateServers picks up
  // the seeded remoteServers.
  await page.goto('/categories', { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
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
  await page.goto('/categories', { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText('No categories found')).toBeVisible({
    timeout: 5_000,
  });
});
