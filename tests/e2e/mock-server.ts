import type { Page, Route } from '@playwright/test';
import { alertsFixture } from '@tests/fixtures/alerts';
import { observationsFixture } from '@tests/fixtures/observations';
import { presetsFixture } from '@tests/fixtures/presets';
import { fieldsFixture } from '@tests/fixtures/presets';
import { projectDetailFixture } from '@tests/fixtures/project-detail';
import { projectsFixture } from '@tests/fixtures/projects';
import { serverInfoFixture } from '@tests/fixtures/server-info';

/**
 * Registers Playwright route intercepts that return fixture data for all
 * known API endpoints. This allows E2E tests to run without a real backend.
 */
export async function setupMockServer(page: Page): Promise<void> {
  const SCOPED_TOKEN = 'cpat1.mock-project-token';
  const SCOPED_PROJECT_ID = 'test-project-id-1';
  const getBearerToken = (route: Route) => {
    const authHeader = route.request().headers().authorization;
    return authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : null;
  };
  const scopedTokenCannotReadProject = (route: Route, projectId: string) =>
    getBearerToken(route) === SCOPED_TOKEN && projectId !== SCOPED_PROJECT_ID;
  const getProjectIdFromPath = (pathname: string) =>
    pathname.match(/\/projects\/([^/]+)/)?.[1] ?? '';

  await page.route('**/info', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(serverInfoFixture),
    }),
  );

  await page.route('**/healthcheck', (route) => route.fulfill({ status: 200 }));

  await page.route('**/projects', (route) => {
    const token = getBearerToken(route);
    if (!token) {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'UNAUTHORIZED', message: 'Invalid bearer token' },
        }),
      });
    }

    const projects =
      token === SCOPED_TOKEN
        ? projectsFixture.data.filter(
            (project) => project.projectId === SCOPED_PROJECT_ID,
          )
        : projectsFixture.data;

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: projects }),
    });
  });

  await page.route('**/projects/*/accessTokens', (route) => {
    const token = getBearerToken(route);
    if (!token) {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'UNAUTHORIZED', message: 'Invalid bearer token' },
        }),
      });
    }
    if (token === SCOPED_TOKEN) {
      return route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'FORBIDDEN', message: 'Archive token required' },
        }),
      });
    }

    const url = new URL(route.request().url());
    const match = url.pathname.match(/\/projects\/([^/]+)\/accessTokens$/);
    const projectId = match?.[1] ? decodeURIComponent(match[1]) : '';
    if (!projectId) {
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'NOT_FOUND', message: 'Project not found' },
        }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { token: 'cpat1.mock-project-token', projectId },
      }),
    });
  });

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
    const projectId = decodeURIComponent(getProjectIdFromPath(url.pathname));
    if (scopedTokenCannotReadProject(route, projectId)) {
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'NOT_FOUND', message: 'Project not found' },
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(projectDetailFixture),
    });
  });

  await page.route('**/projects/*/observations', (route) => {
    const url = new URL(route.request().url());
    const projectId = decodeURIComponent(getProjectIdFromPath(url.pathname));
    if (scopedTokenCannotReadProject(route, projectId)) {
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'NOT_FOUND', message: 'Project not found' },
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(observationsFixture),
    });
  });

  await page.route('**/projects/*/remoteDetectionAlerts', (route) => {
    const url = new URL(route.request().url());
    const projectId = decodeURIComponent(getProjectIdFromPath(url.pathname));
    if (scopedTokenCannotReadProject(route, projectId)) {
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'NOT_FOUND', message: 'Project not found' },
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(alertsFixture),
    });
  });

  // Preset and field routes — registered BEFORE the catch-all projects/*
  // handler below so Playwright matches them first (route precedence is
  // registration order). Patterns use singular forms matching the actual
  // apiClient endpoints (/preset, /field).
  await page.route('**/projects/*/preset', (route) => {
    const url = new URL(route.request().url());
    const projectId = decodeURIComponent(getProjectIdFromPath(url.pathname));
    if (scopedTokenCannotReadProject(route, projectId)) {
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'NOT_FOUND', message: 'Project not found' },
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(presetsFixture),
    });
  });

  await page.route('**/projects/*/field', (route) => {
    const url = new URL(route.request().url());
    const projectId = decodeURIComponent(getProjectIdFromPath(url.pathname));
    if (scopedTokenCannotReadProject(route, projectId)) {
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'NOT_FOUND', message: 'Project not found' },
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fieldsFixture),
    });
  });

  // Icon route — returns SVG for category icon images fetched by AuthImg.
  // This must be registered before the empty-array routes below.
  await page.route('**/projects/*/icon/*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="red"/></svg>',
    }),
  );

  // Non-critical data types — empty responses so the sync doesn't waste
  // time waiting for unmocked routes to time out against the preview server.
  const EMPTY_ARRAY_RESPONSE = JSON.stringify({ data: [] });

  await page.route('**/projects/*/tracks', (route) => {
    const url = new URL(route.request().url());
    const projectId = decodeURIComponent(getProjectIdFromPath(url.pathname));
    if (scopedTokenCannotReadProject(route, projectId)) {
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'NOT_FOUND', message: 'Project not found' },
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: EMPTY_ARRAY_RESPONSE,
    });
  });

  await page.route('**/projects/*/track', (route) => {
    const url = new URL(route.request().url());
    const projectId = decodeURIComponent(getProjectIdFromPath(url.pathname));
    if (scopedTokenCannotReadProject(route, projectId)) {
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'NOT_FOUND', message: 'Project not found' },
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: EMPTY_ARRAY_RESPONSE,
    });
  });

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
          const responseBody: Record<string, unknown> = {
            url: parsed.url,
            token: parsed.token,
          };
          if ('scope' in parsed) {
            responseBody.scope = parsed.scope;
          }
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(responseBody),
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
