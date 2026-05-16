import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { setupMockServer } from './mock-server';
import {
  THEME_IDS,
  VIEWPORTS,
  setTheme,
  takeScreenshot,
} from './screenshot-utils';
import type { ThemeId, ViewportName } from './screenshot-utils';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GEOJSON_FIXTURE = path.join(
  __dirname,
  '../fixtures/sample-territory.geojson',
);

test.describe('Home screen — visual screenshots', () => {
  for (const themeId of THEME_IDS) {
    // --- 7.5a: Empty state (no projects) ---
    for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
      test(`home-empty ${themeId} at ${viewportName}`, async ({ browser }) => {
        const context = await browser.newContext({
          viewport,
          reducedMotion: 'reduce',
        });
        const page = await context.newPage();

        try {
          await setupMockServer(page);
          await page.goto('/');
          await setTheme(page, themeId as ThemeId);

          // Wait for stable empty state
          await expect(page.getByText('No projects yet').first()).toBeVisible({
            timeout: 5_000,
          });

          await takeScreenshot(
            page,
            `home-empty-${themeId}`,
            viewportName as ViewportName,
          );
        } finally {
          await context.close();
        }
      });
    }

    // --- 7.5b: Project selected, no coordinates ---
    for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
      test(`home-project-empty ${themeId} at ${viewportName}`, async ({
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

          // Wait for coverage to settle — no points → "No mappable coordinates found"
          await expect(
            page.getByText('No mappable coordinates found'),
          ).toBeVisible({ timeout: 15_000 });

          await takeScreenshot(
            page,
            `home-project-empty-${themeId}`,
            viewportName as ViewportName,
          );
        } finally {
          await context.close();
        }
      });
    }

    // --- 7.5c: Project with coverage results ---
    // TODO: The coverage calculation web worker (useProjectCoverage) does not
    // produce results in Playwright's browser context within the timeout. The
    // GeoJSON import succeeds (observations are written to IndexedDB) but the
    // web worker that computes polygon area coverage never completes. Re-enable
    // once the coverage worker is testable in Playwright (e.g. by mocking the
    // worker or extracting the calculation to a testable function).
    test.describe.skip('home-with-coverage', () => {
      for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
        test(`home-with-coverage ${themeId} at ${viewportName}`, async ({
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

            // Create project and import data
            await page
              .getByRole('button', { name: 'Create your first project' })
              .first()
              .click();
            await page.getByLabel('Project Name').fill('Territory Alpha');
            await page
              .getByRole('dialog')
              .getByRole('button', { name: 'Create', exact: true })
              .click();
            await expect(
              page.getByRole('heading', { name: 'Territory Alpha' }),
            ).toBeVisible({ timeout: 5_000 });

            const fileInput = page.locator('input[type="file"]');
            await fileInput.setInputFiles(GEOJSON_FIXTURE);

            // Wait for at least one method to show a real area value
            const observedArea = page
              .locator('[data-method-id="observed"]')
              .getByTestId('method-area-value');
            await expect(observedArea).not.toHaveText('—', {
              timeout: 30_000,
            });

            await takeScreenshot(
              page,
              `home-with-coverage-${themeId}`,
              viewportName as ViewportName,
            );
          } finally {
            await context.close();
          }
        });
      }
    });
  }
});
