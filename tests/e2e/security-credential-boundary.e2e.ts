import { type Page, expect, test } from '@playwright/test';

import { setupMockServer } from './mock-server';

async function addArchiveWithToken(
  page: Page,
  baseUrl: string,
  token: string,
): Promise<void> {
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Add server' })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.getByTestId('advanced-toggle').click();
  await page.getByLabel('Server URL').fill(baseUrl);
  await page.getByLabel('Bearer Token').fill(token);
  await dialog.getByRole('button', { name: /^add$/i }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}

async function openArchiveDetails(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Archive actions' }).first().click();
  await page.getByRole('button', { name: 'View Details' }).click();
}

async function reconnectWithToken(page: Page, token: string): Promise<void> {
  await openArchiveDetails(page);
  await page
    .getByRole('button', { name: /^reconnect$/i })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: /reconnect archive/i });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Bearer Token').fill(token);
  await dialog.getByRole('button', { name: /^reconnect$/i }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}

async function serializeApplicationManagedStorage(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const snapshot: Record<string, unknown> = {
      localStorage: Object.fromEntries(
        Array.from({ length: localStorage.length }, (_, index) => {
          const key = localStorage.key(index)!;
          return [key, localStorage.getItem(key)];
        }),
      ),
      sessionStorage: Object.fromEntries(
        Array.from({ length: sessionStorage.length }, (_, index) => {
          const key = sessionStorage.key(index)!;
          return [key, sessionStorage.getItem(key)];
        }),
      ),
      indexedDb: {},
      caches: {},
    };

    const indexedDbSnapshot = snapshot.indexedDb as Record<string, unknown>;
    for (const descriptor of await indexedDB.databases()) {
      if (!descriptor.name) continue;
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(descriptor.name!);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      const stores: Record<string, unknown> = {};
      for (const storeName of Array.from(database.objectStoreNames)) {
        const transaction = database.transaction(storeName, 'readonly');
        const values = await new Promise<unknown[]>((resolve, reject) => {
          const request = transaction.objectStore(storeName).getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result as unknown[]);
        });
        stores[storeName] = values;
      }
      database.close();
      indexedDbSnapshot[descriptor.name] = stores;
    }

    const cacheSnapshot = snapshot.caches as Record<string, unknown>;
    for (const cacheName of await caches.keys()) {
      const cache = await caches.open(cacheName);
      cacheSnapshot[cacheName] = await Promise.all(
        (await cache.keys()).map(async (request) => ({
          url: request.url,
          authorization: request.headers.get('authorization'),
        })),
      );
    }

    return JSON.stringify(snapshot);
  });
}

test.describe('runtime-only archive credential boundary', () => {
  // This suite exercises the app/runtime boundary with Playwright request mocks.
  // Service-worker behavior is covered separately because Playwright page.route
  // cannot reliably intercept requests handled by an active service worker.
  test.use({ serviceWorkers: 'block' });

  test.beforeEach(async ({ page }) => {
    await setupMockServer(page);
  });

  test('connects without persistence, reloads locked on local routes, reconnects, and stays isolated per tab', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    const canary = `e2e-credential-${Date.now()}`;
    const archiveUrl = 'https://archive.example.com';

    await page.goto('/');
    await addArchiveWithToken(page, archiveUrl, canary);

    expect(await serializeApplicationManagedStorage(page)).not.toContain(
      canary,
    );

    const authRequestsAfterReload: string[] = [];
    page.on('request', (request) => {
      if (request.headers()['authorization']?.includes(canary)) {
        authRequestsAfterReload.push(request.url());
      }
    });

    await page.goto('/data');
    await expect(page).toHaveURL(/\/data$/);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Data' })).toBeVisible();
    await page.waitForTimeout(500);
    expect(authRequestsAfterReload).toEqual([]);
    expect(await serializeApplicationManagedStorage(page)).not.toContain(
      canary,
    );

    await page.goto('/');
    await reconnectWithToken(page, canary);
    expect(await serializeApplicationManagedStorage(page)).not.toContain(
      canary,
    );

    const secondTab = await context.newPage();
    await setupMockServer(secondTab);
    await secondTab.goto('/');
    await openArchiveDetails(secondTab);
    await expect(
      secondTab.getByRole('button', { name: /^reconnect$/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^reconnect$/i }).first(),
    ).toHaveCount(0);
    expect(await serializeApplicationManagedStorage(secondTab)).not.toContain(
      canary,
    );
    await secondTab.close();
  });

  test('requires explicit approval before an HTTP archive receives a credential', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const canary = `e2e-http-${Date.now()}`;
    const targetUrl = 'http://legacy-archive.example.com';
    const credentialRequests: string[] = [];
    page.on('request', (request) => {
      if (
        request.headers()['authorization']?.includes(canary) ||
        request.headers()['x-comapeo-archive-target'] === targetUrl
      ) {
        credentialRequests.push(request.url());
      }
    });

    await page.goto('/');
    await page
      .getByRole('main')
      .getByRole('button', { name: 'Add server' })
      .click();
    const dialog = page.getByRole('dialog');
    await page.getByTestId('advanced-toggle').click();
    await page.getByLabel('Server URL').fill(targetUrl);
    await page.getByLabel('Bearer Token').fill(canary);
    await dialog.getByRole('button', { name: /^add$/i }).click();

    const warning = page.getByRole('alertdialog', {
      name: /insecure archive connection/i,
    });
    await expect(warning).toBeVisible();
    expect(credentialRequests).toEqual([]);
    await warning.getByRole('button', { name: /^cancel$/i }).click();
    expect(credentialRequests).toEqual([]);
    expect(await serializeApplicationManagedStorage(page)).not.toContain(
      canary,
    );
  });
});
