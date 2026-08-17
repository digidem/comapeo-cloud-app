import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { presetsFixture } from '@tests/fixtures/presets';

import { seedAppDatabase } from './app-db';
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

/** Seed categories fixtures after the app has created its real Dexie schema. */
async function seedDbAndHydrate(page: Page) {
  const server = AUTH_SEED.servers[0]!;
  await seedAppDatabase(page, {
    remoteServers: [
      {
        ...server,
        lastSyncedAt: NOW,
      },
    ],
    projects: [
      {
        localId: 'test-project-local-1',
        sourceType: 'remoteArchive',
        sourceId: server.id,
        remoteId: TEST_PROJECT_REMOTE_ID,
        name: 'Test Project',
        createdAt: NOW,
        updatedAt: NOW,
        dirtyLocal: false,
        deleted: false,
      },
    ],
    fields: [
      {
        localId: 'field-local-001',
        projectLocalId: 'test-project-local-1',
        sourceType: 'remoteArchive',
        sourceId: server.id,
        remoteId: 'field-001',
        type: 'text',
        key: 'notes',
        label: 'Notes',
        universal: false,
        createdAt: NOW,
        updatedAt: NOW,
        dirtyLocal: false,
        deleted: false,
      },
    ],
  });
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
