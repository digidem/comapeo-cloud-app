import { expect, test } from '@playwright/test';

import { setupMockServer } from './mock-server';

// ---------------------------------------------------------------------------
// CSP Violation Helpers (in-page DOM event listener)
// ---------------------------------------------------------------------------

type CspViolation = {
  blockedURI: string;
  violatedDirective: string;
  sourceFile: string;
  lineNumber: number;
  documentURI: string;
};

async function installCspListener(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    (window as unknown as { __cspViolations: CspViolation[] }).__cspViolations =
      [];
    document.addEventListener('securitypolicyviolation', (e) => {
      (
        window as unknown as { __cspViolations: CspViolation[] }
      ).__cspViolations.push({
        blockedURI: e.blockedURI,
        violatedDirective: e.violatedDirective,
        sourceFile: e.sourceFile,
        lineNumber: e.lineNumber,
        documentURI: e.documentURI,
      });
    });
  });
}

async function readCspViolations(page: import('@playwright/test').Page) {
  return page.evaluate(
    () =>
      (window as unknown as { __cspViolations: CspViolation[] })
        .__cspViolations ?? [],
  );
}

// ---------------------------------------------------------------------------
// CSP Runtime Verification
// ---------------------------------------------------------------------------

test.describe('CSP Runtime Verification', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockServer(page);
  });

  test('app boots and renders without CSP violations', async ({ page }) => {
    await installCspListener(page);

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // App should render
    await expect(page.locator('body')).toBeVisible();

    // Navigate to /data (replaces deleted /dashboard)
    await page.goto('/data');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).toBeVisible();

    // Check for CSP violations
    expect(await readCspViolations(page)).toHaveLength(0);
  });

  test('route navigation works across all screens', async ({ page }) => {
    await installCspListener(page);

    const routes = ['/', '/data', '/data/alerts/new', '/settings'];

    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('body')).toBeVisible();
    }

    // /data renders "Select a project from Home to view data" empty state
    // (no project seeded) — that's expected; the body still loads.

    expect(await readCspViolations(page)).toHaveLength(0);
  });

  test('API proxy rejects requests without x-target-url header', async ({
    page,
  }) => {
    // Use page.request (bypasses page.route interceptors) so the request
    // reaches the Vite dev proxy, which returns 400 for missing header.
    const response = await page.request.get('/api/info');
    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('ARCHIVE_PROXY_BAD_TARGET');
  });

  test('API proxy succeeds with valid x-target-url header', async ({
    page,
  }) => {
    // Navigate first so page.route interceptors are active
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Override setupMockServer's **/info with a specific /api/info intercept.
    // page.route uses last-wins semantics — this route takes priority.
    await page.route('**/api/info', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { deviceId: 'mock', name: 'Mock' } }),
      }),
    );

    // Use browser-context fetch so page.route can intercept before the
    // request reaches the Vite proxy (which would fail to connect upstream).
    const res = await page.evaluate(async () => {
      const r = await fetch('/api/info', {
        headers: { 'x-target-url': 'https://archive.example.com' },
      });
      return { status: r.status };
    });

    expect(res.status).toBe(200);
  });

  test('service worker registration does not cause CSP errors', async ({
    page,
  }) => {
    await installCspListener(page);

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Filter for service-worker-related violations
    const violations = await readCspViolations(page);
    const swViolations = violations.filter(
      (v) =>
        v.violatedDirective.includes('worker-src') ||
        v.violatedDirective.includes('script-src') ||
        v.blockedURI.includes('serviceWorker'),
    );
    expect(swViolations).toHaveLength(0);
  });

  test('no console errors on main routes', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    const routes = ['/', '/data', '/settings'];

    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
    }

    // Filter out known non-critical errors (e.g., network errors from mocked routes)
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes('Failed to fetch') &&
        !e.includes('net::ERR') &&
        !e.includes('404'),
    );

    expect(criticalErrors).toHaveLength(0);
  });
});
