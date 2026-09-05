import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';

import {
  getAppDatabaseRecordsByIndex,
  getAppDatabaseTableNames,
  seedAppDatabase,
} from './app-db';
import { setupMockServer } from './mock-server';

// ---------------------------------------------------------------------------
// Synthetic tile data
// ---------------------------------------------------------------------------

/** A 1×1 transparent PNG — valid enough for the SMP library to process. */
const TRANSPARENT_1X1_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64',
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SeedMap {
  id: string;
  projectLocalId: string;
  name: string;
  bbox: [number, number, number, number];
  maxZoom: number;
}

/** Seed the app database and Zustand state so /map opens a draft map. */
async function seedMapDownloadTest(
  page: import('@playwright/test').Page,
  map: SeedMap,
): Promise<void> {
  const now = new Date().toISOString();
  await seedAppDatabase(page, {
    projects: [
      {
        localId: map.projectLocalId,
        sourceType: 'local',
        sourceId: 'local:project',
        name: 'E2E Test Project',
        activeMapId: map.id,
        createdAt: now,
        updatedAt: now,
        dirtyLocal: false,
        deleted: false,
      },
    ],
    maps: [
      {
        id: map.id,
        projectLocalId: map.projectLocalId,
        name: map.name,
        type: 'raster',
        styleUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        bbox: map.bbox,
        minZoom: 0,
        maxZoom: map.maxZoom,
        scheme: 'xyz',
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      },
    ],
  });

  // Seed only the persisted project/map selection required by MapScreen.
  await page.evaluate(
    ({ projectLocalId, mapId }) => {
      // Project store — the MapScreen reads selectedProjectId from here
      localStorage.setItem(
        'comapeo-project',
        JSON.stringify({
          state: {
            selectedProjectId: projectLocalId,
            selectedServerId: null,
          },
          version: 0,
        }),
      );

      // Map store — set active project + map so DownloadPanel renders.
      const mapStoreKey = 'comapeo-map';
      const mapSnapshot = JSON.parse(localStorage.getItem(mapStoreKey) ?? '{}');
      localStorage.setItem(
        mapStoreKey,
        JSON.stringify({
          ...mapSnapshot,
          state: {
            ...(mapSnapshot.state ?? {}),
            activeProjectLocalId: projectLocalId,
            activeMapId: mapId,
          },
          version: (mapSnapshot.version ?? 0) + 1,
        }),
      );
    },
    { projectLocalId: map.projectLocalId, mapId: map.id } as Record<
      string,
      unknown
    >,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function prepareMapAuthoring(
  page: import('@playwright/test').Page,
): Promise<void> {
  await setupMockServer(page);
  // Warm the app at its root so the app-owned Dexie schema is created before
  // the deterministic test seed is written. Navigating straight to /map can
  // race Vite/app initialization in a fresh browser context.
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('main')).toBeVisible({ timeout: 30_000 });
  await expect(getAppDatabaseTableNames(page)).resolves.toContain('maps');
  await seedMapDownloadTest(page, {
    id: crypto.randomUUID(),
    projectLocalId: 'geojson-e2e-project',
    name: 'GeoJSON E2E Seed Map',
    bbox: [-61, -4, -59, -2],
    maxZoom: 0,
  });
  await page.goto('/map');
  await page.waitForLoadState('domcontentloaded');
  await expect(
    page.getByRole('region', { name: 'Map authoring canvas' }),
  ).toBeVisible({
    timeout: 30_000,
  });
}

const MIXED_GEOJSON = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'checkpoint' },
      geometry: { type: 'Point', coordinates: [-60, -3] },
    },
    {
      type: 'Feature',
      properties: { name: 'route' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-60, -3],
          [-59.5, -2.5],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'territory' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-61, -4],
            [-59, -4],
            [-59, -2],
            [-61, -4],
          ],
        ],
      },
    },
  ],
});

test.describe('persisted authored GeoJSON layers (E2E)', () => {
  test('desktop file picker adds, hides, shows, and removes an authored layer', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await prepareMapAuthoring(page);

    const input = page.getByLabel('Add GeoJSON layer');
    await input.setInputFiles({
      name: 'mixed-reference.geojson',
      mimeType: 'application/geo+json',
      buffer: Buffer.from(MIXED_GEOJSON),
    });

    const layerList = page.getByTestId('authored-layer-list');
    await expect(layerList.getByText('mixed-reference.geojson')).toBeVisible();
    const hideButton = layerList.getByRole('button', {
      name: 'Hide mixed-reference.geojson',
    });
    await hideButton.press('Enter');
    const showButton = layerList.getByRole('button', {
      name: 'Show mixed-reference.geojson',
    });
    await expect(showButton).toBeVisible();

    // Keyboard activation keeps the real accessible control path while avoiding
    // WebKit's MapLibre-specific pointer-stability heuristic.
    await showButton.press('Enter');
    await expect(hideButton).toBeVisible();

    const removeButton = layerList.getByRole('button', {
      name: 'Remove mixed-reference.geojson',
    });
    await removeButton.press('Enter');
    await expect(layerList.getByText('mixed-reference.geojson')).toHaveCount(0);
  });

  test('saves, edits, and reopens geometry, style, visibility, order, and stable ids', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await prepareMapAuthoring(page);

    const input = page.getByLabel('Add GeoJSON layer');
    await input.setInputFiles([
      {
        name: 'territory.geojson',
        mimeType: 'application/geo+json',
        buffer: Buffer.from(MIXED_GEOJSON),
      },
      {
        name: 'checkpoint.geojson',
        mimeType: 'application/geo+json',
        buffer: Buffer.from('{"type":"Point","coordinates":[-58,-1]}'),
      },
    ]);

    const layerList = page.getByTestId('authored-layer-list');
    await expect(layerList.getByText('territory.geojson')).toBeVisible();
    await expect(layerList.getByText('checkpoint.geojson')).toBeVisible();
    await expect(page.getByText(/stored in this browser/i)).toBeVisible();

    await page.getByRole('button', { name: 'Save Map' }).click();
    const saveDialog = page.getByRole('dialog', { name: 'Save map' });
    await saveDialog.getByLabel('Map name').fill('Persisted authored layers');
    await saveDialog.getByRole('button', { name: 'Save draft' }).click();

    const savedRow = page
      .getByTestId('saved-map-row')
      .filter({ hasText: 'Persisted authored layers' });
    await expect(savedRow).toBeVisible();

    type StoredLayer = {
      id: string;
      name: string;
      visible: boolean;
      source: { type: string; data?: unknown };
      render: {
        layers: Array<{ type: string; paint?: Record<string, unknown> }>;
      };
    };
    type StoredMap = {
      id: string;
      name: string;
      createdAt: string;
      updatedAt: string;
      layers?: StoredLayer[];
    };
    const mapsAfterCreate = await getAppDatabaseRecordsByIndex<StoredMap>(
      page,
      'maps',
      'projectLocalId',
      'geojson-e2e-project',
    );
    const created = mapsAfterCreate.find(
      (map) => map.name === 'Persisted authored layers',
    );
    expect(created).toBeDefined();
    expect(created?.layers?.map((layer) => layer.name)).toEqual([
      'territory.geojson',
      'checkpoint.geojson',
    ]);
    const territoryBefore = created?.layers?.[0];
    const checkpointBefore = created?.layers?.[1];
    expect(territoryBefore?.source).toMatchObject({
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: expect.arrayContaining([
          expect.objectContaining({
            geometry: expect.objectContaining({ type: 'Polygon' }),
          }),
          expect.objectContaining({
            geometry: expect.objectContaining({ type: 'LineString' }),
          }),
          expect.objectContaining({
            geometry: expect.objectContaining({ type: 'Point' }),
          }),
        ]),
      },
    });
    expect(territoryBefore?.render.layers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'fill',
          paint: expect.objectContaining({
            'fill-color': '#E45D2A',
            'fill-opacity': 0.16,
          }),
        }),
        expect.objectContaining({
          type: 'line',
          paint: expect.objectContaining({
            'line-color': '#E45D2A',
            'line-width': 3,
            'line-opacity': 0.9,
          }),
        }),
        expect.objectContaining({
          type: 'circle',
          paint: expect.objectContaining({
            'circle-color': '#E45D2A',
            'circle-radius': 5,
            'circle-stroke-color': '#FFFFFF',
            'circle-stroke-width': 1.5,
          }),
        }),
      ]),
    );

    await savedRow.getByRole('button', { name: 'Edit layers' }).click();
    await expect(layerList.getByText('territory.geojson')).toBeVisible();
    await expect(layerList.getByText('checkpoint.geojson')).toBeVisible();
    await layerList
      .getByRole('button', { name: 'Hide territory.geojson' })
      .press('Enter');
    await layerList
      .getByRole('button', { name: 'Move checkpoint.geojson up' })
      .press('Enter');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(
      page.getByRole('button', { name: 'Save changes' }),
    ).toHaveCount(0);
    const mapsAfterEdit = await getAppDatabaseRecordsByIndex<StoredMap>(
      page,
      'maps',
      'projectLocalId',
      'geojson-e2e-project',
    );
    const edited = mapsAfterEdit.find((map) => map.id === created?.id);
    expect(edited?.id).toBe(created?.id);
    expect(edited?.createdAt).toBe(created?.createdAt);
    expect(edited?.layers?.map((layer) => layer.name)).toEqual([
      'checkpoint.geojson',
      'territory.geojson',
    ]);
    expect(edited?.layers?.[0]?.id).toBe(checkpointBefore?.id);
    expect(edited?.layers?.[1]?.id).toBe(territoryBefore?.id);
    expect(edited?.layers?.[1]?.visible).toBe(false);

    await savedRow.getByRole('button', { name: 'Edit layers' }).click();
    const reopenedRows = layerList.locator(':scope > li');
    await expect(reopenedRows).toHaveCount(2);
    await expect(reopenedRows.nth(0)).toContainText('checkpoint.geojson');
    await expect(reopenedRows.nth(1)).toContainText('territory.geojson');
    await expect(
      layerList.getByRole('button', { name: 'Show territory.geojson' }),
    ).toBeVisible();

    const beforeCancel = (
      await getAppDatabaseRecordsByIndex<StoredMap>(
        page,
        'maps',
        'projectLocalId',
        'geojson-e2e-project',
      )
    ).find((map) => map.id === created?.id);
    await page.getByRole('button', { name: 'Cancel editing' }).click();
    const afterCancel = (
      await getAppDatabaseRecordsByIndex<StoredMap>(
        page,
        'maps',
        'projectLocalId',
        'geojson-e2e-project',
      )
    ).find((map) => map.id === created?.id);
    expect(afterCancel).toEqual(beforeCancel);
  });

  test('mobile file picker remains available through map settings', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 375, height: 812 });
    await prepareMapAuthoring(page);

    await page.getByRole('button', { name: 'Map settings' }).click();
    const settingsDialog = page.getByRole('dialog', { name: 'Map settings' });
    const input = settingsDialog.getByLabel('Add GeoJSON layer');
    await expect(input).toBeAttached();
    await input.setInputFiles({
      name: 'mobile-reference.geojson',
      mimeType: 'application/geo+json',
      buffer: Buffer.from('{"type":"Point","coordinates":[-60,-3]}'),
    });

    await expect(
      settingsDialog.getByText('mobile-reference.geojson'),
    ).toBeVisible();
    await expect(
      settingsDialog.getByText(/stored in this browser/i),
    ).toBeVisible();

    await input.setInputFiles({
      name: 'broken.geojson',
      mimeType: 'application/geo+json',
      buffer: Buffer.from('{"type":"Point","coordinates":["bad",0]}'),
    });
    await expect(settingsDialog.getByRole('alert')).toContainText(
      'broken.geojson is not valid GeoJSON.',
    );
  });
});

test.describe('SMP Download (E2E)', () => {
  test('downloads a map: pending → progress → ready → export', async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await setupMockServer(page);

    // Navigate to the map screen first (IndexedDB needs a loaded page context)
    await page.goto('/map');
    await page.waitForLoadState('domcontentloaded');

    // Seed IndexedDB + auth state
    const mapId = crypto.randomUUID();
    await seedMapDownloadTest(page, {
      id: mapId,
      projectLocalId: 'e2e-project',
      name: 'E2E Download Test',
      bbox: [-0.01, -0.01, 0.01, 0.01],
      maxZoom: 0,
    });

    // Mock storage quota to allow any download size.
    // navigator.storage may not exist in all browsers (e.g. older WebKit builds);
    // when absent the app's quota check will use its own fallback, so skipping
    // the mock here is safe — the 1×1px tile payload is tiny regardless.
    await page.evaluate(() => {
      if (navigator.storage) {
        navigator.storage.estimate = () =>
          Promise.resolve({
            quota: 10 * 1024 * 1024 * 1024, // 10 GB
            usage: 0,
          });
      }
    });

    // Intercept tile proxy requests — return synthetic tiles with a delay
    // so that the progress UI state is observable before completion
    await page.route('**/api/tiles**', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: TRANSPARENT_1X1_PNG,
      });
    });

    // Reload so the app picks up the seeded IndexedDB records
    // (the project store was set in localStorage before reload)
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // Wait for DownloadPanel to appear
    const downloadPanel = page.getByTestId('download-panel');
    await expect(downloadPanel).toBeVisible({ timeout: 10_000 });

    // Click the download button
    const downloadButton = downloadPanel.getByRole('button', {
      name: 'Download Map',
    });
    await expect(downloadButton).toBeVisible();
    await downloadButton.click();

    // ---- Phase 1–2: Race pending vs progress (both are transient) ----
    const pendingVisible = page
      .getByTestId('download-pending')
      .isVisible()
      .then((v) => v as boolean);
    const progressVisible = page
      .getByTestId('download-progress')
      .isVisible()
      .then((v) => v as boolean);
    await Promise.race([pendingVisible, progressVisible]);

    // ---- Phase 2: Downloading state with progress ----
    const progressPanel = page.getByTestId('download-progress');
    await expect(progressPanel).toBeVisible({ timeout: 15_000 });

    // Verify progress info is displayed
    await expect(progressPanel.getByText(/%/)).toBeVisible();
    await expect(
      progressPanel.getByRole('button', { name: 'Cancel' }),
    ).toBeVisible();

    // ---- Phase 3: Ready state with export button ----
    const readyPanel = page.getByTestId('download-ready');
    await expect(readyPanel).toBeVisible({ timeout: 30_000 });

    // Verify success message
    await expect(page.getByText(/Map downloaded successfully/)).toBeVisible();

    // Verify export button exists
    const exportButton = readyPanel.getByRole('button', {
      name: 'Download SMP File',
    });
    await expect(exportButton).toBeVisible();
    await expect(exportButton).toBeEnabled();

    // ---- Phase 4: Trigger export and verify browser save dialog ----
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10_000 }),
      exportButton.click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.smp$/);
    expect(download.suggestedFilename()).toContain('E2E Download Test');
  });
});
