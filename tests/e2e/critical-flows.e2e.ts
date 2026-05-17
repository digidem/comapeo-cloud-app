import { expect, test } from '@playwright/test';

import { setupMockServer } from './mock-server';

// ---------------------------------------------------------------------------
// Critical User Flow E2E Tests
// ---------------------------------------------------------------------------

// Helper to navigate to the app and wait for it to load
async function gotoApp(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
}

// TODO: rewrite for the post-refactor routing (no more /dashboard, /projects;
// routes are /, /data, /data/observations/$id, /data/alerts/$id, /settings).
// The current bodies still reference the old route tree and the conditional
// isVisible() guards mask their failures, so the suite is skipped until it
// is rebuilt against the new IA.
test.describe.skip('Critical User Flows', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockServer(page);
  });

  // -------------------------------------------------------------------------
  // Flow 1: Dashboard → Projects → Project Detail
  // -------------------------------------------------------------------------
  test('user can navigate from dashboard to project detail', async ({
    page,
  }) => {
    await gotoApp(page);

    // Dashboard should be visible (it's the default route or home)
    // Navigate to projects via nav
    const projectsLink = page.getByRole('link', { name: /projects/i }).first();
    if (await projectsLink.isVisible()) {
      await projectsLink.click();
    } else {
      await page.goto('/projects');
    }

    // Projects list should render
    await expect(page.getByRole('heading', { name: /projects/i })).toBeVisible({
      timeout: 5_000,
    });

    // Click on a project card if available
    const projectCard = page.getByRole('link', { name: /project/i }).first();
    if (await projectCard.isVisible()) {
      await projectCard.click();

      // Project detail should render with tabs
      await expect(
        page.getByRole('tab', { name: /observations/i }),
      ).toBeVisible({ timeout: 5_000 });
      await expect(page.getByRole('tab', { name: /alerts/i })).toBeVisible();
    }
  });

  // -------------------------------------------------------------------------
  // Flow 2: Project → Observations → Observation Detail
  // -------------------------------------------------------------------------
  test('user can navigate from project to observations list', async ({
    page,
  }) => {
    await gotoApp(page);

    // Navigate to projects
    await page.goto('/projects');
    await expect(page.getByRole('heading', { name: /projects/i })).toBeVisible({
      timeout: 5_000,
    });

    // Click on a project if available
    const projectCard = page.getByRole('link', { name: /project/i }).first();
    if (await projectCard.isVisible()) {
      await projectCard.click();

      // Click observations tab
      const observationsTab = page.getByRole('tab', {
        name: /observations/i,
      });
      if (await observationsTab.isVisible()) {
        await observationsTab.click();
      }
    }
  });

  // -------------------------------------------------------------------------
  // Flow 3: Project → Alerts → Create Alert
  // -------------------------------------------------------------------------
  test('user can navigate to create alert form', async ({ page }) => {
    await gotoApp(page);

    // Navigate to projects
    await page.goto('/projects');
    await expect(page.getByRole('heading', { name: /projects/i })).toBeVisible({
      timeout: 5_000,
    });

    // Click on a project if available
    const projectCard = page.getByRole('link', { name: /project/i }).first();
    if (await projectCard.isVisible()) {
      await projectCard.click();

      // Click alerts tab
      const alertsTab = page.getByRole('tab', { name: /alerts/i });
      if (await alertsTab.isVisible()) {
        await alertsTab.click();
      }
    }
  });

  // -------------------------------------------------------------------------
  // Flow 4: 404 Page
  // -------------------------------------------------------------------------
  test('non-existent route shows 404 page', async ({ page }) => {
    await setupMockServer(page);
    await page.goto('/nonexistent-page');
    await page.waitForLoadState('networkidle');

    // Should show 404 page
    await expect(page.getByRole('heading', { name: /not found/i })).toBeVisible(
      { timeout: 5_000 },
    );

    // Should have a link back to home
    const homeLink = page.getByRole('link', { name: /home/i });
    await expect(homeLink).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Flow 5: Settings screen loads
  // -------------------------------------------------------------------------
  test('settings screen renders correctly', async ({ page }) => {
    await gotoApp(page);

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

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

  // -------------------------------------------------------------------------
  // Flow 6: Dashboard loads
  // -------------------------------------------------------------------------
  test('dashboard screen renders correctly', async ({ page }) => {
    await gotoApp(page);

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Dashboard heading should be visible
    await expect(
      page.getByRole('heading', { name: /dashboard|welcome/i }),
    ).toBeVisible({ timeout: 5_000 });
  });
});
