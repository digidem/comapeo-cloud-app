import { type Page } from '@playwright/test';

import { seedAppDatabase } from './app-db';

const PROJECT_ID = 'alerts-map-project';

/** Seed deterministic local state for Alerts map browser and screenshot tests. */
export async function seedAlertMapState(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  const now = '2026-08-12T12:00:00.000Z';
  await seedAppDatabase(page, {
    projects: [
      {
        localId: PROJECT_ID,
        sourceType: 'local',
        sourceId: 'local',
        name: 'Alerts Map Project',
        createdAt: now,
        updatedAt: now,
        dirtyLocal: false,
        deleted: false,
      },
    ],
    alerts: [
      {
        localId: 'alerts-map-point',
        projectLocalId: PROJECT_ID,
        sourceType: 'local',
        sourceId: 'local',
        geometry: { type: 'Point', coordinates: [-55.45, -8.35] },
        metadata: { alert_type: 'forest-change' },
        detectionDateStart: '2026-08-10T00:00:00.000Z',
        detectionDateEnd: '2026-08-11T00:00:00.000Z',
        createdAt: now,
        updatedAt: now,
        dirtyLocal: false,
        deleted: false,
      },
      {
        localId: 'alerts-map-polygon',
        projectLocalId: PROJECT_ID,
        sourceType: 'local',
        sourceId: 'local',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-62, -11],
              [-59, -11],
              [-59, -9],
              [-62, -9],
              [-62, -11],
            ],
          ],
        },
        metadata: { alert_type: 'area-change' },
        detectionDateStart: '2026-08-08T00:00:00.000Z',
        detectionDateEnd: '2026-08-09T00:00:00.000Z',
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
        state: { selectedProjectId: projectId },
        version: 0,
      }),
    );
    localStorage.setItem(
      'comapeo-alert-view-mode-preference',
      JSON.stringify({ state: { viewMode: 'map' }, version: 0 }),
    );
    localStorage.setItem(
      'view-mode-preference',
      JSON.stringify({ state: { viewMode: 'map' }, version: 0 }),
    );
  }, PROJECT_ID);
}
