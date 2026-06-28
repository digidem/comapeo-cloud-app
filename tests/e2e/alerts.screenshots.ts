import { test } from '@playwright/test';

import { setupMockServer } from './mock-server';
import {
  THEME_IDS,
  VIEWPORTS,
  setTheme,
  takeScreenshot,
} from './screenshot-utils';
import type { ThemeId, ViewportName } from './screenshot-utils';

test.describe('Alerts - visual screenshots', () => {
  for (const themeId of THEME_IDS) {
    for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
      test(`alerts list ${themeId} theme at ${viewportName} viewport`, async ({
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

          // Navigate to alerts list (Data screen, alerts tab)
          await page.goto('/data');
          await page.waitForLoadState('domcontentloaded');

          await takeScreenshot(
            page,
            `alerts-list-${themeId}`,
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
