import { type Page, expect, test } from '@playwright/test';

import { seedAppDatabase } from './app-db';
import { setupMockServer } from './mock-server';
import {
  expectControlUnobscured,
  installHighZMapBlocker,
} from './stacking-utils';

const PROJECT_ID = 'map-overlay-stacking-project';

async function prepareMobileMapAuthoring(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupMockServer(page);
  await page.goto('/map');
  await page.waitForLoadState('domcontentloaded');

  const now = '2026-09-04T12:00:00.000Z';
  await seedAppDatabase(page, {
    projects: [
      {
        localId: PROJECT_ID,
        sourceType: 'local',
        sourceId: 'local',
        name: 'Map Overlay Stacking Project',
        createdAt: now,
        updatedAt: now,
        dirtyLocal: false,
        deleted: false,
      },
    ],
  });

  await page.evaluate((projectId) => {
    localStorage.setItem(
      'comapeo-project',
      JSON.stringify({
        state: { selectedProjectId: projectId, selectedServerId: null },
        version: 0,
      }),
    );
  }, PROJECT_ID);

  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Map authoring canvas' }),
  ).toBeVisible({ timeout: 10_000 });
}

test.describe('Mobile map authoring overlay stacking', () => {
  test('draw controls remain above the map and confirm/undo stay interactive', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'MapLibre mobile hit-testing requires WebGL in this Playwright environment.',
    );

    await prepareMobileMapAuthoring(page);

    const drawBounds = page.getByRole('button', { name: 'Draw bounds' });
    await expectControlUnobscured(drawBounds);
    await drawBounds.click();
    await installHighZMapBlocker(page.getByTestId('map-authoring-canvas'));

    await expect(
      page.getByText('Pan and zoom until the area fits inside the frame', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByTestId('draw-frame')).toBeVisible();

    const cancelDrawing = page.getByRole('button', {
      name: 'Cancel',
      exact: true,
    });
    await expectControlUnobscured(cancelDrawing);

    const setThisArea = page.getByRole('button', { name: 'Set this area' });
    await expectControlUnobscured(setThisArea);
    await setThisArea.click();

    await expect(page.getByRole('status')).toContainText('Map area updated');
    const undo = page.getByRole('button', { name: 'Undo' });
    await expectControlUnobscured(undo);
    await undo.click();
    await expect(page.getByRole('status')).toHaveCount(0);

    await expectControlUnobscured(
      page.getByRole('button', { name: 'Draw bounds' }),
    );
  });
});
