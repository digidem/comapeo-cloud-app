import type { Page } from '@playwright/test';
import { alertsFixture } from '@tests/fixtures/alerts';
import { observationsFixture } from '@tests/fixtures/observations';
import { projectDetailFixture } from '@tests/fixtures/project-detail';
import { projectsFixture } from '@tests/fixtures/projects';
import { serverInfoFixture } from '@tests/fixtures/server-info';

/**
 * Registers Playwright route intercepts that return fixture data for all
 * known API endpoints. This allows E2E tests to run without a real backend.
 */
export async function setupMockServer(page: Page): Promise<void> {
  await page.route('**/info', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(serverInfoFixture),
    }),
  );

  await page.route('**/healthcheck', (route) => route.fulfill({ status: 200 }));

  await page.route('**/projects', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(projectsFixture),
    }),
  );

  // Per-project detail handler. Must be registered BEFORE the sub-route
  // handlers below because Playwright matches routes in order and
  // ** /projects/* is greedy — it would also match /projects/:id/observations.
  // Use route.fallback() so more specific handlers take priority.
  //
  // The pathname may be /projects/:id (direct, e.g. in vitest/Vitest mode)
  // or /api/projects/:id (proxied via Cloudflare Pages Functions / Vite
  // dev proxy).  The regex handles both so the handler never falls through
  // for a legitimate project-detail request.
  await page.route('**/projects/*', (route) => {
    const url = new URL(route.request().url());
    const isDetailEndpoint = /\/projects\/[^/]+$/.test(url.pathname);
    if (!isDetailEndpoint) {
      // Fall through to more specific handlers (observations, alerts, etc.)
      return route.fallback();
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(projectDetailFixture),
    });
  });

  await page.route('**/projects/*/observations', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(observationsFixture),
    }),
  );

  await page.route('**/projects/*/remoteDetectionAlerts', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(alertsFixture),
    }),
  );

  // Non-critical data types — empty responses so the sync doesn't waste
  // time waiting for unmocked routes to time out against the preview server.
  const EMPTY_ARRAY_RESPONSE = JSON.stringify({ data: [] });

  await page.route('**/projects/*/presets', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: EMPTY_ARRAY_RESPONSE,
    }),
  );

  await page.route('**/projects/*/tracks', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: EMPTY_ARRAY_RESPONSE,
    }),
  );

  await page.route('**/projects/*/fields', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: EMPTY_ARRAY_RESPONSE,
    }),
  );

  // ---------------------------------------------------------------------------
  // Attachment mock — returns 1x1 transparent PNG for any attachment URL.
  // The observation fixtures contain full absolute URLs like
  // https://example.com/projects/proj1/attachments/drive1/photo/img1
  // ---------------------------------------------------------------------------
  const TRANSPARENT_1X1_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    'base64',
  );
  await page.route('**/attachments/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: TRANSPARENT_1X1_PNG,
    }),
  );

  // ---------------------------------------------------------------------------
  // Invite endpoints (first-party Pages Functions)
  // ---------------------------------------------------------------------------
  // These mirror the MSW handlers in tests/mocks/handlers.ts so E2E tests
  // exercise the same invite flow without needing INVITE_KEY or a real
  // Pages Function runtime. The mock round-trips the body through a
  // base64url-encoded `mock-encrypted-code-...` token.
  await page.route('**/api/invites/encrypt', async (route) => {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(route.request().postData() ?? '{}');
    } catch {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'INVITE_BAD_JSON', message: 'Body must be JSON' },
        }),
      });
      return;
    }
    if (
      typeof body.url !== 'string' ||
      body.url.length === 0 ||
      typeof body.token !== 'string' ||
      body.token.length === 0
    ) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'INVITE_BAD_INPUT',
            message: 'url and token are required',
          },
        }),
      });
      return;
    }
    const json = JSON.stringify(body);
    const base64 = Buffer.from(json, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: `mock-encrypted-code-${base64}` }),
    });
  });

  await page.route('**/api/invites/decrypt', async (route) => {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(route.request().postData() ?? '{}');
    } catch {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'INVITE_BAD_JSON', message: 'Body must be JSON' },
        }),
      });
      return;
    }
    const code = body.code;
    if (typeof code !== 'string' || code.length === 0) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'INVITE_BAD_INPUT', message: 'code is required' },
        }),
      });
      return;
    }
    const prefix = 'mock-encrypted-code-';
    if (code.startsWith(prefix)) {
      const encoded = code.slice(prefix.length);
      try {
        const padLength = (4 - (encoded.length % 4)) % 4;
        const padded =
          encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLength);
        const json = Buffer.from(padded, 'base64').toString('utf8');
        const parsed = JSON.parse(json) as Record<string, unknown>;
        if (
          typeof parsed.url === 'string' &&
          typeof parsed.token === 'string'
        ) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ url: parsed.url, token: parsed.token }),
          });
          return;
        }
      } catch {
        // fall through to error response
      }
    }
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'INVITE_DECRYPT_FAILED',
          message: 'Invite code is invalid',
        },
      }),
    });
  });
}
