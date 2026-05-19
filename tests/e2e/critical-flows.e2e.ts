import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { setupMockServer } from './mock-server';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GEOJSON_FIXTURE = path.join(
  __dirname,
  '../fixtures/sample-territory.geojson',
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createProject(
  page: import('@playwright/test').Page,
  name: string,
) {
  await page
    .getByRole('button', { name: 'Create your first project' })
    .first()
    .click();
  await page.getByLabel('Project Name').fill(name);
  // Scope to dialog to avoid matching other "Create" text on page
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Create', exact: true })
    .click();
  await expect(page.getByRole('heading', { name })).toBeVisible({
    timeout: 5_000,
  });
}

/**
 * Create a project, import GeoJSON, wait for observations in IndexedDB,
 * and wait for selectedProjectId to be persisted to localStorage.
 * Returns the projectLocalId.
 */
async function seedProjectWithObservations(
  page: import('@playwright/test').Page,
  name: string,
): Promise<string> {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  // Create project
  await createProject(page, name);

  // Import GeoJSON via file chooser
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import Data' }).click(),
  ]);
  await fileChooser.setFiles(GEOJSON_FIXTURE);

  // Wait for observations to appear in IndexedDB
  await expect
    .poll(
      async () => {
        return await page.evaluate(async () => {
          return new Promise<number>((resolve) => {
            const req = indexedDB.open('comapeo-cloud-app');
            req.onsuccess = () => {
              const db = req.result;
              try {
                const tx = db.transaction('observations', 'readonly');
                const store = tx.objectStore('observations');
                const countReq = store.count();
                countReq.onsuccess = () => {
                  resolve(countReq.result);
                  db.close();
                };
                countReq.onerror = () => {
                  resolve(0);
                  db.close();
                };
              } catch {
                resolve(0);
                db.close();
              }
            };
            req.onerror = () => resolve(0);
          });
        });
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0);

  // Wait for selectedProjectId to be persisted to localStorage
  // (HomeScreen auto-selects first project and syncs to Zustand persist store async)
  const readSelectedProjectId = () =>
    page.evaluate(() => {
      const raw = localStorage.getItem('comapeo-project');
      if (!raw) return null;
      try {
        return JSON.parse(raw).state?.selectedProjectId ?? null;
      } catch {
        return null;
      }
    });

  await expect.poll(readSelectedProjectId, { timeout: 10_000 }).not.toBeNull();

  const projectLocalId = await readSelectedProjectId();
  if (!projectLocalId) {
    throw new Error('selectedProjectId not persisted after poll');
  }
  return projectLocalId;
}

// ---------------------------------------------------------------------------
// Critical User Flow E2E Tests
// ---------------------------------------------------------------------------

test.describe('Critical User Flows', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockServer(page);
  });

  // -------------------------------------------------------------------------
  // Flow 1: Home → Data → Observations tab
  // -------------------------------------------------------------------------
  test('user can navigate from home to data observations tab', async ({
    page,
  }) => {
    await seedProjectWithObservations(page, 'Test Project');

    // Navigate to /data via the nav link
    await page.getByRole('link', { name: 'Data' }).click();

    // Data heading visible
    await expect(
      page.getByRole('heading', { level: 1, name: 'Data' }),
    ).toBeVisible();

    // Observations tab is visible
    await expect(
      page.getByRole('tab', { name: /observations/i }),
    ).toBeVisible();

    // At least one observation card link visible
    await expect(
      page.locator('a[href^="/data/observations/"]').first(),
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Flow 2: Data → Observations → Observation Detail
  // -------------------------------------------------------------------------
  test('user can navigate from data to observation detail', async ({
    page,
  }) => {
    const projectLocalId = await seedProjectWithObservations(
      page,
      'Test Project',
    );

    // Navigate to /data via the nav link
    await page.getByRole('link', { name: 'Data' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Data' }),
    ).toBeVisible();

    // Read the first observation's localId from IndexedDB
    const observationLocalId = await page.evaluate(
      (projectId) =>
        new Promise<string | null>((resolve, reject) => {
          const req = indexedDB.open('comapeo-cloud-app');
          req.onsuccess = () => {
            const db = req.result;
            try {
              const tx = db.transaction('observations', 'readonly');
              const idx = tx
                .objectStore('observations')
                .index('projectLocalId');
              const getReq = idx.getAll(projectId);
              getReq.onsuccess = () => {
                const first = getReq.result?.[0];
                resolve(first?.localId ?? null);
                db.close();
              };
              getReq.onerror = () => {
                db.close();
                reject(getReq.error);
              };
            } catch (err) {
              db.close();
              reject(err);
            }
          };
          req.onerror = () => reject(req.error);
        }),
      projectLocalId,
    );
    expect(observationLocalId).not.toBeNull();

    // Click the first observation card
    await page.locator('a[href^="/data/observations/"]').first().click();

    // Assert URL matches the observation detail route
    await expect(page).toHaveURL(
      new RegExp(`/data/observations/${observationLocalId}`),
    );

    // Observation detail renders with h1 heading
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // "Back to Data" link visible
    await expect(
      page.getByRole('link', { name: /back to data/i }),
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Flow 3: Data → Alerts tab → Add Alert
  // -------------------------------------------------------------------------
  test('user can navigate to create alert form', async ({ page }) => {
    await seedProjectWithObservations(page, 'Test Project');

    // Navigate to /data via the nav link
    await page.getByRole('link', { name: 'Data' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Data' }),
    ).toBeVisible();

    // Click the Alerts tab
    await page.getByRole('tab', { name: /alerts/i }).click();

    // "No alerts yet" is visible
    await expect(page.getByText(/no alerts yet/i)).toBeVisible();

    // Click "Add Alert" link
    await page.getByRole('link', { name: /add alert/i }).click();

    // Create Alert screen renders
    await expect(
      page.getByRole('heading', { level: 1, name: /create alert/i }),
    ).toBeVisible();
    await expect(page.locator('#alert-geometry')).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Flow 4: 404 Page
  // -------------------------------------------------------------------------
  test('non-existent route shows 404 page', async ({ page }) => {
    await page.goto('/nonexistent-page');
    await page.waitForLoadState('domcontentloaded');

    // Should show 404 heading
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible({
      timeout: 5_000,
    });

    // "Page not found" sub-heading
    await expect(
      page.getByRole('heading', { name: /page not found/i }),
    ).toBeVisible();

    // "Go to Home" button inside a Link
    await expect(
      page.getByRole('button', { name: /go to home/i }),
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Flow 5: Settings screen renders correctly
  // -------------------------------------------------------------------------
  test('settings screen renders correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // Settings heading should be visible
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible({
      timeout: 5_000,
    });

    // Backup section should be visible
    await expect(
      page.getByRole('button', { name: /export backup/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /import backup/i }),
    ).toBeVisible();
  });
});
