import { expect, test } from '@playwright/test';

import { setupMockServer } from './mock-server';

test.describe('Direct archive connection', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockServer(page);
  });

  test('loads synced projects without a manual refresh', async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Exercise the Home intro CTA specifically. It should open the shared
    // layout-owned dialog so Home render-state changes cannot interrupt onboarding.
    await page
      .getByRole('main')
      .getByRole('button', { name: 'Add server' })
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.getByTestId('advanced-toggle').click();
    await page.getByLabel('Server URL').fill('https://archive.example.com');
    await page.getByLabel('Bearer Token').fill('x');
    await dialog.getByRole('button', { name: /^add$/i }).click();

    // Regression guard for #250: persisting the first server changes Home from
    // its intro branch to the dashboard branch. That transition must not remount
    // the in-flight dialog before onboarding reaches its success state.
    await expect(page.getByText('Connecting to archive...')).toBeVisible();
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    // The synced archive data should be visible immediately without page.reload().
    // Assert against a stable project-row contract instead of fixture display text
    // or whichever Home coverage branch happens to render first.
    await expect(page.getByTestId('archive-project-row').first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
