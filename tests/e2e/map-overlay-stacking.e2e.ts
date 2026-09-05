import { type Page, expect, test } from '@playwright/test';

import { seedAppDatabase } from './app-db';
import { setupMockServer } from './mock-server';
import {
  expectControlUnobscured,
  expectOverlayCoversControlCenter,
  installHighZMapBlocker,
  removeHighZMapBlocker,
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
    test.setTimeout(60_000);

    await prepareMobileMapAuthoring(page);

    const drawBounds = page.getByRole('button', { name: 'Draw bounds' });
    await expectControlUnobscured(drawBounds);
    await drawBounds.click();

    await expect(
      page.getByText('Pan and zoom until the area fits inside the frame', {
        exact: true,
      }),
    ).toBeVisible();
    const drawFrame = page.getByTestId('draw-frame');
    await expect(drawFrame).toBeVisible();

    const cancelDrawing = page.getByRole('button', {
      name: 'Cancel',
      exact: true,
    });
    const cancelDrawBounds = page.getByRole('button', {
      name: 'Cancel drawing',
    });
    const setThisArea = page.getByRole('button', { name: 'Set this area' });

    // The frame scrim is intentionally pointer-transparent in production. Prove
    // it geometrically covers the app-control centers, then make it pointer-active
    // so browser hit-testing proves those controls paint above the scrim rather
    // than clicks merely falling through it.
    const frameOverlay = page.getByTestId('draw-frame-overlay');
    await expectOverlayCoversControlCenter(frameOverlay, cancelDrawBounds);
    await expectOverlayCoversControlCenter(frameOverlay, cancelDrawing);
    await expectOverlayCoversControlCenter(frameOverlay, setThisArea);
    await frameOverlay.evaluate((element) => {
      element.style.pointerEvents = 'auto';
    });
    try {
      await expectControlUnobscured(cancelDrawBounds);
      await expectControlUnobscured(cancelDrawing);
      await expectControlUnobscured(setThisArea);
    } finally {
      await frameOverlay.evaluate((element) => {
        element.style.pointerEvents = 'none';
      });
    }

    const mapAuthoringCanvas = page.getByTestId('map-authoring-canvas');
    await installHighZMapBlocker(mapAuthoringCanvas);
    await expectControlUnobscured(cancelDrawing);
    await expectControlUnobscured(setThisArea);
    await removeHighZMapBlocker(mapAuthoringCanvas);

    // Keep the app's 6-second Undo auto-hide timer from racing the intentionally
    // adversarial hit-testing below. This patch is scoped to this disposable page.
    await page.evaluate(() => {
      const nativeSetTimeout = window.setTimeout.bind(window);
      window.setTimeout = ((handler, timeout, ...args) =>
        nativeSetTimeout(
          handler,
          timeout === 6000 ? 60_000 : timeout,
          ...args,
        )) as typeof window.setTimeout;
    });
    await setThisArea.click();

    const areaUpdatedStatus = page
      .getByRole('status')
      .filter({ hasText: 'Map area updated' });
    await expect(areaUpdatedStatus).toBeVisible();
    const undo = page.getByRole('button', { name: 'Undo' });
    await installHighZMapBlocker(mapAuthoringCanvas);
    await expectControlUnobscured(undo);
    await removeHighZMapBlocker(mapAuthoringCanvas);
    await undo.click();
    // Keep this comfortably below the 6-second auto-hide timer while allowing
    // enough headroom for a slow CI render after the Undo state update.
    await expect(areaUpdatedStatus).toBeHidden({ timeout: 3_000 });

    // Prove Undo restored the actual previous bbox, not only the transient
    // status UI. This fixture has no project observations, so the previous bbox
    // is the canonical default [-75, -12, -45, 8].
    await page.getByRole('button', { name: 'Map settings' }).click();
    const settingsDialog = page.getByRole('dialog', { name: 'Map settings' });
    await expect(settingsDialog.getByLabel('West')).toHaveValue('-75');
    await expect(settingsDialog.getByLabel('South')).toHaveValue('-12');
    await expect(settingsDialog.getByLabel('East')).toHaveValue('-45');
    await expect(settingsDialog.getByLabel('North')).toHaveValue('8');
  });
});
