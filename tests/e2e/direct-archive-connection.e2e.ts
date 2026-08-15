import { expect, test } from '@playwright/test';

import { setupMockServer } from './mock-server';

test.describe('Direct archive connection', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockServer(page);
  });

  test('loads synced projects without a manual refresh', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.getByRole('button', { name: 'Add server' }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByTestId('advanced-toggle').click();
    await page.getByLabel('Server URL').fill('https://archive.example.com');
    await page.getByRole('dialog').locator('input[type="password"]').fill('x');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^add$/i })
      .click();

    // Regression guard for #250: adding the first server must not unmount the
    // in-flight connection dialog. It should finish onboarding, close itself,
    // and expose the just-synced archive data without page.reload().
    await expect(page.getByText('Connecting to archive...')).toBeVisible();
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText('Test Project 1').first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
