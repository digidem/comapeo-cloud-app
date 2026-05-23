import { test } from '@playwright/test';

import { setupMockServer } from './mock-server';
import {
  THEME_IDS,
  VIEWPORTS,
  setTheme,
  takeScreenshot,
} from './screenshot-utils';
import type { ThemeId, ViewportName } from './screenshot-utils';

/**
 * Seeds a project and an observation with photo URLs into IndexedDB so the
 * observation detail screen can render a media gallery with clickable photos.
 * Returns the observation localId for navigation.
 */
async function seedObservationWithPhotos(
  page: import('@playwright/test').Page,
): Promise<string> {
  const projectLocalId = 'test-proj-lightbox';
  const observationLocalId = 'test-obs-lightbox';

  await page.evaluate(
    ({ projectLocalId: pId, observationLocalId: oId }) => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('comapeo-cloud-app');
        req.onupgradeneeded = () => {
          // DB may not exist yet; Dexie handles the schema on first open.
        };
        req.onsuccess = () => {
          const db = req.result;
          try {
            const tx = db.transaction(
              ['projects', 'observations'],
              'readwrite',
            );
            const projectStore = tx.objectStore('projects');
            const obsStore = tx.objectStore('observations');

            projectStore.put({
              localId: pId,
              sourceType: 'local',
              sourceId: 'local',
              name: 'Lightbox Test Project',
              createdAt: '2026-01-01T00:00:00Z',
              updatedAt: '2026-01-01T00:00:00Z',
              dirtyLocal: false,
              deleted: false,
            });

            obsStore.put({
              localId: oId,
              projectLocalId: pId,
              sourceType: 'local',
              sourceId: 'local',
              tags: {
                category: 'Forest',
                notes: 'Deforestation detected',
                photoUrls:
                  'https://example.com/attachments/photo1,https://example.com/attachments/photo2',
                photoCount: '2',
              },
              lat: -8.35,
              lon: -55.45,
              createdAt: '2026-01-15T00:00:00Z',
              updatedAt: '2026-01-15T12:00:00Z',
              dirtyLocal: false,
              deleted: false,
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
        req.onerror = () => reject(req.error);
      });
    },
    { projectLocalId, observationLocalId },
  );

  // Persist selectedProjectId in localStorage so the app knows which project is active
  await page.evaluate(
    ({ pId }) => {
      const raw = localStorage.getItem('comapeo-project') ?? '{}';
      const parsed = JSON.parse(raw);
      parsed.state = { ...parsed.state, selectedProjectId: pId };
      localStorage.setItem('comapeo-project', JSON.stringify(parsed));
    },
    { pId: projectLocalId },
  );

  return observationLocalId;
}

test.describe('Observations - visual screenshots', () => {
  for (const themeId of THEME_IDS) {
    for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
      test(`observations list ${themeId} theme at ${viewportName} viewport`, async ({
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

          // Navigate to Data screen (observations tab)
          await page.goto('/data');
          await page.waitForLoadState('domcontentloaded');

          await takeScreenshot(
            page,
            `observations-list-${themeId}`,
            viewportName as ViewportName,
          );
        } finally {
          await context.close();
        }
      });

      test(`observation detail ${themeId} theme at ${viewportName} viewport`, async ({
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

          // Navigate to observation detail
          await page.goto('/data/observations/obs-1');
          await page.waitForLoadState('domcontentloaded');

          await takeScreenshot(
            page,
            `observation-detail-${themeId}`,
            viewportName as ViewportName,
          );
        } finally {
          await context.close();
        }
      });

      test(`observation detail lightbox ${themeId} theme at ${viewportName} viewport`, async ({
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

          // Seed an observation with 2 photo URLs
          const observationLocalId = await seedObservationWithPhotos(page);

          // Navigate to the seeded observation detail
          await page.goto(`/data/observations/${observationLocalId}`);
          await page.waitForLoadState('domcontentloaded');

          // Click the first photo thumbnail to open the lightbox
          await page.getByRole('button', { name: /Photo 1/i }).click();

          // Wait for the lightbox dialog to appear
          await page.waitForSelector('[role="dialog"][aria-modal="true"]', {
            timeout: 5_000,
          });

          await takeScreenshot(
            page,
            `observation-detail-lightbox-${themeId}`,
            viewportName as ViewportName,
          );
        } finally {
          await context.close();
        }
      });
    }
  }
});
