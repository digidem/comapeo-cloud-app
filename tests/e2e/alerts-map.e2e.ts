import { expect, test } from '@playwright/test';

import { setupMockServer } from './mock-server';
import { seedAlertMapState } from './seed-alert-map';

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
      page.getByRole('link', { name: /Add Alert/i }),
    ).toHaveAttribute('href', '/alerts/new');

    await gridToggle.click();
    await expect(
      page.getByRole('button', { name: /Switch to map view/i }),
    ).toBeVisible();
    await expect(page.getByText('forest-change')).toBeVisible();
    await expect(page.getByText('area-change')).toBeVisible();

    const preferences = await page.evaluate(() => ({
      alerts: localStorage.getItem('alert-view-mode-preference'),
      data: localStorage.getItem('view-mode-preference'),
    }));
    expect(preferences.alerts).toContain('grid');
    expect(preferences.data).toContain('map');
  });
});
