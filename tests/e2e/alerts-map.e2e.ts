import { expect, test } from '@playwright/test';

import { setupMockServer } from './mock-server';
import { seedAlertMapState } from './seed-alert-map';
import {
  expectControlUnobscured,
  installHighZMapBlocker,
} from './stacking-utils';

test.describe('Alerts map and grid', () => {
  test('defaults to map and preserves map/grid preference independently', async ({
    page,
  }) => {
    await setupMockServer(page);
    await seedAlertMapState(page);
    await page.goto('/alerts');

    const gridToggle = page.getByRole('button', {
      name: /Switch to grid view/i,
    });
    await expect(gridToggle).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Add Alert/i }),
    ).toBeVisible();

    await gridToggle.click();
    await expect(
      page.getByRole('button', { name: /Switch to map view/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Add Alert/i }),
    ).toHaveAttribute('href', '/alerts/new');
    await expect(page.getByText('forest-change')).toBeVisible();
    await expect(page.getByText('area-change')).toBeVisible();

    const preferences = await page.evaluate(() => ({
      alerts: localStorage.getItem('comapeo-alert-view-mode-preference'),
      data: localStorage.getItem('view-mode-preference'),
    }));
    expect(preferences.alerts).toContain('grid');
    expect(preferences.data).toContain('map');
  });

  test('mobile sheet exposes map selection and returns to the form after a map tap', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'MapLibre point selection requires WebGL (unavailable in Playwright firefox/webkit).',
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await setupMockServer(page);
    await seedAlertMapState(page);
    await page.goto('/alerts');

    await page.getByRole('button', { name: /Add Alert/i }).click();
    const dialog = page.getByRole('dialog', { name: /Create Alert/i });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: 'Select on map' }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByText('Tap the map to place the alert point', { exact: true }),
    ).toBeVisible();

    await installHighZMapBlocker(page.getByTestId('map-container'));

    const backToForm = page.getByRole('button', { name: 'Back to form' });
    await expectControlUnobscured(backToForm);
    await backToForm.click();
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: 'Select on map' }).click();
    await expect(dialog).toBeHidden();
    await expectControlUnobscured(
      page.getByRole('button', { name: 'Back to form' }),
    );

    await page.getByTestId('synthetic-maplibre-high-z').evaluate((blocker) => {
      blocker.remove();
    });

    const mapCanvas = page.locator('.maplibregl-canvas').first();
    await expect(mapCanvas).toBeVisible();
    await mapCanvas.click({ position: { x: 120, y: 140 } });

    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Change location on map' }),
    ).toBeVisible();
  });

  test('creates a point alert inline from the map and keeps the Alerts view', async ({
    page,
  }) => {
    await setupMockServer(page);
    await seedAlertMapState(page);
    await page.goto('/alerts');

    await page.getByRole('button', { name: /Add Alert/i }).press('Enter');
    const dialog = page.getByRole('dialog', { name: /Create Alert/i });
    await expect(dialog).toBeVisible();

    await expect(page.locator('.maplibregl-canvas').first()).toBeVisible();

    const longitude = dialog.getByLabel('Longitude');
    const latitude = dialog.getByLabel('Latitude');
    await longitude.fill('-51.25');
    await latitude.fill('-3.75');
    await dialog.getByRole('button', { name: 'Add point' }).press('Enter');
    await expect(longitude).toHaveValue('-51.25');
    await expect(latitude).toHaveValue('-3.75');

    await dialog.getByLabel('Detection Date Start').fill('2026-08-12');
    await dialog.getByLabel('Detection Date End').fill('2026-08-12');
    await dialog.getByLabel('Source ID').fill('e2e-inline');
    await dialog.getByLabel('Alert Type').fill('inline-e2e');
    await dialog.getByRole('button', { name: 'Create' }).press('Enter');

    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/alerts$/);

    await page
      .getByRole('button', { name: /Switch to grid view/i })
      .press('Enter');
    await expect(page.getByText('inline-e2e')).toBeVisible();
  });
});
