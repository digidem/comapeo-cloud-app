import type { Page, PageScreenshotOptions } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the screenshot output directory. */
export const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots');

/** Standard viewport sizes for visual review. */
export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 375, height: 812 },
} as const;

export type ViewportName = keyof typeof VIEWPORTS;

/**
 * Captures a full-page screenshot after waiting for fonts and network idle.
 *
 * @param page - Playwright Page instance
 * @param name - File name without extension (e.g. "home")
 * @param viewport - Which viewport subdirectory to save into
 * @param options - Additional Playwright screenshot options
 */
export async function takeScreenshot(
  page: Page,
  name: string,
  viewport: ViewportName,
  options?: PageScreenshotOptions,
): Promise<Buffer> {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);

  const dir = path.join(SCREENSHOT_DIR, viewport);

  const { mkdir } = await import('node:fs/promises');
  await mkdir(dir, { recursive: true });

  const filePath = path.join(dir, `${name}.png`);

  return page.screenshot({
    path: filePath,
    fullPage: true,
    ...options,
  });
}
