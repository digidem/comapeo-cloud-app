import { test } from '@playwright/test';

import { setupMockServer } from './mock-server';
import {
  THEME_IDS,
  VIEWPORTS,
  setTheme,
  takeScreenshot,
} from './screenshot-utils';
import type { ThemeId, ViewportName } from './screenshot-utils';

test.describe('Observations - visual screenshots', () => {
  for (const themeId of THEME_IDS) {
    for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
      test(`observations list ${themeId} theme at ${viewportName} viewport`, async ({
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

          // Navigate to Data screen (observations tab)
          await page.goto('/data');
          await page.waitForLoadState('domcontentloaded');

          await takeScreenshot(
            page,
            `observations-list-${themeId}`,
            viewportName as ViewportName,
          );
        } finally {
          await context.close();
        }
      });

      test(`observation detail ${themeId} theme at ${viewportName} viewport`, async ({
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

          // Navigate to observation detail
          await page.goto('/data/observations/obs-1');
          await page.waitForLoadState('domcontentloaded');

          await takeScreenshot(
            page,
            `observation-detail-${themeId}`,
            viewportName as ViewportName,
          );
        } finally {
          await context.close();
        }
      });
    }
  }
});
