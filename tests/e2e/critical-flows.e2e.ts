import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { setupMockServer } from './mock-server';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GEOJSON_FIXTURE = path.join(
  __dirname,
  '../fixtures/sample-territory.geojson',
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createProject(
  page: import('@playwright/test').Page,
  name: string,
) {
  await page
    .getByRole('button', { name: 'Create your first project' })
    .first()
    .click();
  await page.getByLabel('Project Name').fill(name);
  // Scope to dialog to avoid matching other "Create" text on page
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Create', exact: true })
    .click();
  await expect(page.locator('h2', { hasText: name })).toBeVisible({
    timeout: 5_000,
  });
}

/**
 * Create a project, import GeoJSON, wait for observations in IndexedDB,
 * and wait for selectedProjectId to be persisted to localStorage.
 * Returns the projectLocalId.
 */
async function seedProjectWithObservations(
  page: import('@playwright/test').Page,
  name: string,
): Promise<string> {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  // Create project
  await createProject(page, name);

  // Import GeoJSON via file chooser
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import Data' }).click(),
  ]);
  await fileChooser.setFiles(GEOJSON_FIXTURE);

  // Wait for observations to appear in IndexedDB
  await expect
    .poll(
      async () => {
        return await page.evaluate(async () => {
          return new Promise<number>((resolve) => {
            const req = indexedDB.open('comapeo-cloud-app');
            req.onsuccess = () => {
              const db = req.result;
              try {
                const tx = db.transaction('observations', 'readonly');
                const store = tx.objectStore('observations');
                const countReq = store.count();
                countReq.onsuccess = () => {
                  resolve(countReq.result);
                  db.close();
                };
                countReq.onerror = () => {
                  resolve(0);
                  db.close();
                };
              } catch {
                resolve(0);
                db.close();
              }
            };
            req.onerror = () => resolve(0);
          });
        });
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0);

  // Wait for selectedProjectId to be persisted to localStorage
  // (HomeScreen auto-selects first project and syncs to Zustand persist store async)
  const readSelectedProjectId = () =>
    page.evaluate(() => {
      const raw = localStorage.getItem('comapeo-project');
      if (!raw) return null;
      try {
        return JSON.parse(raw).state?.selectedProjectId ?? null;
      } catch {
        return null;
      }
    });

  await expect.poll(readSelectedProjectId, { timeout: 10_000 }).not.toBeNull();

  const projectLocalId = await readSelectedProjectId();
  if (!projectLocalId) {
    throw new Error('selectedProjectId not persisted after poll');
  }
  return projectLocalId;
}

type MockInviteScope =
  { type: 'archive' } | { type: 'project'; projectId: string };

type MockInvitePayload = {
  url: string;
  token: string;
  scope?: MockInviteScope;
};

type IndexedDbRecord = Record<string, unknown>;

function createMockInviteCode(payload: MockInvitePayload) {
  const encoded = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `mock-encrypted-code-${encoded}`;
}

async function acceptMockInvite(
  page: import('@playwright/test').Page,
  code: string,
  origin = '',
) {
  await page.goto(`${origin}/invite?code=${encodeURIComponent(code)}`);
  await page.waitForLoadState('domcontentloaded');

  await expect(page.getByRole('heading', { name: 'Connected!' })).toBeVisible({
    timeout: 15_000,
  });
  await page.waitForURL((url) => url.pathname === '/', { timeout: 10_000 });
}

async function readIndexedDbRecords<T extends IndexedDbRecord>(
  page: import('@playwright/test').Page,
  storeName: string,
): Promise<T[]> {
  return (await page.evaluate(
    (name) =>
      new Promise<IndexedDbRecord[]>((resolve, reject) => {
        const req = indexedDB.open('comapeo-cloud-app');
        req.onsuccess = () => {
          const db = req.result;
          try {
            if (!db.objectStoreNames.contains(name)) {
              resolve([]);
              db.close();
              return;
            }

            const tx = db.transaction(name, 'readonly');
            const store = tx.objectStore(name);
            const getAllReq = store.getAll();
            getAllReq.onsuccess = () => {
              resolve(getAllReq.result as IndexedDbRecord[]);
              db.close();
            };
            getAllReq.onerror = () => {
              db.close();
              reject(getAllReq.error);
            };
          } catch (err) {
            db.close();
            reject(err);
          }
        };
        req.onerror = () => reject(req.error);
      }),
    storeName,
  )) as T[];
}

function getStringField(record: IndexedDbRecord, field: string) {
  const value = record[field];
  return typeof value === 'string' ? value : null;
}

function getObjectField(record: IndexedDbRecord, field: string) {
  const value = record[field];
  return value && typeof value === 'object' ? (value as IndexedDbRecord) : null;
}

function getRemoteServerLocalId(server: IndexedDbRecord) {
  return getStringField(server, 'localId') ?? getStringField(server, 'id');
}

function getRemoteArchiveProjectServerLocalId(project: IndexedDbRecord) {
  const remoteArchive = getObjectField(project, 'remoteArchive');

  return (
    (remoteArchive &&
      (getStringField(remoteArchive, 'remoteServerLocalId') ??
        getStringField(remoteArchive, 'serverLocalId') ??
        getStringField(remoteArchive, 'serverId') ??
        getStringField(remoteArchive, 'remoteServerId'))) ??
    getStringField(project, 'remoteServerLocalId') ??
    getStringField(project, 'remoteArchiveServerLocalId') ??
    getStringField(project, 'serverLocalId') ??
    getStringField(project, 'remoteServerId') ??
    getStringField(project, 'sourceId')
  );
}

function getRemoteArchiveProjectRemoteId(project: IndexedDbRecord) {
  const remoteArchive = getObjectField(project, 'remoteArchive');

  return (
    (remoteArchive && getStringField(remoteArchive, 'remoteId')) ??
    getStringField(project, 'remoteId')
  );
}

function getNonDeletedRemoteArchiveProjectsForServer(
  projects: IndexedDbRecord[],
  serverLocalId: string,
) {
  return projects.filter((project) => {
    if (project.deleted === true) {
      return false;
    }

    return getRemoteArchiveProjectServerLocalId(project) === serverLocalId;
  });
}

async function chooseProjectForInvite(
  page: import('@playwright/test').Page,
  projectId: string,
) {
  const projectName = 'Test Project 1';

  await page.getByLabel('Specific project').click();

  const projectCombobox = page
    .getByRole('combobox', { name: /project/i })
    .first();
  await expect(projectCombobox).toBeVisible({ timeout: 10_000 });

  const projectValue = await projectCombobox
    .locator('option')
    .evaluateAll(
      (options, project) => {
        const projectOptions = options.filter(
          (candidate): candidate is HTMLOptionElement =>
            candidate instanceof HTMLOptionElement,
        );
        const option =
          projectOptions.find(
            (candidate) =>
              candidate.value === project.id ||
              Boolean(candidate.textContent?.includes(project.id)) ||
              Boolean(candidate.textContent?.includes(project.name)),
          ) ??
          projectOptions.find(
            (candidate) =>
              candidate.value.length > 0 &&
              !candidate.disabled &&
              !candidate.textContent?.match(/select/i),
          );

        return option instanceof HTMLOptionElement ? option.value : null;
      },
      { id: projectId, name: projectName },
    )
    .catch(() => null);

  if (projectValue) {
    await projectCombobox.selectOption(projectValue);
    return;
  }

  await projectCombobox.click();
  const projectMatcher = new RegExp(`${projectName}|${projectId}`, 'i');

  try {
    await page
      .getByRole('option', { name: projectMatcher })
      .first()
      .click({ timeout: 2_000 });
    return;
  } catch {
    // Fall through to text matching for non-listbox custom selects.
  }

  await page.getByText(projectMatcher).last().click({ timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Critical User Flow E2E Tests
// ---------------------------------------------------------------------------

test.describe('Critical User Flows', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockServer(page);
  });

  // -------------------------------------------------------------------------
  // Flow 1: Home → Data → Observations list
  // -------------------------------------------------------------------------
  test('user can navigate from home to data observations list', async ({
    page,
  }) => {
    await seedProjectWithObservations(page, 'Test Project');

    // Navigate to /data via the nav link
    await page.getByRole('link', { name: 'Data' }).click();
    await page.getByRole('button', { name: 'Switch to grid view' }).click();

    // Data heading visible
    await expect(
      page.getByRole('heading', { level: 1, name: 'Data' }),
    ).toBeVisible();

    // At least one observation card link visible
    await expect(
      page.locator('a[href^="/data/observations/"]').last(),
    ).toBeVisible();
  });

  async function openDataMapAtWidth(
    page: import('@playwright/test').Page,
    label: string,
    width: number,
  ) {
    await page.setViewportSize({ width: 1180, height: 900 });
    await seedProjectWithObservations(page, label);
    await page.getByRole('link', { name: 'Data' }).click();
    await page.setViewportSize({ width, height: 900 });
  }

  for (const width of [768, 1024, 1180]) {
    // Runs on every browser project — no WebGL dependency.
    test(`map controls remain clickable at ${width}px`, async ({ page }) => {
      await openDataMapAtWidth(page, `Map Controls ${width}`, width);

      const layerButton = page.getByTestId('basemap-switcher-trigger');
      await expect(layerButton).toBeVisible();
      await layerButton.click();
      await expect(page.getByRole('menuitemradio').first()).toBeVisible();
      await page.keyboard.press('Escape');
    });
  }

  // MapLibre requires WebGL; Playwright's bundled Firefox/WebKit have no
  // GL backend, so the attribution control is never created there.
  // Chromium (SwiftShader) still exercises this assertion. The skip is
  // the first statement so non-chromium runs are reported as skipped
  // accurately — this test has no assertions to run on those browsers.
  // Behavior is width-independent, so a single width is sufficient.
  test('map attribution control toggles compact view', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'MapLibre attribution control requires WebGL (unavailable in Playwright firefox/webkit)',
    );

    await openDataMapAtWidth(page, 'Map Attribution', 1180);

    const attributionControl = page.locator('.maplibregl-ctrl-attrib');
    const attributionButton = page.locator('.maplibregl-ctrl-attrib-button');
    await expect(attributionButton).toBeVisible();
    await expect(attributionControl).not.toHaveClass(/maplibregl-compact-show/);
    await attributionButton.click();
    await expect(attributionControl).toHaveClass(/maplibregl-compact-show/);
  });

  // -------------------------------------------------------------------------
  // Flow 2: Data → Observations → Observation Detail
  // -------------------------------------------------------------------------
  test('user can navigate from data to observation detail', async ({
    page,
  }) => {
    const projectLocalId = await seedProjectWithObservations(
      page,
      'Test Project',
    );

    // Navigate to /data via the nav link
    await page.getByRole('link', { name: 'Data' }).click();
    await page.getByRole('button', { name: 'Switch to grid view' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Data' }),
    ).toBeVisible();

    // Read the first observation's localId from IndexedDB
    const observationLocalId = await page.evaluate(
      (projectId) =>
        new Promise<string | null>((resolve, reject) => {
          const req = indexedDB.open('comapeo-cloud-app');
          req.onsuccess = () => {
            const db = req.result;
            try {
              const tx = db.transaction('observations', 'readonly');
              const idx = tx
                .objectStore('observations')
                .index('projectLocalId');
              const getReq = idx.getAll(projectId);
              getReq.onsuccess = () => {
                const first = getReq.result?.[0];
                resolve(first?.localId ?? null);
                db.close();
              };
              getReq.onerror = () => {
                db.close();
                reject(getReq.error);
              };
            } catch (err) {
              db.close();
              reject(err);
            }
          };
          req.onerror = () => reject(req.error);
        }),
      projectLocalId,
    );
    expect(observationLocalId).not.toBeNull();

    // Click the specific observation card matching the IndexedDB observation
    await page
      .locator(`a[href="/data/observations/${observationLocalId}"]`)
      .click();

    // Observation detail renders with h1 heading
    await expect(
      page.getByRole('heading', { level: 1, name: 'Observation' }),
    ).toBeVisible();

    // "Back to Data" link visible — arrow icon with "Data" label
    await expect(
      page.getByRole('link', { name: 'Data', exact: true }).last(),
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Flow 3: Alerts → Add Alert
  // -------------------------------------------------------------------------
  test('user can start inline alert creation and still use the full route', async ({
    page,
  }) => {
    await seedProjectWithObservations(page, 'Test Project');

    // Navigate to /alerts via the nav link
    await page.getByRole('link', { name: 'Alerts' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Alerts' }),
    ).toBeVisible();

    // "No alerts yet" is visible
    await expect(page.getByText(/no alerts yet/i)).toBeVisible();

    // Map-view creation opens inline without leaving Alerts.
    await page.getByRole('button', { name: /add alert/i }).click();
    const dialog = page.getByRole('dialog', { name: /create alert/i });
    await expect(dialog).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Alerts' }),
    ).toBeVisible();
    await expect(page.getByTestId('map-container')).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Point', exact: true }),
    ).toBeVisible();

    // Cancel restores browse mode; grid view still exposes the full-page route.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: /Switch to grid view/i }).click();
    await expect(
      page.getByRole('link', { name: /add alert/i }),
    ).toHaveAttribute('href', '/alerts/new');
  });

  // -------------------------------------------------------------------------
  // Flow 4: 404 Page
  // -------------------------------------------------------------------------
  test('non-existent route shows 404 page', async ({ page }) => {
    await page.goto('/nonexistent-page');
    await page.waitForLoadState('domcontentloaded');

    // Should show 404 heading
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible({
      timeout: 5_000,
    });

    // "Page not found" sub-heading
    await expect(
      page.getByRole('heading', { name: /page not found/i }),
    ).toBeVisible();

    // "Go to Home" button inside a Link
    await expect(
      page.getByRole('button', { name: /go to home/i }),
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Flow 5: Settings screen renders correctly
  // -------------------------------------------------------------------------
  test('settings screen renders correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // Settings heading should be visible
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible({
      timeout: 5_000,
    });

    // Backup section should be visible
    await expect(
      page.getByRole('button', { name: /export backup/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /import backup/i }),
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Flow 6: Generate encrypted invite from Settings (issue #8 regression)
  // -------------------------------------------------------------------------
  // Guards against regressing issue #8: invite URLs must not embed the
  // bearer token in cleartext. The server-side encrypt endpoint returns an
  // opaque code; the rendered URL must use ?code=... (no token=, no
  // raw token value).
  test('generating an invite from settings produces an opaque encrypted URL (issue #8)', async ({
    page,
  }) => {
    const ARCHIVE_URL = 'https://archive.example.com';
    const BEARER_TOKEN = 'super-secret-bearer-xyz-123';

    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible({
      timeout: 5_000,
    });

    // Fill the Generate Invite form
    await page.getByLabel('Remote Archive URL').fill(ARCHIVE_URL);
    await page.getByLabel('Bearer Token').fill(BEARER_TOKEN);
    await page.getByRole('button', { name: /generate invite/i }).click();

    // Results header appears once encrypt resolves
    await expect(page.getByRole('heading', { name: /^results$/i })).toBeVisible(
      { timeout: 5_000 },
    );

    // Capture the rendered invite URL from the DOM
    const inviteUrlEl = page.getByText(/\/invite\?code=/).first();
    await expect(inviteUrlEl).toBeVisible();
    const renderedUrl = (await inviteUrlEl.textContent())?.trim() ?? '';

    // Shape assertion: scheme://host/invite?code=<opaque>
    expect(renderedUrl).toMatch(/^https?:\/\/[^/]+\/invite\?code=[^&]+$/);

    // Regression guards for issue #8
    expect(renderedUrl).not.toContain('token=');
    expect(renderedUrl).not.toContain(BEARER_TOKEN);

    // Expiry caption is rendered
    await expect(page.getByText('Expires in 24 hours.')).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Flow 7: Accept invite via encrypted URL — full connection flow (PR #124 regression)
  // -------------------------------------------------------------------------
  test('accepting an encrypted invite completes the full connection flow', async ({
    page,
  }) => {
    const ARCHIVE_URL = 'https://archive.example.com';
    const BEARER_TOKEN = 'super-secret-bearer-xyz-123';

    // Generate a valid mock-encrypted code using the same encoding as the
    // mock server's /api/invites/encrypt handler.
    const payload = JSON.stringify({ url: ARCHIVE_URL, token: BEARER_TOKEN });
    const code = `mock-encrypted-code-${btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;

    // Navigate directly to the invite acceptance screen
    await page.goto(`/invite?code=${encodeURIComponent(code)}`);
    await page.waitForLoadState('domcontentloaded');

    // Verify the progress UI appears
    await expect(page.getByText('Connecting to archive...')).toBeVisible({
      timeout: 5_000,
    });

    // Wait for the flow to complete — on success the UI shows "Connected!"
    // and "Redirecting..." before navigating to home.
    await expect(page.getByRole('heading', { name: 'Connected!' })).toBeVisible(
      {
        timeout: 15_000,
      },
    );

    // Verify we end up on the home page after the redirect
    await page.waitForURL('/', { timeout: 10_000 });
  });

  // -------------------------------------------------------------------------
  // Flow 8: Project-scoped invite does not downgrade archive access (issue #237)
  // -------------------------------------------------------------------------
  test('project-scoped invite does not downgrade archive credentials and hydrates scoped projects (issue #237)', async ({
    page,
    browser,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium');

    const ARCHIVE_URL = 'https://archive.example.com';
    const BROAD_TOKEN = 'e2e-archive-wide-token';
    const SCOPED_TOKEN = 'cpat1.mock-project-token';
    const SCOPED_PROJECT_ID = 'test-project-id-1';

    const broadInviteCode = createMockInviteCode({
      url: ARCHIVE_URL,
      token: BROAD_TOKEN,
      scope: { type: 'archive' },
    });

    await acceptMockInvite(page, broadInviteCode);

    // Force a full navigation so the persisted broad remote server hydrates
    // before generating the scoped project invite from Settings.
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible({
      timeout: 5_000,
    });

    await chooseProjectForInvite(page, SCOPED_PROJECT_ID);
    await page.getByRole('button', { name: /generate invite/i }).click();

    await expect(page.getByRole('heading', { name: /^results$/i })).toBeVisible(
      { timeout: 5_000 },
    );

    const inviteUrlEl = page.getByText(/\/invite\?code=/).first();
    await expect(inviteUrlEl).toBeVisible();
    const renderedUrl = (await inviteUrlEl.textContent())?.trim() ?? '';

    expect(renderedUrl).toMatch(/^https?:\/\/[^/]+\/invite\?code=[^&]+$/);
    expect(renderedUrl).not.toContain('token=');
    expect(renderedUrl).not.toContain(BROAD_TOKEN);
    expect(renderedUrl).not.toContain(SCOPED_TOKEN);

    const scopedInviteCode = new URL(renderedUrl).searchParams.get('code');
    expect(scopedInviteCode).toBeTruthy();

    const broadServersBefore = await readIndexedDbRecords(
      page,
      'remoteServers',
    );
    expect(broadServersBefore).toHaveLength(1);
    expect(broadServersBefore[0]).toMatchObject({
      baseUrl: ARCHIVE_URL,
      token: BROAD_TOKEN,
      accessScope: { type: 'archive' },
    });

    await acceptMockInvite(page, scopedInviteCode ?? '');

    const broadServersAfter = await readIndexedDbRecords(page, 'remoteServers');
    expect(broadServersAfter).toHaveLength(1);
    expect(broadServersAfter[0]).toMatchObject({
      baseUrl: ARCHIVE_URL,
      token: BROAD_TOKEN,
      accessScope: { type: 'archive' },
    });

    const appOrigin = new URL(page.url()).origin;
    const freshContext = await browser.newContext();

    try {
      const freshPage = await freshContext.newPage();
      await setupMockServer(freshPage);
      await acceptMockInvite(freshPage, scopedInviteCode ?? '', appOrigin);

      await expect
        .poll(
          async () =>
            (await readIndexedDbRecords(freshPage, 'remoteServers')).length,
          { timeout: 10_000 },
        )
        .toBe(1);

      const scopedServers = await readIndexedDbRecords(
        freshPage,
        'remoteServers',
      );
      expect(scopedServers).toHaveLength(1);
      expect(scopedServers[0]).toMatchObject({
        baseUrl: ARCHIVE_URL,
        token: SCOPED_TOKEN,
        accessScope: { type: 'project', projectId: SCOPED_PROJECT_ID },
      });

      const scopedServerLocalId = getRemoteServerLocalId(
        scopedServers[0] ?? {},
      );
      expect(scopedServerLocalId).toBeTruthy();

      await expect
        .poll(
          async () => {
            const projects = await readIndexedDbRecords(freshPage, 'projects');
            return getNonDeletedRemoteArchiveProjectsForServer(
              projects,
              scopedServerLocalId ?? '',
            ).map(getRemoteArchiveProjectRemoteId);
          },
          { timeout: 15_000 },
        )
        .toEqual([SCOPED_PROJECT_ID]);
    } finally {
      await freshContext.close();
    }
  });
});
