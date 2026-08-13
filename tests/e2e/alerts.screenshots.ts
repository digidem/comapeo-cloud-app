import { test } from '@playwright/test';

import { setupMockServer } from './mock-server';
import {
  THEME_IDS,
  VIEWPORTS,
  setTheme,
  takeScreenshot,
} from './screenshot-utils';
import type { ThemeId, ViewportName } from './screenshot-utils';
import { seedAlertMapState } from './seed-alert-map';

test.describe('Alerts - visual screenshots', () => {
  for (const themeId of THEME_IDS) {
    for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
      test(`alerts map ${themeId} theme at ${viewportName} viewport`, async ({
        browser,
      }) => {
        const context = await browser.newContext({
          viewport,
          reducedMotion: 'reduce',
        });
        const page = await context.newPage();

        try {
          await setupMockServer(page);
          await page.goto('/');
          await setTheme(page, themeId as ThemeId);
          await seedAlertMapState(page);

          // The seeded local project includes point and polygon alert geometry
          // so bounds, neutral styling, and responsive controls are visible.
          await page.goto('/alerts');
          await page.waitForLoadState('domcontentloaded');
          await page
            .getByRole('button', { name: /Switch to grid view/i })
            .waitFor();

          await takeScreenshot(
            page,
            `alerts-map-${themeId}`,
            viewportName as ViewportName,
          );
        } finally {
          await context.close();
        }
      });

      test(`create alert ${themeId} theme at ${viewportName} viewport`, async ({
        browser,
      }) => {
        const context = await browser.newContext({
          viewport,
          reducedMotion: 'reduce',
        });
        const page = await context.newPage();

        try {
          await setupMockServer(page);
          await page.goto('/');
          await setTheme(page, themeId as ThemeId);

          // Navigate to create alert form
          await page.goto('/alerts/new');
          await page.waitForLoadState('domcontentloaded');

          await takeScreenshot(
            page,
            `create-alert-${themeId}`,
            viewportName as ViewportName,
          );
        } finally {
          await context.close();
        }
      });

      test(`alert detail ${themeId} theme at ${viewportName} viewport`, async ({
        browser,
      }) => {
        const context = await browser.newContext({
          viewport,
          reducedMotion: 'reduce',
        });
        const page = await context.newPage();

        try {
          await setupMockServer(page);
          await page.goto('/');
          await setTheme(page, themeId as ThemeId);

          // Navigate to alert detail
          await page.goto('/alerts/alert-1');
          await page.waitForLoadState('domcontentloaded');

          await takeScreenshot(
            page,
            `alert-detail-${themeId}`,
            viewportName as ViewportName,
          );
        } finally {
          await context.close();
        }
      });
    }
  }
});
