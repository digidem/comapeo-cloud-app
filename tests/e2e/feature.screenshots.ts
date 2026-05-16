import { expect, test } from '@playwright/test';
import { projectsFixture } from '@tests/fixtures/projects';

import { setupMockServer } from './mock-server';
import { VIEWPORTS, takeScreenshot } from './screenshot-utils';
import type { ViewportName } from './screenshot-utils';

const DESKTOP_VIEWPORT = VIEWPORTS.desktop;

test.describe('Feature screenshots', () => {
  // --- T1 - ARCHIVE SIDEBAR VIEW ---
  test('archive-sidebar', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: DESKTOP_VIEWPORT,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();

    try {
      await setupMockServer(page);
      await page.goto('/');

      // Create project
      await page
        .getByRole('button', { name: 'Create your first project' })
        .first()
        .click();
      await page.getByLabel('Project Name').fill('Demo Project');
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Create', exact: true })
        .click();
      await expect(
        page.getByRole('heading', { name: 'Demo Project' }),
      ).toBeVisible({ timeout: 5_000 });

      await takeScreenshot(page, 'archive-sidebar', 'desktop' as ViewportName);
    } finally {
      await context.close().catch(() => {});
    }
  });

  // --- T3 - INVITE GENERATION FORM ---
  test('settings-invite-form', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: DESKTOP_VIEWPORT,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();

    try {
      await setupMockServer(page);
      await page.goto('/settings');

      // Wait for the "Remote Archive Invites" section to be visible
      await expect(page.getByText('Remote Archive Invites')).toBeVisible({
        timeout: 5_000,
      });

      await takeScreenshot(
        page,
        'settings-invite-form',
        'desktop' as ViewportName,
      );
    } finally {
      await context.close();
    }
  });

  // --- T3b - BACKUP & RESTORE SECTION ---
  test('settings-backup-restore', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: DESKTOP_VIEWPORT,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();

    try {
      await setupMockServer(page);
      await page.goto('/settings');

      await expect(page.getByText('Backup & Restore')).toBeVisible({
        timeout: 5_000,
      });

      await takeScreenshot(
        page,
        'settings-backup-restore',
        'desktop' as ViewportName,
      );
    } finally {
      await context.close();
    }
  });

  // --- T3c - CLEAR ALL DATA DIALOG ---
  test('settings-clear-data', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: DESKTOP_VIEWPORT,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();

    try {
      await setupMockServer(page);
      await page.goto('/settings');

      // Click the Clear All Data button to open confirmation dialog
      await page.getByRole('button', { name: 'Clear All Data' }).click();

      await expect(page.getByText('Clear All Data?')).toBeVisible({
        timeout: 5_000,
      });

      await takeScreenshot(
        page,
        'settings-clear-data',
        'desktop' as ViewportName,
      );
    } finally {
      await context.close();
    }
  });

  // --- T4 - CREATE DIALOG ---
  test('create-project-dialog', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: DESKTOP_VIEWPORT,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();

    try {
      await setupMockServer(page);
      await page.goto('/');

      // Click "Create your first project" to open the dialog
      await page
        .getByRole('button', { name: 'Create your first project' })
        .first()
        .click();

      // Wait for the dialog to be visible
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

      await takeScreenshot(
        page,
        'create-project-dialog',
        'desktop' as ViewportName,
      );
    } finally {
      await context.close();
    }
  });

  // --- T10 - LANGUAGE SELECTOR DROPDOWN ---
  test('language-selector-open', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: DESKTOP_VIEWPORT,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();

    try {
      await setupMockServer(page);
      await page.goto('/');

      // Click the language selector button (globe icon with locale code)
      await page.getByRole('button', { name: /en|es|pt/i }).click();

      // Wait for dropdown to appear (custom dropdown, not a menu/listbox)
      await expect(page.getByText('English')).toBeVisible({ timeout: 5_000 });

      await takeScreenshot(
        page,
        'language-selector-open',
        'desktop' as ViewportName,
      );
    } finally {
      await context.close();
    }
  });

  // --- T12 - SKELETON LOADING STATE ---
  test('home-skeleton', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: DESKTOP_VIEWPORT,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();

    try {
      await setupMockServer(page);

      // Intercept the projects route with a delay to capture skeleton state
      await page.route('**/projects', async (route) => {
        await new Promise((r) => setTimeout(r, 2000));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(projectsFixture),
        });
      });

      await page.goto('/');

      // Take screenshot immediately while data is still loading
      await takeScreenshot(page, 'home-skeleton', 'desktop' as ViewportName);
    } finally {
      await context.close();
    }
  });
});
