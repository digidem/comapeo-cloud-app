import { test } from '@playwright/test';

import { setupMockServer } from './mock-server';
import {
  THEME_IDS,
  VIEWPORTS,
  setTheme,
  takeScreenshot,
} from './screenshot-utils';
import type { ThemeId, ViewportName } from './screenshot-utils';

test.describe('App - visual screenshots', () => {
  for (const themeId of THEME_IDS) {
    for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
      test(`home page ${themeId} theme at ${viewportName} viewport`, async ({
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

          await takeScreenshot(
            page,
            `home-${themeId}`,
            viewportName as ViewportName,
          );
        } finally {
          await context.close();
        }
      });
    }
  }
});
