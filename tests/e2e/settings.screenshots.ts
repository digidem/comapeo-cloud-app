import { test } from '@playwright/test';

import { setupMockServer } from './mock-server';
import {
  THEME_IDS,
  VIEWPORTS,
  setTheme,
  takeScreenshot,
} from './screenshot-utils';
import type { ThemeId, ViewportName } from './screenshot-utils';

const BROAD_INVITE_TOKEN = 'e2e-archive-visual-token';

function makeMockEncryptedInviteCode(payload: {
  url: string;
  token: string;
}): string {
  return `mock-encrypted-code-${Buffer.from(JSON.stringify(payload)).toString(
    'base64url',
  )}`;
}

test.describe('Settings - visual screenshots', () => {
  for (const themeId of THEME_IDS) {
    for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
      test(`settings ${themeId} theme at ${viewportName} viewport`, async ({
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

          // Navigate to settings
          await page.goto('/settings');
          await page.waitForLoadState('domcontentloaded');

          await takeScreenshot(
            page,
            `settings-${themeId}`,
            viewportName as ViewportName,
          );

          const broadInviteCode = makeMockEncryptedInviteCode({
            url: 'https://archive.example.com',
            token: BROAD_INVITE_TOKEN,
          });

          await page.goto(
            `/invite?code=${encodeURIComponent(broadInviteCode)}`,
          );
          await page.getByText('Connected!').waitFor();

          await page.goto('/settings');
          await page.getByLabel('Specific project').click();
          await page
            .getByRole('combobox', { name: 'Specific project' })
            .selectOption({ label: 'Test Project 1' });

          await takeScreenshot(
            page,
            `settings-project-scoped-${themeId}`,
            viewportName as ViewportName,
          );
        } finally {
          await context.close();
        }
      });
    }
  }
});
