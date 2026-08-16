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
    // its intro branch to the dashboard branch. The shared dialog must survive
    // that transition long enough for onboarding to complete and close normally.
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    // The archive is added after ArchiveBrowser mounted, so its accordion starts
    // collapsed. Expand it and prove the synced project is genuinely user-visible
    // immediately without page.reload().
    await page.getByTestId('archive-toggle').first().click();
    await expect(page.getByTestId('archive-project-row').first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
