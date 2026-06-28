import { expect, test } from '@playwright/test';

import { setupMockServer } from './mock-server';
import { VIEWPORTS, takeScreenshot } from './screenshot-utils';

const MOBILE = VIEWPORTS.mobile;

/**
 * Create a project via the UI so IndexedDB is populated and the project
 * store has a valid selectedProjectId. This is the same approach used by
 * home.screenshots.ts — the app generates localId via IndexedDB which
 * cannot be set via localStorage alone.
 */
async function createProjectViaUI(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.getByRole('button', { name: 'Create project' }).first().click();
  await page.getByLabel('Project Name').fill('Test Project 1');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Create', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Test Project 1' }),
  ).toBeVisible({ timeout: 5_000 });
}

/**
 * Set dark mode via the theme store's persistence mechanism, then reload.
 * The theme store (src/stores/theme-store.ts) stores mode in localStorage
 * key 'comapeo-theme-mode' and applies 'data-theme' attribute on <html>.
 */
async function setDarkMode(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.evaluate(() => {
    localStorage.setItem('comapeo-theme-mode', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('dark');
  });
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
}

test.describe('Mobile audit screenshots', () => {
  // ---------------------------------------------------------------------------
  // Light theme screenshots
  // ---------------------------------------------------------------------------

  test('mobile-login light', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: MOBILE,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    try {
      await setupMockServer(page);
      await page.goto('/login');
      await page.waitForLoadState('domcontentloaded');
      await takeScreenshot(page, 'mobile-login', 'mobile');
    } finally {
      await context.close();
    }
  });

  test('mobile-home-empty light', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: MOBILE,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    try {
      await setupMockServer(page);
      await page.goto('/');
      await expect(
        page.getByText('Welcome to CoMapeo Cloud').first(),
      ).toBeVisible({
        timeout: 5_000,
      });
      await takeScreenshot(page, 'mobile-home-empty', 'mobile');
    } finally {
      await context.close();
    }
  });

  test('mobile-home-project light', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: MOBILE,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    try {
      await setupMockServer(page);
      await createProjectViaUI(page);
      await takeScreenshot(page, 'mobile-home-project', 'mobile');
    } finally {
      await context.close();
    }
  });

  test('mobile-data-observations light', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: MOBILE,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    try {
      await setupMockServer(page);
      await createProjectViaUI(page);
      await page.goto('/data');
      await page.waitForLoadState('domcontentloaded');
      // Wait for observations tab to render
      await expect(page.getByRole('tab', { name: /Observations/ })).toBeVisible(
        { timeout: 5_000 },
      );
      await takeScreenshot(page, 'mobile-data-observations', 'mobile');
    } finally {
      await context.close();
    }
  });

  test('mobile-data-alerts light', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: MOBILE,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    try {
      await setupMockServer(page);
      await createProjectViaUI(page);
      await page.goto('/data');
      await page.waitForLoadState('domcontentloaded');
      // Switch to alerts tab
      await page.getByRole('tab', { name: /Alerts/ }).click();
      await expect(page.getByText('Alert').first()).toBeVisible({
        timeout: 5_000,
      });
      await takeScreenshot(page, 'mobile-data-alerts', 'mobile');
    } finally {
      await context.close();
    }
  });

  test('mobile-observation-detail light', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: MOBILE,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    try {
      await setupMockServer(page);
      await createProjectViaUI(page);
      // Navigate directly to an observation detail URL.
      // Observations are only in IndexedDB after sync, so the detail page
      // will show a "not found" state — but we still capture the layout.
      await page.goto('/data/observations/nonexistent-id');
      await page.waitForLoadState('domcontentloaded');
      await takeScreenshot(page, 'mobile-observation-detail', 'mobile');
    } finally {
      await context.close();
    }
  });

  test('mobile-alert-detail light', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: MOBILE,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    try {
      await setupMockServer(page);
      await createProjectViaUI(page);
      await page.goto('/data');
      await page.waitForLoadState('domcontentloaded');
      // Switch to alerts tab and click first alert
      await page.getByRole('tab', { name: /Alerts/ }).click();
      await expect(page.getByText('Alert').first()).toBeVisible({
        timeout: 5_000,
      });
      await page.getByText('Alert').first().click();
      await page.waitForLoadState('domcontentloaded');
      await takeScreenshot(page, 'mobile-alert-detail', 'mobile');
    } finally {
      await context.close();
    }
  });

  test('mobile-create-alert light', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: MOBILE,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    try {
      await setupMockServer(page);
      await createProjectViaUI(page);
      await page.goto('/alerts/new');
      await page.waitForLoadState('domcontentloaded');
      await takeScreenshot(page, 'mobile-create-alert', 'mobile');
    } finally {
      await context.close();
    }
  });

  test('mobile-settings light', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: MOBILE,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    try {
      await setupMockServer(page);
      await createProjectViaUI(page);
      await page.goto('/settings');
      await page.waitForLoadState('domcontentloaded');
      await takeScreenshot(page, 'mobile-settings', 'mobile');
    } finally {
      await context.close();
    }
  });

  test('mobile-invite light', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: MOBILE,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    try {
      await setupMockServer(page);
      await page.goto('/invite');
      await page.waitForLoadState('domcontentloaded');
      await takeScreenshot(page, 'mobile-invite', 'mobile');
    } finally {
      await context.close();
    }
  });

  test('mobile-not-found light', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: MOBILE,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    try {
      await setupMockServer(page);
      await page.goto('/nonexistent-page');
      await page.waitForLoadState('domcontentloaded');
      await takeScreenshot(page, 'mobile-not-found', 'mobile');
    } finally {
      await context.close();
    }
  });

  test('mobile-menu-closed light', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: MOBILE,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    try {
      await setupMockServer(page);
      await createProjectViaUI(page);
      await takeScreenshot(page, 'mobile-menu-closed', 'mobile');
    } finally {
      await context.close();
    }
  });

  test('mobile-menu-open light', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: MOBILE,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    try {
      await setupMockServer(page);
      await createProjectViaUI(page);
      // Open the mobile menu
      await page.getByRole('button', { name: /open menu/i }).click();
      // Wait for drawer to be visible
      await expect(
        page.getByRole('button', { name: /close menu/i }),
      ).toBeVisible({ timeout: 3_000 });
      await takeScreenshot(page, 'mobile-menu-open', 'mobile');
    } finally {
      await context.close();
    }
  });

  // ---------------------------------------------------------------------------
  // Dark mode screenshots (key screens only)
  // ---------------------------------------------------------------------------

  test('mobile-home-empty dark', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: MOBILE,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    try {
      await setupMockServer(page);
      await page.goto('/');
      await setDarkMode(page);
      await expect(
        page.getByText('Welcome to CoMapeo Cloud').first(),
      ).toBeVisible({
        timeout: 5_000,
      });
      await takeScreenshot(page, 'mobile-home-empty-dark', 'mobile');
    } finally {
      await context.close();
    }
  });

  test('mobile-data-observations dark', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: MOBILE,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    try {
      await setupMockServer(page);
      await createProjectViaUI(page);
      await page.goto('/data');
      await page.waitForLoadState('domcontentloaded');
      await setDarkMode(page);
      await expect(page.getByRole('tab', { name: /Observations/ })).toBeVisible(
        { timeout: 5_000 },
      );
      await takeScreenshot(page, 'mobile-data-observations-dark', 'mobile');
    } finally {
      await context.close();
    }
  });

  test('mobile-settings dark', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: MOBILE,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    try {
      await setupMockServer(page);
      await createProjectViaUI(page);
      await page.goto('/settings');
      await page.waitForLoadState('domcontentloaded');
      await setDarkMode(page);
      await takeScreenshot(page, 'mobile-settings-dark', 'mobile');
    } finally {
      await context.close();
    }
  });

  test('mobile-menu-open dark', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: MOBILE,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    try {
      await setupMockServer(page);
      await createProjectViaUI(page);
      await setDarkMode(page);
      // Open the mobile menu
      await page.getByRole('button', { name: /open menu/i }).click();
      await expect(
        page.getByRole('button', { name: /close menu/i }),
      ).toBeVisible({ timeout: 3_000 });
      await takeScreenshot(page, 'mobile-menu-open-dark', 'mobile');
    } finally {
      await context.close();
    }
  });
});
