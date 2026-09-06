import { expect, test } from '@playwright/test';

import { AUTHORED_VECTOR_LAYER_FIXTURE } from '../fixtures/authored-layers';
import { seedAppDatabase } from './app-db';
import { setupMockServer } from './mock-server';
import { VIEWPORTS, takeScreenshot } from './screenshot-utils';

const PROJECT_ID = 'authored-layer-visual-project';
const MAP_ID = 'authored-layer-recovery-map';
const MAP_NAME = 'Recovery map';

async function seedRecoveryMap(page: import('@playwright/test').Page) {
  const now = '2026-09-05T10:00:00.000Z';
  await setupMockServer(page);
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('main')).toBeVisible({ timeout: 30_000 });
  await seedAppDatabase(page, {
    projects: [
      {
        localId: PROJECT_ID,
        sourceType: 'local',
        sourceId: `local:${PROJECT_ID}`,
        name: 'Authored Layers QA',
        activeMapId: null,
        createdAt: now,
        updatedAt: now,
        dirtyLocal: false,
        deleted: false,
      },
    ],
    maps: [
      {
        id: MAP_ID,
        projectLocalId: PROJECT_ID,
        name: MAP_NAME,
        type: 'raster',
        origin: 'authored',
        styleUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        bbox: [-61, -4, -55, 1],
        minZoom: 0,
        maxZoom: 8,
        scheme: 'xyz',
        layers: [
          structuredClone(AUTHORED_VECTOR_LAYER_FIXTURE),
          {
            schemaVersion: 99,
            id: 'future-authored-layer',
            name: 'Future layer',
            visible: true,
            source: { type: 'future' },
            render: { layers: [] },
          },
        ],
        status: 'draft',
        createdAt: now,
        updatedAt: now,
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
  await page.goto('/map');
  await page.waitForLoadState('domcontentloaded');
  await expect(
    page.getByRole('region', { name: 'Map authoring canvas' }),
  ).toBeVisible({ timeout: 30_000 });
}

async function openRecoveryEditor(page: import('@playwright/test').Page) {
  const row = page.getByTestId('saved-map-row').filter({ hasText: MAP_NAME });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Edit layers' }).click();
  await expect(page.getByText('Territory boundary')).toBeVisible();
  await expect(page.getByText('Future layer')).toBeVisible();
  await expect(
    page.getByText(/remove this invalid layer before saving or downloading/i),
  ).toBeVisible();
  await expect(page.getByText(/stored in this browser/i)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Save changes' }),
  ).toBeDisabled();
}

test.describe('authored layer recovery visual QA', () => {
  test('desktop controls, privacy copy, and invalid-layer recovery', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await seedRecoveryMap(page);
    await openRecoveryEditor(page);
    await takeScreenshot(
      page,
      'map-authored-layers-recovery-desktop',
      'desktop',
    );
  });

  test('375x812 controls, privacy copy, and invalid-layer recovery', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await seedRecoveryMap(page);
    await page.getByRole('button', { name: 'Map settings' }).click();
    const settings = page.getByRole('dialog', { name: 'Map settings' });
    const row = settings
      .getByTestId('saved-map-row')
      .filter({ hasText: MAP_NAME });
    await row.getByRole('button', { name: 'Edit layers' }).click();
    await expect(settings.getByText('Territory boundary')).toBeVisible();
    await expect(settings.getByText('Future layer')).toBeVisible();
    await expect(
      settings.getByText(
        /remove this invalid layer before saving or downloading/i,
      ),
    ).toBeVisible();
    await expect(settings.getByText(/stored in this browser/i)).toBeVisible();
    await expect(
      settings.getByRole('button', { name: 'Save changes' }),
    ).toBeDisabled();

    await settings.getByText('Future layer').scrollIntoViewIfNeeded();
    await takeScreenshot(page, 'map-authored-layers-recovery-mobile', 'mobile');

    const downloadBlocked = settings.getByText(
      'Remove every invalid layer before saving or downloading this map.',
    );
    await expect(downloadBlocked).toBeVisible();
    await downloadBlocked.scrollIntoViewIfNeeded();
    await takeScreenshot(
      page,
      'map-authored-layers-download-blocked-mobile',
      'mobile',
    );
  });
});
