import {
  type APIRequestContext,
  type Page,
  expect,
  test,
} from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4174';

function makeInviteCode(url: string, token: string): string {
  return `e2e-${Buffer.from(JSON.stringify({ url, token }), 'utf8').toString('base64url')}`;
}

async function setSecureWorkerAvailable(
  request: APIRequestContext,
  available: boolean,
): Promise<void> {
  await request.get(
    `${BASE_URL}/__security_e2e__/worker?allow=${available ? '1' : '0'}`,
  );
}

async function clearApiRequests(request: APIRequestContext): Promise<void> {
  await request.get(`${BASE_URL}/__security_e2e__/requests/clear`);
}

async function readApiRequests(request: APIRequestContext): Promise<string> {
  const response = await request.get(`${BASE_URL}/__security_e2e__/requests`);
  return JSON.stringify(await response.json());
}

async function installLegacyWorker(page: Page): Promise<void> {
  await page.goto('/__security_e2e__/blank');
  await page.evaluate(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map((registration) => registration.unregister()),
    );
    await navigator.serviceWorker.register('/legacy-sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? ''),
    )
    .toContain('/legacy-sw.js');
}

async function addArchiveWithToken(
  page: Page,
  baseUrl: string,
  token: string,
): Promise<void> {
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Add server' })
    .click();
  const dialog = page.getByRole('dialog', { name: /add archive server/i });
  await page.getByTestId('advanced-toggle').click();
  await dialog.getByLabel('Server URL').fill(baseUrl);
  await dialog.getByLabel('Bearer Token').fill(token);
  await dialog.getByRole('button', { name: /^add$/i }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}

async function serializePersistentSecuritySurfaces(
  page: Page,
): Promise<string> {
  return page.evaluate(async () => {
    const snapshot: Record<string, unknown> = {
      location:
        window.location.pathname +
        window.location.search +
        window.location.hash,
      historyState: history.state,
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
      databases: {},
      caches: {},
      workerMessages:
        (window as unknown as { __securityE2eWorkerMessages?: unknown[] })
          .__securityE2eWorkerMessages ?? [],
    };

    const databases = snapshot.databases as Record<string, unknown>;
    for (const descriptor of await indexedDB.databases()) {
      if (!descriptor.name) continue;
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const openRequest = indexedDB.open(descriptor.name!);
        openRequest.onerror = () => reject(openRequest.error);
        openRequest.onsuccess = () => resolve(openRequest.result);
      });
      const stores: Record<string, unknown> = {};
      for (const storeName of Array.from(database.objectStoreNames)) {
        const transaction = database.transaction(storeName, 'readonly');
        const values = await new Promise<unknown[]>((resolve, reject) => {
          const readRequest = transaction.objectStore(storeName).getAll();
          readRequest.onerror = () => reject(readRequest.error);
          readRequest.onsuccess = () =>
            resolve(readRequest.result as unknown[]);
        });
        stores[storeName] = values;
      }
      database.close();
      databases[descriptor.name] = stores;
    }

    const cacheSnapshot = snapshot.caches as Record<string, unknown>;
    for (const cacheName of await caches.keys()) {
      const cache = await caches.open(cacheName);
      cacheSnapshot[cacheName] = await Promise.all(
        (await cache.keys()).map((cachedRequest) => ({
          url: cachedRequest.url,
          authorization: cachedRequest.headers.get('authorization'),
        })),
      );
    }

    return JSON.stringify(snapshot);
  });
}

async function seedLegacyCredentialCache(
  page: Page,
  canary: string,
): Promise<void> {
  await page.evaluate(async (secret) => {
    const cache = await caches.open('remote-api-cache');
    const request = new Request('/api/legacy?code=legacy-invite-canary', {
      headers: { Authorization: `Bearer ${secret}` },
    });
    await cache.put(request, new Response('{}', { status: 200 }));
  }, canary);
}

async function readStartupState(page: Page): Promise<string | undefined> {
  return page.evaluate(
    () => document.documentElement.dataset.comapeoSecurityStartup,
  );
}

test.beforeEach(async ({ page, request }) => {
  await setSecureWorkerAvailable(request, true);
  await clearApiRequests(request);
  await page.addInitScript(() => {
    const messages: unknown[] = [];
    Object.defineProperty(window, '__securityE2eWorkerMessages', {
      value: messages,
      configurable: false,
      enumerable: false,
      writable: false,
    });
    navigator.serviceWorker?.addEventListener('message', (event) => {
      messages.push(event.data);
    });
  });
});

test('served production build sanitizes an encrypted invite before app bootstrap and keeps secrets out of persistent/SW surfaces', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const probeValue = String(Date.now()) + '-238';
  const fragmentCanary = `prod-fragment-${Date.now()}`;
  const code = makeInviteCode('https://archive.example.com', probeValue);
  const consoleMessages: string[] = [];
  page.on('console', (message) => consoleMessages.push(message.text()));

  await page.goto(`/invite?code=${encodeURIComponent(code)}#${fragmentCanary}`);

  await expect.poll(() => new URL(page.url()).pathname).toBe('/invite');
  await expect.poll(() => new URL(page.url()).search).toBe('');
  await expect.poll(() => new URL(page.url()).hash).toBe('');
  await expect(page.getByText('Connected!')).toBeVisible({ timeout: 30_000 });

  const snapshot = await serializePersistentSecuritySurfaces(page);
  expect(snapshot).not.toContain(probeValue);
  expect(snapshot).not.toContain(code);
  expect(snapshot).not.toContain(fragmentCanary);
  expect(consoleMessages.join('\n')).not.toContain(probeValue);
  expect(consoleMessages.join('\n')).not.toContain(code);

  await expect
    .poll(() =>
      page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? ''),
    )
    .toContain('/sw.js');
  expect(await readApiRequests(request)).toContain('/api/invites/decrypt');
});

test('old controller blocks credential entry until secure takeover, removes legacy credential cache, then reaches ready without caching the token', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const blockedCanary = `blocked-token-${Date.now()}`;
  const readyCanary = `ready-token-${Date.now()}`;

  await setSecureWorkerAvailable(request, false);
  await installLegacyWorker(page);
  await seedLegacyCredentialCache(page, blockedCanary);
  await clearApiRequests(request);

  let navigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations += 1;
  });
  await page.goto('/');

  await expect
    .poll(() => readStartupState(page))
    .toBe('worker-transition-required');
  await expect(page.getByText(/security update required/i)).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => caches.has('remote-api-cache')))
    .toBe(false);

  await page
    .getByRole('main')
    .getByRole('button', { name: 'Add server' })
    .click();
  const blockedDialog = page.getByRole('dialog', {
    name: /add archive server/i,
  });
  await page.getByTestId('advanced-toggle').click();
  await blockedDialog
    .getByLabel('Server URL')
    .fill('https://archive.example.com');
  await blockedDialog.getByLabel('Bearer Token').fill(blockedCanary);
  await blockedDialog.getByRole('button', { name: /^add$/i }).click();
  await expect(blockedDialog.getByText('Failed to add server')).toBeVisible();
  expect(await readApiRequests(request)).not.toContain(blockedCanary);
  expect(await serializePersistentSecuritySurfaces(page)).not.toContain(
    blockedCanary,
  );

  await setSecureWorkerAvailable(request, true);
  await page.reload();
  await expect
    .poll(() => readStartupState(page), { timeout: 30_000 })
    .toBe('ready');
  await expect
    .poll(() =>
      page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? ''),
    )
    .toContain('/sw.js');

  const navigationCountAtReady = navigations;
  await page.waitForTimeout(1500);
  expect(navigations).toBe(navigationCountAtReady);

  await addArchiveWithToken(page, 'https://archive.example.com', readyCanary);
  const readySnapshot = await serializePersistentSecuritySurfaces(page);
  expect(readySnapshot).not.toContain(readyCanary);
  expect(readySnapshot).not.toContain(blockedCanary);
  expect(await readApiRequests(request)).toContain(readyCanary);

  const marks = await page.evaluate(() =>
    performance
      .getEntriesByType('mark')
      .filter((entry) => entry.name.startsWith('comapeo-security-preflight-'))
      .map((entry) => ({ name: entry.name, startTime: entry.startTime })),
  );
  console.log('[security-production] preflight marks', JSON.stringify(marks));
});

test('offline old-worker transition keeps the local shell usable and does not reload-loop', async ({
  page,
  request,
  context,
}) => {
  test.setTimeout(90_000);
  await setSecureWorkerAvailable(request, false);
  await installLegacyWorker(page);

  let navigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations += 1;
  });
  await context.setOffline(true);
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect
      .poll(() => readStartupState(page))
      .toBe('worker-transition-required');
    await expect(page.getByText(/security update required/i)).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    const stableNavigationCount = navigations;
    await page.waitForTimeout(2500);
    expect(navigations).toBe(stableNavigationCount);
  } finally {
    await context.setOffline(false);
  }
});
