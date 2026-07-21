import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';

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

/**
 * Seed all required IndexedDB records and Zustand store so the /map route
 * renders with a draft map ready to download.
 *
 * Writes to the real comapeo-cloud-app IndexedDB from inside page.evaluate().
 */
async function seedMapDownloadTest(
  page: import('@playwright/test').Page,
  map: SeedMap,
): Promise<void> {
  await page.evaluate(
    (map) => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('comapeo-cloud-app');
        req.onerror = () => reject(new Error('Failed to open IndexedDB'));
        req.onupgradeneeded = () => {
          const db = req.result;
          const stores = {
            remoteServers: 'id',
            projects: 'localId',
            maps: 'id',
          } as const;
          for (const [name, keyPath] of Object.entries(stores)) {
            if (!db.objectStoreNames.contains(name)) {
              db.createObjectStore(name, { keyPath });
            }
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          try {
            const tx = db.transaction(
              ['remoteServers', 'projects', 'maps'],
              'readwrite',
            );
            const now = new Date().toISOString();

            // Auth: a remote server (required for authenticated route guard)
            tx.objectStore('remoteServers').put({
              id: 'test-server',
              baseUrl: 'https://test.example.com',
              token: 'test-token',
              label: 'Test Server',
              status: 'connected',
              lastSyncedAt: now,
              serverId: 'test-server',
            });

            // Project that owns the map
            tx.objectStore('projects').put({
              localId: map.projectLocalId,
              sourceType: 'local',
              sourceId: 'local:project',
              name: 'E2E Test Project',
              activeMapId: map.id,
              createdAt: now,
              updatedAt: now,
              dirtyLocal: false,
              deleted: false,
            });

            // The draft map to download — uses a common OSM raster tile source
            tx.objectStore('maps').put({
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
            });

            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => {
              db.close();
              reject(tx.error);
            };
          } catch (err) {
            db.close();
            reject(err);
          }
        };
      });
    },
    map as unknown as Record<string, unknown>,
  );

  // Auth: set the Zustand auth store + map store so the MapScreen renders
  await page.evaluate(
    ({ projectLocalId, mapId }) => {
      // Auth store
      const authSnapshot = JSON.stringify({
        state: {
          servers: [
            {
              id: 'test-server',
              baseUrl: 'https://test.example.com',
              token: 'test-token',
              label: 'Test Server',
              status: 'connected',
              lastSyncedAt: new Date().toISOString(),
            },
          ],
          activeServerId: 'test-server',
          token: 'test-token',
          baseUrl: 'https://test.example.com',
          isAuthenticated: true,
        },
        version: 0,
      });
      localStorage.setItem('comapeo-auth', authSnapshot);

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

    // Mock storage quota to allow any download size
    await page.evaluate(() => {
      if (navigator.storage) {
        Object.defineProperty(navigator.storage, 'estimate', {
          value: () =>
            Promise.resolve({
              quota: 10 * 1024 * 1024 * 1024, // 10 GB
              usage: 0,
            }),
          writable: true,
          configurable: true,
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
