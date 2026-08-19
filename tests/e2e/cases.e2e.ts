import { expect, test } from '@playwright/test';

import { setupMockServer } from './mock-server';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 375, height: 812 },
] as const;

async function seedLocalProjectState(
  page: import('@playwright/test').Page,
  projectLocalId: string,
  projectName: string,
) {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  // Let the application own IndexedDB creation/migrations. Opening the DB from
  // the test before Dexie reaches v13 can create an empty v1 database and make
  // the seed transaction race with schema initialization.
  await page.waitForFunction(
    async () => {
      const databases = await indexedDB.databases();
      return databases.some(
        (database) =>
          database.name === 'comapeo-cloud-app' &&
          (database.version ?? 0) >= 13,
      );
    },
    undefined,
    { timeout: 10_000 },
  );

  await page.evaluate(
    async ({ projectLocalId, projectName }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('comapeo-cloud-app');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });

      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(['projects', 'cases'], 'readwrite');
          const now = new Date().toISOString();

          tx.objectStore('projects').put({
            localId: projectLocalId,
            sourceType: 'local',
            sourceId: `local:${projectLocalId}`,
            name: projectName,
            createdAt: now,
            updatedAt: now,
            dirtyLocal: false,
            deleted: false,
          });
          tx.objectStore('cases').put({
            localId: 'foreign-case',
            projectLocalId: 'other-project',
            title: 'Foreign Project Case',
            caseType: 'fire',
            status: 'draft',
            createdAt: now,
            updatedAt: now,
            revision: 1,
            createdBy: 'local',
            deleted: false,
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
          state: { selectedProjectId: projectLocalId, selectedServerId: null },
          version: 0,
        }),
      );
    },
    { projectLocalId, projectName },
  );
}

async function expectNoHorizontalOverflow(
  page: import('@playwright/test').Page,
) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

for (const viewport of VIEWPORTS) {
  test.describe(`Cases local-only flow (${viewport.name})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('create, inspect, transition, isolate, and stay local', async ({
      page,
    }, testInfo) => {
      testInfo.setTimeout(60_000);
      await setupMockServer(page);

      const caseNetworkRequests: string[] = [];
      page.on('request', (request) => {
        if (!['fetch', 'xhr'].includes(request.resourceType())) return;
        const url = new URL(request.url());
        if (
          /(?:^|\/)cases?(?:\/|$)/i.test(url.pathname) ||
          /groq|openai|anthropic|provider/i.test(url.hostname + url.pathname)
        ) {
          caseNetworkRequests.push(`${request.method()} ${request.url()}`);
        }
      });

      await seedLocalProjectState(
        page,
        `cases-project-${viewport.name}`,
        `Cases ${viewport.name}`,
      );

      await page.goto('/cases');
      await expect(
        page.getByRole('heading', { name: 'Cases', exact: true }),
      ).toBeVisible();
      await expect(page.getByText('Foreign Project Case')).not.toBeVisible();
      await expectNoHorizontalOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath(`${viewport.name}-cases-list.png`),
        fullPage: true,
      });

      const newCase = page.getByRole('link', { name: 'New Case' });
      await newCase.focus();
      await expect(newCase).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/cases\/new$/);
      await expectNoHorizontalOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath(`${viewport.name}-case-create.png`),
        fullPage: true,
      });

      await page.getByLabel('Title').fill('Local Incident Case');
      await page.getByRole('combobox', { name: 'Primary Type' }).click();
      await page.getByRole('option', { name: 'Fire' }).click();
      await page.getByRole('button', { name: 'Create Case' }).click();

      await expect(page).toHaveURL(/\/cases\/[^/]+$/);
      await expect(
        page.getByRole('heading', { name: 'Local Incident Case' }),
      ).toBeVisible();
      await expect(page.getByText('Current: Draft')).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath(`${viewport.name}-case-detail.png`),
        fullPage: true,
      });

      const changeStatus = page.getByRole('button', { name: 'Change Status' });
      await changeStatus.focus();
      await expect(changeStatus).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByText('Current: Active')).toBeVisible();

      const activityTab = page.getByRole('tab', { name: 'Activity' });
      await activityTab.focus();
      await expect(activityTab).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByText('Status Changed')).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await page.goto('/cases/foreign-case');
      await expect(page.getByText('Case not found')).toBeVisible();

      await page.goto('/cases');
      await expect(page.getByText('Local Incident Case')).toBeVisible();
      await expect(page.getByText('Foreign Project Case')).not.toBeVisible();

      const localCaseHref = await page
        .getByRole('link', { name: /Local Incident Case/ })
        .getAttribute('href');
      expect(localCaseHref).toBeTruthy();

      // A direct Case deep-link with no selected project must resolve to an
      // explicit route state rather than hanging on TanStack Query's disabled
      // pending state.
      await page.evaluate(() => {
        localStorage.setItem(
          'comapeo-project',
          JSON.stringify({
            state: { selectedProjectId: null, selectedServerId: null },
            version: 0,
          }),
        );
      });
      await page.goto(localCaseHref!);
      await expect(
        page.getByText('Select a project from Home to view cases'),
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'Go to Home' }),
      ).toHaveAttribute('href', '/');
      await expectNoHorizontalOverflow(page);

      expect(caseNetworkRequests).toEqual([]);
    });
  });
}
