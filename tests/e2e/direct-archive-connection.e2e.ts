import { expect, test } from '@playwright/test';

import { setupMockServer } from './mock-server';

test.describe('Direct archive connection', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockServer(page);
  });

  test('loads synced projects without a manual refresh', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Exercise the Home intro CTA specifically. The sidebar has a separate Add
    // Server entry point whose dialog is owned by AuthenticatedLayout and does
    // not reproduce the first-server Home transition from #250.
    await page
      .getByRole('main')
      .getByRole('button', { name: 'Add server' })
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.getByTestId('advanced-toggle').click();
    await page.getByLabel('Server URL').fill('https://archive.example.com');
    await dialog.locator('input[type="password"]').fill('x');
    await dialog.getByRole('button', { name: /^add$/i }).click();

    // Regression guard for #250: persisting the first server changes Home from
    // its intro branch to the dashboard branch. That transition must not remount
    // the in-flight dialog before onboarding reaches its success state.
    await expect(page.getByText('Connecting to archive...')).toBeVisible();
    await expect(page.getByText('Connected!')).toBeVisible({ timeout: 15_000 });
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    // The fixture projects share one sync timestamp, so Home may auto-select any
    // of them. Assert that whichever project is selected is rendered immediately
    // without page.reload().
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: /^(Test Project 1|Another Project|Untitled Project)$/,
      }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
