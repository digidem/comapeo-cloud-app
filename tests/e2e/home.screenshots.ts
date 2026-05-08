import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { setupMockServer } from './mock-server';
import { VIEWPORTS, takeScreenshot } from './screenshot-utils';
import type { ViewportName } from './screenshot-utils';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GEOJSON_FIXTURE = path.join(
  __dirname,
  '../fixtures/sample-territory.geojson',
);

test.describe('Home screen — visual screenshots', () => {
  // --- 7.5a: Empty state (no projects) ---
  for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    test(`home-empty at ${viewportName}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();

      try {
        await setupMockServer(page);
        await page.goto('/');

        // Wait for stable empty state
        await expect(page.getByText('No projects yet').first()).toBeVisible({
          timeout: 5_000,
        });

        await takeScreenshot(page, 'home-empty', viewportName as ViewportName);
      } finally {
        await context.close();
      }
    });
  }

  // --- 7.5b: Project selected, no coordinates ---
  for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    test(`home-project-empty at ${viewportName}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();

      try {
        await setupMockServer(page);
        await page.goto('/');

        // Create project
        await page
          .getByRole('button', { name: 'Create new project from topbar' })
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
          'home-project-empty',
          viewportName as ViewportName,
        );
      } finally {
        await context.close();
      }
    });
  }

  // --- 7.5c: Project with coverage results ---
  for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    test(`home-with-coverage at ${viewportName}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();

      try {
        await setupMockServer(page);
        await page.goto('/');

        // Create project and import data
        await page
          .getByRole('button', { name: 'Create new project from topbar' })
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
        await expect(observedArea).not.toHaveText('—', { timeout: 30_000 });

        await takeScreenshot(
          page,
          'home-with-coverage',
          viewportName as ViewportName,
        );
      } finally {
        await context.close();
      }
    });
  }
});
