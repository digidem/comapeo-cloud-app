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
  await page.getByRole('button', { name: '+ New Project' }).first().click();
  await page.getByLabel('Project Name').fill(name);
  // Scope to dialog to avoid matching other "Create" text on page
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Create', exact: true })
    .click();
  await expect(page.getByText(name)).toBeVisible({ timeout: 5_000 });
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
  await expect(page.getByText('No projects yet.')).toBeVisible();

  // Create project
  await createProject(page, 'My Territory');

  // Import button appears for selected project
  await expect(page.getByRole('button', { name: 'Import Data' })).toBeVisible();

  // Upload GeoJSON
  await importGeoJson(page);
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

  // Navigate away then back to force re-selection with data in DB
  await page.goto('/settings');
  await page.goto('/');

  // Re-select project
  await page.getByText('Coverage Test').click();

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
// 7.3 — add archive server in settings → ArchiveStatusCard appears on home
// ---------------------------------------------------------------------------

test('7.3 configure archive server in settings → card visible on home screen', async ({
  page,
}) => {
  await setupMockServer(page);

  // Add a server via the Settings screen
  await page.goto('/settings');

  await page.getByLabel('Server URL').fill('http://archive.test');
  await page.getByLabel('Bearer Token').fill('bearer-xyz');
  await page.getByRole('button', { name: 'Add Server' }).click();

  // Confirm server was added to the list
  await expect(page.getByText('archive.test')).toBeVisible({ timeout: 10_000 });

  // Navigate to home
  await page.goto('/');

  // ArchiveStatusCard rendered in sidebar
  await expect(page.getByRole('button', { name: 'Sync Now' })).toBeVisible({
    timeout: 5_000,
  });

  // Trigger sync — button transitions to syncing state
  await page.getByRole('button', { name: 'Sync Now' }).click();
  await expect(page.getByText(/Syncing/)).toBeVisible({ timeout: 10_000 });
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

  // Navigate away and back so calculation runs with imported data
  await page.goto('/settings');
  await page.goto('/');
  await page.getByText('Export Test').click();

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
