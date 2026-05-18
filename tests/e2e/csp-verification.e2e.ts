import { expect, test } from '@playwright/test';

import { setupMockServer } from './mock-server';

// TODO: rewrite for the post-refactor routing and replace waitForTimeout()
// calls with deterministic waits. Also attach a `securitypolicyviolation`
// listener instead of grepping console errors, which only catches Chrome's
// console reporting of CSP failures.
test.describe.skip('CSP Runtime Verification', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockServer(page);
  });

  test('app boots and renders without CSP violations', async ({ page }) => {
    const cspViolations: string[] = [];

    page.on('console', (msg) => {
      if (
        msg.type() === 'error' &&
        msg.text().includes('Content Security Policy')
      ) {
        cspViolations.push(msg.text());
      }
    });

    await page.goto('/');

    // App should render the main heading or some content
    await expect(page.locator('body')).toBeVisible();

    // Navigate to dashboard
    await page.goto('/dashboard');
    await expect(page.locator('body')).toBeVisible();

    // Check for CSP violations
    expect(cspViolations).toHaveLength(0);
  });

  test('route navigation works across all screens', async ({ page }) => {
    // Home
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();

    // Dashboard
    await page.goto('/dashboard');
    await expect(page.locator('body')).toBeVisible();

    // Projects
    await page.goto('/projects');
    await expect(page.locator('body')).toBeVisible();

    // Project detail
    await page.goto('/projects/test-project');
    await expect(page.locator('body')).toBeVisible();

    // Observations
    await page.goto('/projects/test-project/observations');
    await expect(page.locator('body')).toBeVisible();

    // Alerts
    await page.goto('/projects/test-project/alerts');
    await expect(page.locator('body')).toBeVisible();

    // Settings
    await page.goto('/settings');
    await expect(page.locator('body')).toBeVisible();
  });

  test('API proxy rejects requests without x-target-url header', async ({
    page,
  }) => {
    const response = await page.request.get('/api/info');
    // Should get 400 because no x-target-url header
    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('ARCHIVE_PROXY_BAD_TARGET');
  });

  test('API proxy succeeds with valid x-target-url header', async ({
    page,
  }) => {
    const response = await page.request.get('/api/info', {
      headers: {
        'x-target-url': 'https://archive.example.com',
      },
    });

    // Should get 200 because mock server intercepts the route
    expect(response.status()).toBe(200);
  });

  test('service worker registration does not cause CSP errors', async ({
    page,
  }) => {
    const swErrors: string[] = [];

    page.on('console', (msg) => {
      const text = msg.text();
      if (
        msg.type() === 'error' &&
        (text.includes('Service Worker') || text.includes('service worker')) &&
        text.includes('Content Security Policy')
      ) {
        swErrors.push(text);
      }
    });

    await page.goto('/');

    // Wait for potential SW registration
    await page.waitForTimeout(2000);

    expect(swErrors).toHaveLength(0);
  });

  test('no console errors on main routes', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    const routes = ['/', '/dashboard', '/projects', '/settings'];

    for (const route of routes) {
      await page.goto(route);
      await page.waitForTimeout(500);
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
