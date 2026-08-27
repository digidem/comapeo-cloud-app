import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

import {
  AUTHORED_RASTER_LAYER_FIXTURE,
  AUTHORED_VECTOR_LAYER_FIXTURE,
} from '../fixtures/authored-layers';
import {
  e2eArrayBuffer,
  getAppDatabaseRecord,
  seedAppDatabase,
  updateAppDatabaseRecord,
} from './app-db';

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
  const vectorSourceId = `comapeo-authored:${AUTHORED_VECTOR_LAYER_FIXTURE.id}:source`;
  const rasterSourceId = `comapeo-authored:${AUTHORED_RASTER_LAYER_FIXTURE.id}:source`;
  const rasterFolder = `comapeo-authored-${createHash('sha256')
    .update(AUTHORED_RASTER_LAYER_FIXTURE.id)
    .digest('hex')}`;
  const authoredVectorData =
    AUTHORED_VECTOR_LAYER_FIXTURE.source.type === 'geojson'
      ? {
          ...AUTHORED_VECTOR_LAYER_FIXTURE.source.data,
          features: [
            ...AUTHORED_VECTOR_LAYER_FIXTURE.source.data.features,
            {
              type: 'Feature' as const,
              properties: { name: 'point-render-canary' },
              geometry: { type: 'Point' as const, coordinates: [-59.5, -3] },
            },
          ],
        }
      : { type: 'FeatureCollection' as const, features: [] };
  const authoredRasterPng = await sharp({
    create: {
      width: 1,
      height: 1,
      channels: 4,
      background: { r: 40, g: 180, b: 80, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  const authoredVectorLayers = AUTHORED_VECTOR_LAYER_FIXTURE.render.layers.map(
    (fragment, index) => ({
      ...fragment,
      id: `comapeo-authored:${AUTHORED_VECTOR_LAYER_FIXTURE.id}:layer:${index}`,
      source: vectorSourceId,
      layout: { ...(fragment.layout ?? {}), visibility: 'visible' as const },
    }),
  );
  const authoredRasterLayers = AUTHORED_RASTER_LAYER_FIXTURE.render.layers.map(
    (fragment, index) => ({
      ...fragment,
      id: `comapeo-authored:${AUTHORED_RASTER_LAYER_FIXTURE.id}:layer:${index}`,
      source: rasterSourceId,
      layout: { ...(fragment.layout ?? {}), visibility: 'visible' as const },
    }),
  );
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
        [vectorSourceId]: {
          type: 'geojson',
          data: authoredVectorData,
        },
        [rasterSourceId]: {
          type: 'raster',
          tiles: [`smp://maps.v1/s/${rasterFolder}/{z}/{x}/{y}.png`],
          tileSize: 256,
          scheme: 'xyz',
          minzoom: 0,
          maxzoom: 0,
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
        ...authoredRasterLayers,
        ...authoredVectorLayers,
      ],
      metadata: {
        name: ACTIVE_MAP_NAME,
        'smp:bounds': [-180, -85, 180, 85],
        'smp:maxzoom': 0,
        'smp:sourceFolders': {
          raster: 's/0',
          [rasterSourceId]: `s/${rasterFolder}`,
        },
      },
    }),
  );
  zip.file('s/0/0/0/0.png', TRANSPARENT_1X1_PNG);
  zip.file(`s/${rasterFolder}/0/0/0.png`, authoredRasterPng);
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
  const now = new Date().toISOString();
  await seedAppDatabase(page, {
    projects: [
      {
        localId: PROJECT_WITH_MAP,
        sourceType: 'local',
        sourceId: `local:${PROJECT_WITH_MAP}`,
        name: 'Offline Project With Map',
        activeMapId: ACTIVE_MAP_ID,
        createdAt: now,
        updatedAt: now,
        dirtyLocal: false,
        deleted: false,
      },
      {
        localId: PROJECT_WITHOUT_MAP,
        sourceType: 'local',
        sourceId: `local:${PROJECT_WITHOUT_MAP}`,
        name: 'Offline Project Without Map',
        activeMapId: null,
        createdAt: now,
        updatedAt: now,
        dirtyLocal: false,
        deleted: false,
      },
    ],
    observations: [
      ...[
        ['offline-map-point-west', -4, -61],
        ['offline-map-point-east', 0, -55],
        ['offline-map-point-middle', -1, -58],
      ].map(([localId, lat, lon]) => ({
        localId: String(localId),
        projectLocalId: PROJECT_WITH_MAP,
        sourceType: 'local' as const,
        sourceId: `local:${String(localId)}`,
        lat: Number(lat),
        lon: Number(lon),
        createdAt: now,
        updatedAt: now,
        dirtyLocal: false,
        deleted: false,
      })),
    ],
    maps: [
      {
        id: ACTIVE_MAP_ID,
        projectLocalId: PROJECT_WITH_MAP,
        name: ACTIVE_MAP_NAME,
        type: 'style',
        origin: 'imported',
        styleUrl: '',
        bbox: [-180, -85, 180, 85],
        minZoom: 0,
        maxZoom: 0,
        status: 'ready',
        smpSize: smpBytes.length,
        createdAt: now,
        updatedAt: now,
      },
    ],
    mapPackages: [
      {
        mapId: ACTIVE_MAP_ID,
        contentType: 'application/zip',
        size: smpBytes.length,
        chunkSize: smpBytes.length,
        chunkCount: 1,
        updatedAt: now,
      },
    ],
    mapPackageChunks: [
      {
        id: `${ACTIVE_MAP_ID}:0`,
        mapId: ACTIVE_MAP_ID,
        index: 0,
        data: e2eArrayBuffer(smpBytes),
      },
    ],
  });

  await page.evaluate((projectWithMap) => {
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
  }, PROJECT_WITH_MAP);
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
  const project = await getAppDatabaseRecord<{
    activeMapId?: string | null;
  }>(page, 'projects', projectLocalId);
  return project?.activeMapId;
}

async function countCanonicalAuthoredColors(
  page: import('@playwright/test').Page,
): Promise<{ blue: number; navy: number; orange: number; green: number }> {
  const canvas = page.locator('canvas.maplibregl-canvas').first();
  if (!(await canvas.isVisible())) {
    return { blue: 0, navy: 0, orange: 0, green: 0 };
  }
  const screenshot = await canvas.screenshot();
  const { data, info } = await sharp(screenshot)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let blue = 0;
  let navy = 0;
  let orange = 0;
  let green = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const red = data[offset] ?? 0;
    const pixelGreen = data[offset + 1] ?? 0;
    const pixelBlue = data[offset + 2] ?? 0;
    const alpha = data[offset + 3] ?? 0;
    if (alpha < 20) continue;
    if (red < 150 && pixelGreen > 60 && pixelGreen < 190 && pixelBlue > 150)
      blue += 1;
    if (red < 90 && pixelGreen < 110 && pixelBlue > 45 && pixelBlue < 180)
      navy += 1;
    if (red > 150 && pixelGreen > 40 && pixelGreen < 170 && pixelBlue < 130)
      orange += 1;
    if (red < 130 && pixelGreen > 120 && pixelBlue < 150) green += 1;
  }
  return { blue, navy, orange, green };
}

test.describe('active SMP offline cold start', () => {
  test.skip(
    !process.env.VITE_PREVIEW,
    'requires a built PWA served by vite preview',
  );

  test('rehydrates and renders packaged SMP resources after a clean offline restart', async ({
    browserName,
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
    // Chromium provides a stable headless WebGL screenshot surface here. Firefox
    // still exercises the complete offline SMP lifecycle below, but its headless
    // canvas screenshots do not reliably expose WebGL texture/circle pixels.
    if (browserName === 'chromium') {
      await expect
        .poll(
          async () => {
            const colors = await countCanonicalAuthoredColors(offlinePage);
            return (
              colors.blue > 5 &&
              colors.navy > 5 &&
              colors.orange > 5 &&
              colors.green > 50
            );
          },
          {
            timeout: 15_000,
            message:
              'canonical authored polygon/line/point/raster colors should render from the offline SMP',
          },
        )
        .toBe(true);
    }

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
    await updateAppDatabaseRecord(
      offlinePage,
      'mapPackageChunks',
      `${ACTIVE_MAP_ID}:0`,
      {
        data: e2eArrayBuffer(new TextEncoder().encode('not a zip')),
      },
    );

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
