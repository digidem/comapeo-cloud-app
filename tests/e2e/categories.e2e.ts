import { expect, test } from '@playwright/test';

import { fieldsFixture, presetsFixture } from '@tests/fixtures/presets';

import { setupMockServer } from './mock-server';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_PROJECT_LOCAL_ID = 'test-project-local-1';
const TEST_PROJECT_REMOTE_ID = 'test-project-id-1'; // matches projectsFixture
const ARCHIVE_BASE_URL = 'http://archive.test';
const ARCHIVE_TOKEN = 'test-bearer-token';

/**
 * Seed IndexedDB with a project (with remoteId) and a field record,
 * and set the Zustand stores for auth and project selection.
 * Must be called AFTER page.goto('/') so IndexedDB is accessible.
 */
async function seedAppState(page: import('@playwright/test').Page) {
  // Set Zustand stores via localStorage (hydrated on app load)
  await page.evaluate(
    ({ baseUrl, token, projectId }) => {
      // Auth store (persisted key: 'comapeo-auth')
      localStorage.setItem(
        'comapeo-auth',
        JSON.stringify({
          state: {
            tier: 'remoteArchive',
            servers: [
              {
                id: 'server-1',
                label: 'Test Server',
                baseUrl,
                token,
                status: 'connected',
              },
            ],
            activeServerId: 'server-1',
            token,
            baseUrl,
            isAuthenticated: true,
          },
          version: 0,
        }),
      );

      // Project store (persisted key: 'comapeo-project')
      localStorage.setItem(
        'comapeo-project',
        JSON.stringify({
          state: {
            selectedProjectId: projectId,
            selectedServerId: null,
          },
          version: 0,
        }),
      );
    },
    { baseUrl: ARCHIVE_BASE_URL, token: ARCHIVE_TOKEN, projectId: TEST_PROJECT_LOCAL_ID },
  );

  // Seed IndexedDB with a project and a field
  await page.evaluate(
    ({
      projectLocalId,
      projectRemoteId,
      fieldLocalId,
      fieldRemoteId,
      fieldName,
    }) => {
      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('comapeo-cloud-app');
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(
            ['projects', 'fields'],
            'readwrite',
          );
        const now = new Date().toISOString();

        // Insert project
        tx.objectStore('projects').put({
          localId: projectLocalId,
          sourceType: 'remoteArchive',
          sourceId: 'server-1',
          remoteId: projectRemoteId,
          name: 'Test Project',
          createdAt: now,
          updatedAt: now,
          dirtyLocal: false,
          deleted: false,
        });

        // Insert field
        tx.objectStore('fields').put({
          localId: fieldLocalId,
          projectLocalId,
          sourceType: 'remoteArchive',
          sourceId: 'server-1',
          remoteId: fieldRemoteId,
          type: 'text',
          key: 'notes',
          label: fieldName,
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
      request.onerror = () => reject(request.error);
    },
    {
      projectLocalId: TEST_PROJECT_LOCAL_ID,
      projectRemoteId: TEST_PROJECT_REMOTE_ID,
      fieldLocalId: 'field-local-001',
      fieldRemoteId: 'field-001', // matches fieldsFixture docId
      fieldName: 'Notes',
    },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Categories Editor', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockServer(page);
    // Navigate to home first so IndexedDB is accessible, then seed state
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await seedAppState(page);
    // Navigate to categories — the app will hydrate stores from localStorage
    await page.goto('/categories');
    await page.waitForLoadState('domcontentloaded');
  });

  test('renders categories from server data', async ({ page }) => {
    // Wait for preset data to load and render
    await expect(page.getByText('Categories')).toBeVisible({ timeout: 10_000 });

    // Verify fixture category names appear
    const presetNames = presetsFixture.data.map((p) => p.name);
    for (const name of presetNames) {
      await expect(page.getByText(name, { exact: false }).first()).toBeVisible({
        timeout: 10_000,
      });
    }
  });

  test('search filters categories', async ({ page }) => {
    await expect(page.getByText('Categories')).toBeVisible({ timeout: 10_000 });

    // Wait for categories to render
    await expect(
      page.getByText(presetsFixture.data[0]!.name, { exact: false }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Type in the search input
    const searchInput = page.getByPlaceholder('Search categories...');
    await searchInput.fill('Water');

    // Only "Water Contamination" should remain
    await expect(page.getByText('Water Contamination').first()).toBeVisible({
      timeout: 5_000,
    });
    // "Deforestation" should not be visible
    await expect(
      page.getByText('Deforestation', { exact: false }).first(),
    ).not.toBeVisible({ timeout: 3_000 });
  });

  test('selecting a category shows detail', async ({ page }) => {
    await expect(page.getByText('Categories')).toBeVisible({ timeout: 10_000 });

    // Wait for categories to render
    await expect(
      page.getByText(presetsFixture.data[0]!.name, { exact: false }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Click the first category ("Deforestation" has fieldRefs)
    await page.getByText('Deforestation', { exact: false }).first().click();

    // Detail panel should show field reference label from the fixture
    // The field "Notes" (from fieldsFixture) should appear in the detail
    await expect(page.getByText('Notes').first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test('empty state when no presets', async ({ page }) => {
    // Override presets route to return empty data
    await page.route('**/projects/*/preset', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      }),
    );

    // Navigate fresh so the empty presets route takes effect
    await page.goto('/categories');
    await page.waitForLoadState('domcontentloaded');

    // Should show the empty state message
    await expect(page.getByText('No categories found')).toBeVisible({
      timeout: 10_000,
    });
  });
});
