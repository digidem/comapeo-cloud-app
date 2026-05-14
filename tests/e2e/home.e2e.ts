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
  await page.getByRole('button', { name: 'Create your first project' }).click();
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

async function importGeoJson(page: import('@playwright/test').Page) {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(GEOJSON_FIXTURE);
  // /\d+ imported,/ ensures we see e.g. "6 imported, 0 skipped" not just any "imported"
  await expect(page.getByText(/\d+ imported,/)).toBeVisible({
    timeout: 10_000,
  });
}

// ---------------------------------------------------------------------------
// 7.1 — empty state → create project → import GeoJSON → success message
// ---------------------------------------------------------------------------

test('7.1 first visit shows empty state then create project and import data', async ({
  page,
}) => {
  await setupMockServer(page);
  await page.goto('/');

  // Empty state
  await expect(page.getByText('No projects yet').first()).toBeVisible();

  // Create project
  await createProject(page, 'My Territory');

  // Import button appears for selected project
  await expect(page.getByRole('button', { name: 'Import Data' })).toBeVisible();

  // Upload GeoJSON
  await importGeoJson(page);
});

// ---------------------------------------------------------------------------
// 7.1b — local project appears in sidebar under "Local" section
// ---------------------------------------------------------------------------

test('7.1b local project appears in sidebar under Local section', async ({
  page,
}) => {
  await setupMockServer(page);
  await page.goto('/');

  // Create a local project (default is "Local (offline)")
  await createProject(page, 'Local Test Project');

  // Sidebar shows "Local" archive section
  await expect(page.getByText('Local').first()).toBeVisible();

  // Project appears under the Local section
  await expect(page.getByText('Local Test Project')).toBeVisible();

  // Import Data button is visible for the local project
  await expect(page.getByRole('button', { name: 'Import Data' })).toBeVisible();
});

// ---------------------------------------------------------------------------
// 7.2 — coverage recalculates when preset changes
// ---------------------------------------------------------------------------

test('7.2 select project with data → calculations appear → preset change recalculates', async ({
  page,
}) => {
  await setupMockServer(page);
  await page.goto('/');

  // Create project and import data
  await createProject(page, 'Coverage Test');
  await importGeoJson(page);

  // Method grid renders; wait for at least one card label
  await expect(page.getByText('Observed Footprint')).toBeVisible({
    timeout: 10_000,
  });

  // Wait for at least one area value to appear (confirms worker completed)
  const observedArea = page
    .locator('[data-method-id="observed"]')
    .getByTestId('method-area-value');
  await expect(observedArea).not.toHaveText('—', { timeout: 30_000 });

  // CalculationSettings appears once first result exists
  await expect(page.getByText('Balanced Comparison')).toBeVisible({
    timeout: 5_000,
  });

  // Use the grid method card for recalc verification — gridCellKm differs
  // between Balanced (5 km) and Observed Footprint (2 km), so area changes.
  const gridArea = page
    .locator('[data-method-id="grid"]')
    .getByTestId('method-area-value');
  await expect(gridArea).not.toHaveText('—', { timeout: 30_000 });
  const initialGridValue = await gridArea.textContent();

  // Open preset dropdown and switch to 'Observed Footprint' (gridCellKm 5→2)
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Observed Footprint' }).click();

  // Params change → worker re-fires; grid area must differ from initial
  await expect(gridArea).not.toHaveText(initialGridValue ?? '—', {
    timeout: 30_000,
  });
});

// ---------------------------------------------------------------------------
// 7.3 — add archive server from sidebar dialog using invite URL
// ---------------------------------------------------------------------------

test('7.3 configure archive server from sidebar → card visible on home screen', async ({
  page,
}) => {
  await setupMockServer(page);
  await page.goto('/');

  // Create a project first so sidebar is visible
  await createProject(page, 'Archive Test');

  // Click the Add Server button in sidebar
  await page.getByRole('button', { name: /add server/i }).click();

  // Dialog appears
  await expect(page.getByRole('dialog')).toBeVisible();

  // Default mode shows Invite URL - fill with a full invite URL
  await page
    .getByLabel('Invite URL')
    .fill('https://app.test/invite?hash=abc&url=http%3A%2F%2Farchive.test');

  // Submit
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^add$/i })
    .click();

  // Dialog closes and server card appears in sidebar
  await expect(page.getByText('http://archive.test')).toBeVisible({
    timeout: 10_000,
  });
});

// ---------------------------------------------------------------------------
// 7.3b — add archive server using advanced mode
// ---------------------------------------------------------------------------

test('7.3b add archive server using advanced mode', async ({ page }) => {
  await setupMockServer(page);
  await page.goto('/');

  // Create a project first so sidebar is visible
  await createProject(page, 'Advanced Archive Test');

  // Click the Add Server button in sidebar
  await page.getByRole('button', { name: /add server/i }).click();

  // Dialog appears
  await expect(page.getByRole('dialog')).toBeVisible();

  // Switch to advanced mode
  await page.getByTestId('advanced-toggle').click();

  // Fill in the form
  await page.getByLabel('Server URL').fill('http://archive-advanced.test');
  await page.getByLabel('Bearer Token').fill('bearer-xyz');

  // Submit
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^add$/i })
    .click();

  // Dialog closes and server card appears in sidebar
  await expect(page.getByText('http://archive-advanced.test')).toBeVisible({
    timeout: 10_000,
  });
});

// ---------------------------------------------------------------------------
// 7.4 — export GeoJSON from method card triggers download
// ---------------------------------------------------------------------------

test('7.4 export GeoJSON from method card triggers browser download', async ({
  page,
}) => {
  await setupMockServer(page);
  await page.goto('/');

  // Set up project with data
  await createProject(page, 'Export Test');
  await importGeoJson(page);

  // Wait for an area value to appear (confirms at least one method completed)
  const observedArea = page
    .locator('[data-method-id="observed"]')
    .getByTestId('method-area-value');
  await expect(observedArea).not.toHaveText('—', { timeout: 30_000 });

  // Export button appears inside method card after result exists
  // Use exact: true to avoid matching project name button text fragments
  const exportBtn = page
    .locator('[data-method-id="observed"]')
    .getByRole('button', { name: 'Export', exact: true });
  await expect(exportBtn).toBeVisible({ timeout: 5_000 });

  // Intercept the programmatic <a download> click as a Playwright download event
  const downloadPromise = page.waitForEvent('download', { timeout: 10_000 });
  await exportBtn.click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.geojson$/);
});

// ---------------------------------------------------------------------------
// 7.5 — network error handling shows error state
// ---------------------------------------------------------------------------

test('7.5 network error on projects endpoint shows error state', async ({
  page,
}) => {
  // Set up mock server but override projects endpoint to fail
  await setupMockServer(page);
  await page.route('**/projects', (route) => route.abort('failed'));

  await page.goto('/');

  // The app should render but the project list should show error or empty state
  // The ErrorBoundary or query error should be visible
  await expect(page.getByText(/error|failed|unable/i).first()).toBeVisible({
    timeout: 10_000,
  });
});

// ---------------------------------------------------------------------------
// 7.6 — server removal from sidebar detail view
// ---------------------------------------------------------------------------

test('7.6 add then remove archive server from sidebar', async ({ page }) => {
  await setupMockServer(page);
  await page.goto('/');

  // Create a project first so sidebar is visible
  await createProject(page, 'Remove Test');

  // Add a server via sidebar dialog (use invite URL mode)
  await page.getByRole('button', { name: /add server/i }).click();
  await page
    .getByLabel('Invite URL')
    .fill('https://app.test/invite?hash=abc&url=http%3A%2F%2Fremovable.test');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^add$/i })
    .click();

  // Server card appears in sidebar
  await expect(page.getByText('http://removable.test')).toBeVisible({
    timeout: 10_000,
  });

  // Click the server card to select it and show detail view
  await page.getByText('http://removable.test').click();

  // Click Remove button in detail view
  await page.getByRole('button', { name: 'Remove' }).first().click();

  // Confirmation dialog appears — click confirm Remove
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Remove' })
    .click();

  // Server should no longer be in the sidebar
  await expect(page.getByText('http://removable.test')).not.toBeVisible({
    timeout: 5_000,
  });
});

// ---------------------------------------------------------------------------
// 7.7 — add archive server from sidebar dialog (invite URL mode)
// ---------------------------------------------------------------------------

test('7.7 add archive server from sidebar dialog', async ({ page }) => {
  await setupMockServer(page);
  await page.goto('/');

  // Create a project first so sidebar is visible
  await createProject(page, 'Sidebar Test');

  // Archive Servers section is always visible
  await expect(page.getByText('Archive Servers')).toBeVisible();

  // Click the Add Server button in sidebar
  await page.getByRole('button', { name: /add server/i }).click();

  // Dialog appears
  await expect(page.getByRole('dialog')).toBeVisible();

  // Default mode shows Invite URL - fill with a full invite URL
  await page
    .getByLabel('Invite URL')
    .fill('https://app.test/invite?hash=abc&url=http%3A%2F%2Farchive.test');

  // Submit
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^add$/i })
    .click();

  // Dialog closes and server card appears in sidebar
  await expect(page.getByText('http://archive.test')).toBeVisible({
    timeout: 10_000,
  });
});
