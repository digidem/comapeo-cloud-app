import { expect, test } from '@playwright/test';

import {
  getAppDatabaseRecordsByIndex,
  seedAppDatabase,
  updateAppDatabaseRecord,
} from './app-db';
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
  await expect
    .poll(
      () =>
        page.evaluate(async () =>
          (await indexedDB.databases()).some(
            (database) => database.name === 'comapeo-cloud-app',
          ),
        ),
      { timeout: 20_000 },
    )
    .toBe(true);

  const now = new Date().toISOString();
  await seedAppDatabase(page, {
    projects: [
      {
        localId: projectLocalId,
        sourceType: 'local',
        sourceId: `local:${projectLocalId}`,
        name: projectName,
        createdAt: now,
        updatedAt: now,
        dirtyLocal: false,
        deleted: false,
      },
    ],
    cases: [
      {
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
      },
    ],
  });

  await page.evaluate((selectedProjectId) => {
    localStorage.setItem(
      'comapeo-project',
      JSON.stringify({
        state: { selectedProjectId, selectedServerId: null },
        version: 0,
      }),
    );
  }, projectLocalId);
}

async function seedEvidenceProjectState(
  page: import('@playwright/test').Page,
  projectLocalId: string,
  caseLocalId: string,
  caseTitle: string,
) {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await expect
    .poll(
      () =>
        page.evaluate(async () =>
          (await indexedDB.databases()).some(
            (database) => database.name === 'comapeo-cloud-app',
          ),
        ),
      { timeout: 20_000 },
    )
    .toBe(true);

  const createdAt = '2026-09-01T10:00:00.000Z';
  await seedAppDatabase(page, {
    projects: [
      {
        localId: projectLocalId,
        sourceType: 'local',
        sourceId: `local:${projectLocalId}`,
        name: 'Evidence QA Project',
        createdAt,
        updatedAt: createdAt,
        dirtyLocal: false,
        deleted: false,
      },
    ],
    cases: [
      {
        localId: caseLocalId,
        projectLocalId,
        title: caseTitle,
        caseType: 'fire',
        status: 'draft',
        createdAt,
        updatedAt: createdAt,
        revision: 1,
        createdBy: 'local',
        deleted: false,
      },
    ],
    observations: [
      {
        localId: 'e2e-observation',
        projectLocalId,
        sourceType: 'local',
        sourceId: 'local',
        versionId: 'observation-v1',
        tags: { category: 'Deforestation' },
        lat: -8.123456,
        lon: -55.654321,
        createdAt,
        updatedAt: createdAt,
        dirtyLocal: false,
        deleted: false,
      },
    ],
    alerts: [
      {
        localId: 'e2e-alert',
        projectLocalId,
        sourceType: 'local',
        sourceId: 'local',
        geometry: { type: 'Point', coordinates: [-55.7, -8.2] },
        metadata: { alert_type: 'Fire hotspot' },
        detectionDateStart: '2026-09-01T09:00:00.000Z',
        createdAt,
        updatedAt: createdAt,
        dirtyLocal: false,
        deleted: false,
      },
    ],
    tracks: [
      {
        localId: 'e2e-track',
        projectLocalId,
        sourceType: 'local',
        sourceId: 'local',
        versionId: 'track-v1',
        tags: { name: 'Patrol track' },
        locations: [
          {
            coords: { latitude: -8.3, longitude: -55.8 },
            timestamp: '2026-09-01T08:00:00.000Z',
          },
          {
            coords: { latitude: -8.31, longitude: -55.79 },
            timestamp: '2026-09-01T08:15:00.000Z',
          },
        ],
        observationRefs: [],
        createdAt,
        updatedAt: createdAt,
        dirtyLocal: false,
        deleted: false,
      },
    ],
    attachments: [
      {
        localId: 'e2e-photo',
        projectLocalId,
        observationLocalId: 'e2e-observation',
        sourceType: 'local',
        sourceId: 'local',
        mediaType: 'photo',
        contentType: 'image/jpeg',
        name: 'evidence.jpg',
        hash: 'original-photo-hash',
        downloadStatus: 'available',
        createdAt,
        updatedAt: createdAt,
        dirtyLocal: false,
        deleted: false,
      },
    ],
  });

  await page.evaluate((selectedProjectId) => {
    localStorage.setItem(
      'comapeo-project',
      JSON.stringify({
        state: { selectedProjectId, selectedServerId: null },
        version: 0,
      }),
    );
    localStorage.setItem(
      'view-mode-preference',
      JSON.stringify({ state: { viewMode: 'grid' }, version: 0 }),
    );
    localStorage.setItem(
      'comapeo-alert-view-mode-preference',
      JSON.stringify({ state: { viewMode: 'grid' }, version: 0 }),
    );
  }, projectLocalId);
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
      ).toBeVisible({ timeout: 15_000 });
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
      await expect(page.getByText('Case not found')).toBeVisible({
        timeout: 15_000,
      });

      await page.goto('/cases');
      await expect(page.getByText('Local Incident Case')).toBeVisible({
        timeout: 15_000,
      });
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
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        page.getByRole('link', { name: 'Go to Home' }),
      ).toHaveAttribute('href', '/');
      await expectNoHorizontalOverflow(page);

      expect(caseNetworkRequests).toEqual([]);
    });

    test('selects evidence, preserves source state, and persists disclosure locally', async ({
      page,
    }, testInfo) => {
      testInfo.setTimeout(90_000);
      await setupMockServer(page);

      const projectLocalId = `evidence-project-${viewport.name}`;
      const caseLocalId = `evidence-case-${viewport.name}`;
      const caseTitle = `Evidence Incident ${viewport.name}`;
      const sensitiveNetworkRequests: string[] = [];
      page.on('request', (request) => {
        if (!['fetch', 'xhr'].includes(request.resourceType())) return;
        const url = new URL(request.url());
        if (
          /(?:^|\/)cases?(?:\/|$)/i.test(url.pathname) ||
          /groq|openai|anthropic|provider/i.test(url.hostname + url.pathname)
        ) {
          sensitiveNetworkRequests.push(`${request.method()} ${request.url()}`);
        }
      });

      await seedEvidenceProjectState(
        page,
        projectLocalId,
        caseLocalId,
        caseTitle,
      );

      await page.goto('/data');
      const observationCheckbox = page.getByLabel(
        'Select observation Deforestation',
      );
      await expect(observationCheckbox).toBeVisible({ timeout: 15_000 });
      await observationCheckbox.check();
      await page.getByRole('button', { name: 'Add to case' }).click();
      await page.getByRole('button', { name: new RegExp(caseTitle) }).click();
      await expect(page.getByRole('dialog')).not.toBeVisible();

      await page.goto('/alerts');
      const alertCheckbox = page.getByLabel('Select alert Fire hotspot');
      await expect(alertCheckbox).toBeVisible({ timeout: 15_000 });
      await alertCheckbox.check();
      await page.getByRole('button', { name: 'Add to case' }).click();
      await page.getByRole('button', { name: new RegExp(caseTitle) }).click();
      await expect(page.getByRole('dialog')).not.toBeVisible();

      await page.goto(`/cases/${caseLocalId}`);
      await page.getByRole('tab', { name: 'Evidence' }).click();
      await page
        .getByRole('button', { name: 'Add track Patrol track' })
        .click();
      await expect(page.getByText('Selected evidence (3)')).toBeVisible();

      const photo = page.getByRole('checkbox', {
        name: 'Include evidence.jpg',
      });
      await photo.click();
      await expect(photo).toBeChecked({ timeout: 10_000 });

      await page.getByRole('button', { name: 'Timeline' }).click();
      await expect(
        page
          .getByRole('region', { name: 'Selected evidence (3)' })
          .getByRole('heading', { name: 'Patrol track' }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Map' }).click();
      await expect(page.locator('.maplibregl-map')).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await updateAppDatabaseRecord(page, 'observations', 'e2e-observation', {
        versionId: 'observation-v2',
        updatedAt: '2026-09-04T12:00:00.000Z',
        dirtyLocal: true,
      });
      await updateAppDatabaseRecord(page, 'alerts', 'e2e-alert', {
        deleted: true,
        updatedAt: '2026-09-04T12:01:00.000Z',
      });
      await updateAppDatabaseRecord(page, 'attachments', 'e2e-photo', {
        deleted: true,
        hash: 'changed-photo-hash',
        updatedAt: '2026-09-04T12:02:00.000Z',
      });

      await page.reload();
      await page.getByRole('tab', { name: 'Evidence' }).click();
      await expect(page.getByText('Fire hotspot')).toBeVisible();
      await expect(
        page.getByText('Deleted at source', { exact: true }),
      ).toBeVisible();
      await expect(page.getByText('Not project-synced')).toBeVisible();
      await expect(page.getByText('Media deleted at source')).toBeVisible();
      await expect(
        page.getByText('Media changed since selected'),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await page.getByRole('tab', { name: 'Reports' }).click();
      await expect(
        page.getByLabel('Omit reporter identity').first(),
      ).toBeChecked();
      await expect(page.getByLabel('Omit location').first()).toBeChecked();
      await page.getByLabel('Include reporter identity').first().check();
      await page.getByLabel('Area only').first().check();
      await page.getByLabel('Include evidence.jpg').first().check();
      await page
        .getByRole('button', { name: 'Save disclosure for FUNAI' })
        .click();
      await expect(page.getByText('Saved disclosure revision 1')).toBeVisible();

      const disclosures = await getAppDatabaseRecordsByIndex<{
        agency: string;
        reporterIdentity: string;
        locationMode: string;
        media: Array<{ id: string; include: boolean }>;
      }>(page, 'caseReportDisclosure', '[caseLocalId+agency]', [
        caseLocalId,
        'FUNAI',
      ]);
      expect(disclosures).toHaveLength(1);
      expect(disclosures[0]).toMatchObject({
        agency: 'FUNAI',
        reporterIdentity: 'include',
        locationMode: 'area',
      });
      expect(disclosures[0]?.media).toContainEqual({
        id: 'e2e-photo',
        include: true,
      });

      await page.getByRole('tab', { name: 'Activity' }).click();
      await expect(page.getByText('Evidence Added').first()).toBeVisible();
      await expect(page.getByText('Media Inclusion Changed')).toBeVisible();
      await expect(page.getByText('Disclosure Changed')).toBeVisible();

      const activity = await getAppDatabaseRecordsByIndex<
        Record<string, unknown>
      >(page, 'caseActivity', 'caseLocalId', caseLocalId);
      const serializedActivity = JSON.stringify(activity);
      expect(serializedActivity).not.toContain('-8.123456');
      expect(serializedActivity).not.toContain('-55.654321');
      expect(serializedActivity).not.toContain('changed-photo-hash');
      expect(sensitiveNetworkRequests).toEqual([]);

      await page.screenshot({
        path: testInfo.outputPath(
          `${viewport.name}-case-evidence-disclosure.png`,
        ),
        fullPage: true,
      });
    });
  });
}
