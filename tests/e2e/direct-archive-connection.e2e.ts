import { expect, test } from '@playwright/test';

import { setupMockServer } from './mock-server';

test.describe('Direct archive connection', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockServer(page);
  });

  test('loads synced projects without a manual refresh', async ({ page }) => {
    test.setTimeout(60_000);

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
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    // The synced archive data should be visible immediately without page.reload().
    // Use the archive browser project label so this assertion does not depend on
    // the coverage worker choosing a particular Home content branch.
    await expect(page.getByText('Test Project 1').first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
