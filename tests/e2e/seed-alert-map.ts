import type { Page } from '@playwright/test';

const PROJECT_ID = 'alerts-map-project';

/** Seed deterministic local state for Alerts map browser and screenshot tests. */
export async function seedAlertMapState(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  // Wait for the app's initial Dexie open/upgrade to finish before opening the
  // same database through raw IndexedDB. Without this gate the seed can race
  // schema initialization and leave the second open request pending.
  await page.waitForFunction(
    async () => {
      const databases = await indexedDB.databases();
      return databases.some(
        (database) =>
          database.name === 'comapeo-cloud-app' && (database.version ?? 0) > 0,
      );
    },
    undefined,
    { timeout: 10_000 },
  );

  await page.evaluate(async (projectId) => {
    const now = '2026-08-12T12:00:00.000Z';
    const records = [
      {
        localId: 'alerts-map-point',
        projectLocalId: projectId,
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
        projectLocalId: projectId,
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
    ];

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('comapeo-cloud-app');
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(
          ['projects', 'alerts'],
          'readwrite',
        );
        transaction.objectStore('projects').put({
          localId: projectId,
          sourceType: 'local',
          sourceId: 'local',
          name: 'Alerts Map Project',
          createdAt: now,
          updatedAt: now,
          dirtyLocal: false,
          deleted: false,
        });
        const alerts = transaction.objectStore('alerts');
        for (const record of records) alerts.put(record);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => {
          database.close();
          reject(transaction.error);
        };
      };
      request.onerror = () => reject(request.error);
    });

    localStorage.setItem(
      'comapeo-project',
      JSON.stringify({ state: { selectedProjectId: projectId }, version: 0 }),
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
