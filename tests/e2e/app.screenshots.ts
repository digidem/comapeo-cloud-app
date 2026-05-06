import { test } from '@playwright/test';

import { setupMockServer } from './mock-server';
import { VIEWPORTS, takeScreenshot } from './screenshot-utils';
import type { ViewportName } from './screenshot-utils';

test.describe('App - visual screenshots', () => {
  for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    test(`home page at ${viewportName} viewport`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();

      try {
        await setupMockServer(page);
        await page.goto('/');

        await takeScreenshot(page, 'home', viewportName as ViewportName);
      } finally {
        await context.close();
      }
    });
  }
});
