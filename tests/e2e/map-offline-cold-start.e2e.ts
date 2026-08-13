import { expect, test } from '@playwright/test';
import JSZip from 'jszip';

const TRANSPARENT_1X1_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64',
);

const PROJECT_WITH_MAP = 'offline-project-with-map';
const PROJECT_WITHOUT_MAP = 'offline-project-without-map';
const ACTIVE_MAP_ID = 'offline-cold-start-map';
const ACTIVE_MAP_NAME = 'Offline Cold Start Map';

async function buildOfflineSmp(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('VERSION', '1.0');
  zip.file(
    'style.json',
    JSON.stringify({
      version: 8,
      glyphs: 'smp://maps.v1/fonts/{fontstack}/{range}.pbf',
      sprite: 'smp://maps.v1/sprites/sprite',
      sources: {
        raster: {
          type: 'raster',
          tiles: ['smp://maps.v1/s/0/{z}/{x}/{y}.png'],
          tileSize: 256,
          minzoom: 0,
          maxzoom: 0,
        },
        label: {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [0, 0] },
                properties: { name: 'Offline' },
              },
            ],
          },
        },
      },
      layers: [
        { id: 'raster', type: 'raster', source: 'raster' },
        {
          id: 'label',
          type: 'symbol',
          source: 'label',
          layout: {
            'icon-image': 'marker',
            'text-field': ['get', 'name'],
            'text-font': ['Open Sans Regular'],
          },
        },
      ],
      metadata: {
        name: ACTIVE_MAP_NAME,
        'smp:bounds': [-180, -85, 180, 85],
        'smp:maxzoom': 0,
        'smp:sourceFolders': { raster: 's/0' },
      },
    }),
  );
  zip.file('s/0/0/0/0.png', TRANSPARENT_1X1_PNG);
  zip.file(
    'sprites/sprite.json',
    JSON.stringify({
      marker: { width: 1, height: 1, x: 0, y: 0, pixelRatio: 1 },
    }),
  );
  zip.file('sprites/sprite.png', TRANSPARENT_1X1_PNG);
  // An empty PBF is a valid empty protobuf message. It is sufficient for this
  // fixture because the test is proving packaged-resource routing, not glyph
  // rasterization correctness.
  zip.file('fonts/Open Sans Regular/0-255.pbf', new Uint8Array());
  return zip.generateAsync({ type: 'uint8array' });
}

async function seedLocalState(
  page: import('@playwright/test').Page,
  smpBytes: Uint8Array,
): Promise<void> {
  await page.evaluate(
    async ({
      bytes,
      activeMapId,
      activeMapName,
      projectWithMap,
      projectWithoutMap,
    }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('comapeo-cloud-app');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });

      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(
            ['projects', 'maps', 'observations'],
            'readwrite',
          );
          const now = new Date().toISOString();
          tx.objectStore('projects').put({
            localId: projectWithMap,
            sourceType: 'local',
            sourceId: `local:${projectWithMap}`,
            name: 'Offline Project With Map',
            activeMapId,
            createdAt: now,
            updatedAt: now,
            dirtyLocal: false,
            deleted: false,
          });
          tx.objectStore('projects').put({
            localId: projectWithoutMap,
            sourceType: 'local',
            sourceId: `local:${projectWithoutMap}`,
            name: 'Offline Project Without Map',
            activeMapId: null,
            createdAt: now,
            updatedAt: now,
            dirtyLocal: false,
            deleted: false,
          });
          tx.objectStore('observations').put({
            localId: 'offline-map-point',
            projectLocalId: projectWithMap,
            sourceType: 'local',
            sourceId: 'local:offline-map-point',
            lat: 1,
            lon: 1,
            createdAt: now,
            updatedAt: now,
            dirtyLocal: false,
            deleted: false,
          });
          tx.objectStore('maps').put({
            id: activeMapId,
            projectLocalId: projectWithMap,
            name: activeMapName,
            type: 'style',
            origin: 'imported',
            styleUrl: '',
            bbox: [-180, -85, 180, 85],
            minZoom: 0,
            maxZoom: 0,
            status: 'ready',
            smpBlob: new Blob([new Uint8Array(bytes)], {
              type: 'application/zip',
            }),
            smpSize: bytes.length,
            createdAt: now,
            updatedAt: now,
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
      } finally {
        db.close();
      }

      localStorage.setItem(
        'comapeo-project',
        JSON.stringify({
          state: { selectedProjectId: projectWithMap, selectedServerId: null },
          version: 0,
        }),
      );
      // Deliberately omit activeMapId. A cold start must rehydrate it from the
      // selected project's IndexedDB row rather than stale persisted Zustand.
      localStorage.setItem(
        'comapeo-map',
        JSON.stringify({ state: { basemapId: 'carto-positron' }, version: 1 }),
      );
    },
    {
      bytes: Array.from(smpBytes),
      activeMapId: ACTIVE_MAP_ID,
      activeMapName: ACTIVE_MAP_NAME,
      projectWithMap: PROJECT_WITH_MAP,
      projectWithoutMap: PROJECT_WITHOUT_MAP,
    },
  );
}

async function waitForPwaControl(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Worker unavailable in this browser');
    }
    await navigator.serviceWorker.ready;
  });
  if (
    !(await page.evaluate(() => navigator.serviceWorker.controller !== null))
  ) {
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  }
  await expect
    .poll(() =>
      page.evaluate(() => navigator.serviceWorker.controller !== null),
    )
    .toBe(true);
}

async function readProjectActiveMapId(
  page: import('@playwright/test').Page,
  projectLocalId: string,
): Promise<string | null | undefined> {
  return page.evaluate(async (localId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('comapeo-cloud-app');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      return await new Promise<string | null | undefined>((resolve, reject) => {
        const request = db
          .transaction('projects', 'readonly')
          .objectStore('projects')
          .get(localId);
        request.onerror = () => reject(request.error);
        request.onsuccess = () =>
          resolve(
            (request.result as { activeMapId?: string | null } | undefined)
              ?.activeMapId,
          );
      });
    } finally {
      db.close();
    }
  }, projectLocalId);
}

test.describe('active SMP offline cold start', () => {
  test.skip(
    !process.env.VITE_PREVIEW,
    'requires a built PWA served by vite preview',
  );

  test('rehydrates and renders packaged SMP resources after a clean offline restart', async ({
    context,
    page,
  }) => {
    test.setTimeout(90_000);

    const externalRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== 'http://localhost:5173')
        externalRequests.push(request.url());
    });

    await page.goto('/map');
    await page.waitForLoadState('domcontentloaded');
    await waitForPwaControl(page);
    await seedLocalState(page, await buildOfflineSmp());

    externalRequests.length = 0;
    await page.goto('/');
    await expect(page.getByTestId('map-active-map-badge')).toContainText(
      ACTIVE_MAP_NAME,
      {
        timeout: 15_000,
      },
    );
    await expect(page.getByTestId('map-active-map-error')).toHaveCount(0);
    expect(await readProjectActiveMapId(page, PROJECT_WITH_MAP)).toBe(
      ACTIVE_MAP_ID,
    );
    expect(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem('comapeo-map') ?? '{}'),
      ),
    ).not.toEqual(
      expect.objectContaining({
        state: expect.objectContaining({ activeMapId: expect.anything() }),
      }),
    );

    // A new Page gives the PWA a clean JS/React/MapLibre lifecycle while the
    // browser profile retains the already-cached shell, localStorage, and IDB.
    await page.close();
    await context.setOffline(true);
    const offlinePage = await context.newPage();
    const offlineExternalRequests: string[] = [];
    offlinePage.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== 'http://localhost:5173')
        offlineExternalRequests.push(request.url());
    });

    const response = await offlinePage.goto('/');
    expect(response?.ok()).toBe(true);
    await expect(offlinePage.getByTestId('map-container')).toBeVisible();
    await expect(offlinePage.getByTestId('map-active-map-badge')).toContainText(
      ACTIVE_MAP_NAME,
      { timeout: 15_000 },
    );
    await expect(offlinePage.getByTestId('map-active-map-error')).toHaveCount(
      0,
    );
    expect(await readProjectActiveMapId(offlinePage, PROJECT_WITH_MAP)).toBe(
      ACTIVE_MAP_ID,
    );
    expect(offlineExternalRequests).toEqual([]);

    // The desktop archive list is visually overlapped by the main panel in this
    // test layout, so invoke the real button handler without pointer hit-testing.
    await offlinePage
      .getByRole('button', { name: 'Offline Project Without Map' })
      .evaluate((button: HTMLButtonElement) => button.click());
    await expect(offlinePage.getByTestId('map-active-map-badge')).toHaveCount(
      0,
    );

    await offlinePage
      .getByRole('button', { name: 'Offline Project With Map' })
      .evaluate((button: HTMLButtonElement) => button.click());
    await expect(offlinePage.getByTestId('map-active-map-badge')).toContainText(
      ACTIVE_MAP_NAME,
    );

    await offlinePage.goto('/map');
    const savedMapRow = offlinePage
      .getByTestId('saved-map-row')
      .filter({ hasText: ACTIVE_MAP_NAME });
    await savedMapRow.getByRole('button', { name: 'Remove active' }).click();
    expect(
      await readProjectActiveMapId(offlinePage, PROJECT_WITH_MAP),
    ).toBeNull();
    await offlinePage.goto('/');
    await expect(offlinePage.getByTestId('map-active-map-badge')).toHaveCount(
      0,
    );

    await offlinePage.goto('/map');
    const inactiveSavedMapRow = offlinePage
      .getByTestId('saved-map-row')
      .filter({ hasText: ACTIVE_MAP_NAME });
    await inactiveSavedMapRow
      .getByRole('button', { name: 'Set active' })
      .click();
    expect(await readProjectActiveMapId(offlinePage, PROJECT_WITH_MAP)).toBe(
      ACTIVE_MAP_ID,
    );
    await offlinePage.goto('/');
    await expect(offlinePage.getByTestId('map-active-map-badge')).toContainText(
      ACTIVE_MAP_NAME,
    );

    // Corrupting the local package and starting the page again must produce an
    // intentional error state rather than a hang/crash or remote fallback.
    await offlinePage.evaluate(async (mapId) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('comapeo-cloud-app');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('maps', 'readwrite');
          const request = tx.objectStore('maps').get(mapId);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            tx.objectStore('maps').put({
              ...request.result,
              smpBlob: new Blob(['not a zip'], { type: 'application/zip' }),
              smpSize: 9,
              updatedAt: new Date().toISOString(),
            });
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    }, ACTIVE_MAP_ID);

    await offlinePage.close();
    const corruptPage = await context.newPage();
    await corruptPage.goto('/');
    await expect(corruptPage.getByTestId('map-active-map-error')).toContainText(
      ACTIVE_MAP_NAME,
      {
        timeout: 15_000,
      },
    );
    await expect(corruptPage.getByTestId('map-container')).toBeVisible();
    await expect(corruptPage.getByTestId('map-active-map-badge')).toHaveCount(
      0,
    );

    // The warm online phase must not have depended on a remote resource either;
    // all style/tile/glyph/sprite URLs in this fixture are smp:// package URLs.
    expect(externalRequests).toEqual([]);
  });
});
