import { type Page, expect, test } from '@playwright/test';

import { MAP_AREA_UNDO_AUTO_HIDE_MS } from '../../src/screens/MapScreen/constants';
import { seedAppDatabase } from './app-db';
import { setupMockServer } from './mock-server';
import {
  expectControlUnobscured,
  expectOverlayCoversControlHitPoints,
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

    const cancelTextButton = page.getByRole('button', {
      name: 'Cancel',
      exact: true,
    });
    const cancelDrawingToggle = page.getByRole('button', {
      name: 'Cancel drawing',
    });
    const setThisArea = page.getByRole('button', { name: 'Set this area' });

    // The frame scrim is intentionally pointer-transparent in production. Prove
    // it geometrically covers the app-control centers, then make it pointer-active
    // so browser hit-testing proves those controls paint above the scrim rather
    // than clicks merely falling through it.
    const frameOverlay = page.getByTestId('draw-frame-overlay');
    await expectOverlayCoversControlHitPoints(
      frameOverlay,
      cancelDrawingToggle,
    );
    await expectOverlayCoversControlHitPoints(frameOverlay, cancelTextButton);
    await expectOverlayCoversControlHitPoints(frameOverlay, setThisArea);
    await frameOverlay.evaluate((element) => {
      element.style.pointerEvents = 'auto';
    });
    try {
      await expectControlUnobscured(cancelDrawingToggle);
      await expectControlUnobscured(cancelTextButton);
      await expectControlUnobscured(setThisArea);
    } finally {
      await frameOverlay.evaluate((element) => {
        element.style.pointerEvents = 'none';
      });
    }

    const mapAuthoringCanvas = page.getByTestId('map-authoring-canvas');
    await installHighZMapBlocker(mapAuthoringCanvas);
    try {
      await expectControlUnobscured(cancelDrawingToggle);
      await expectControlUnobscured(cancelTextButton);
      await expectControlUnobscured(setThisArea);
    } finally {
      await removeHighZMapBlocker(mapAuthoringCanvas);
    }

    // Move the real map before confirming so the test does not depend on the
    // initial viewport differing from DEFAULT_BBOX.
    const mapCanvas = page.locator('.maplibregl-canvas').first();
    const mapBox = await mapCanvas.boundingBox();
    if (!mapBox) throw new Error('Expected visible map canvas to have bounds');
    const centerX = mapBox.x + mapBox.width / 2;
    const centerY = mapBox.y + mapBox.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + 70, centerY + 35, { steps: 5 });
    await page.mouse.up();

    // Keep the Undo auto-hide timer from racing the intentionally adversarial
    // hit-testing below. This patch is scoped to this disposable page and records
    // when the app actually schedules the shared production duration.
    await page.evaluate((undoAutoHideMs) => {
      const nativeSetTimeout = window.setTimeout.bind(window);
      window.setTimeout = ((
        handler: TimerHandler,
        timeout?: number,
        ...args: unknown[]
      ) => {
        const adjustedTimeout = timeout === undoAutoHideMs ? 60_000 : timeout;
        if (timeout === undoAutoHideMs) {
          document.documentElement.dataset.mapOverlayAutoHidePatched = 'true';
        }
        return nativeSetTimeout(handler, adjustedTimeout, ...args);
      }) as typeof window.setTimeout;
    }, MAP_AREA_UNDO_AUTO_HIDE_MS);
    await setThisArea.click();
    await expect(page.locator('html')).toHaveAttribute(
      'data-map-overlay-auto-hide-patched',
      'true',
    );

    const areaUpdatedStatus = page
      .getByRole('status')
      .filter({ hasText: 'Map area updated' });
    await expect(areaUpdatedStatus).toBeVisible();

    // Prove Set this area changed the actual bbox before testing Undo; otherwise
    // a no-op confirm followed by a no-op Undo could still end at the defaults.
    await page.getByRole('button', { name: 'Map settings' }).click();
    const settingsDialog = page.getByRole('dialog', { name: 'Map settings' });
    const changedBbox: string[] = [];
    for (const label of ['West', 'South', 'East', 'North']) {
      changedBbox.push(await settingsDialog.getByLabel(label).inputValue());
    }
    expect(changedBbox).not.toEqual(['-75', '-12', '-45', '8']);
    await settingsDialog
      .getByRole('button', { name: 'Close map settings' })
      .click();
    await expect(settingsDialog).toBeHidden();
    await expect(areaUpdatedStatus).toBeVisible();

    const undo = page.getByRole('button', { name: 'Undo' });
    await installHighZMapBlocker(mapAuthoringCanvas);
    try {
      await expectControlUnobscured(undo);
    } finally {
      await removeHighZMapBlocker(mapAuthoringCanvas);
    }
    await undo.click();
    await expect(areaUpdatedStatus).toBeHidden({ timeout: 3_000 });

    // Prove Undo restored the actual previous bbox, not only the transient
    // status UI. This fixture has no project observations, so the previous bbox
    // is the canonical default [-75, -12, -45, 8].
    await page.getByRole('button', { name: 'Map settings' }).click();
    await expect(settingsDialog.getByLabel('West')).toHaveValue('-75');
    await expect(settingsDialog.getByLabel('South')).toHaveValue('-12');
    await expect(settingsDialog.getByLabel('East')).toHaveValue('-45');
    await expect(settingsDialog.getByLabel('North')).toHaveValue('8');
  });
});
