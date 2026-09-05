import { type BrowserContext, type Page, expect, test } from '@playwright/test';

import { setupMockServer } from './mock-server';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function createLocalProject(page: Page, name: string) {
  await page
    .getByRole('button', { name: /^Create (your first )?project$/i })
    .first()
    .click();
  await page.getByLabel('Project Name').fill(name);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Create', exact: true })
    .click();
  await expect(page.locator('h2', { hasText: name })).toBeVisible();
}

async function uploadLogo(page: Page) {
  await page.getByLabel('Upload logo').setInputFiles({
    name: 'organization-logo.png',
    mimeType: 'image/png',
    buffer: ONE_PIXEL_PNG,
  });
  await expect(page.getByText('Report logo configured')).toBeVisible();
}

async function verifyPersistedBranding(page: Page, organizationName: string) {
  await page.getByRole('button', { name: 'Report branding' }).click();
  await expect(
    page.getByRole('textbox', { name: 'Organization name' }),
  ).toHaveValue(organizationName);
  await expect(page.getByText('Report logo configured')).toBeVisible();
}

async function restoreOnline(context: BrowserContext) {
  await context.setOffline(false).catch(() => undefined);
}

test('report branding can be configured and reopened at 1440×900', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setupMockServer(page);
  await page.goto('/');
  await createLocalProject(page, 'Desktop Forest Project');

  await page.getByRole('button', { name: 'Report branding' }).click();
  const organizationName = page.getByRole('textbox', {
    name: 'Organization name',
  });
  await expect(organizationName).toHaveValue('Desktop Forest Project');
  await organizationName.fill('Forest Guardians Association');
  await uploadLogo(page);
  await page.getByRole('button', { name: 'Save branding' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Report branding' }),
  ).toBeHidden();

  await verifyPersistedBranding(page, 'Forest Guardians Association');
});

test('report branding remains usable offline at 375×812 without horizontal overflow', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await setupMockServer(page);
  await page.goto('/');
  await createLocalProject(page, 'Mobile Forest Project');

  await context.setOffline(true);
  try {
    await page.getByRole('button', { name: 'Report branding' }).click();
    const dialog = page.getByRole('dialog', { name: 'Report branding' });
    await expect(dialog).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Save branding' }),
    ).toBeVisible();

    const organizationName = page.getByRole('textbox', {
      name: 'Organization name',
    });
    await organizationName.fill('Offline Forest Association');
    await uploadLogo(page);
    await page.getByRole('button', { name: 'Save branding' }).click();
    await expect(dialog).toBeHidden();

    const scrollMetrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(scrollMetrics.scrollWidth).toBeLessThanOrEqual(
      scrollMetrics.clientWidth,
    );

    await verifyPersistedBranding(page, 'Offline Forest Association');
  } finally {
    await restoreOnline(context);
  }
});
