import type { Page } from '@playwright/test';
import { alertsFixture } from '@tests/fixtures/alerts';
import { observationsFixture } from '@tests/fixtures/observations';
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
}
