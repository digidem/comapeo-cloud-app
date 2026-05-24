import { argosScreenshot } from '@argos-ci/playwright';
import type { Page } from '@playwright/test';

/** Standard viewport sizes for visual review. */
export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 375, height: 812 },
} as const;

export type ViewportName = keyof typeof VIEWPORTS;

/** Theme IDs for multi-theme screenshot generation. */
export const THEME_IDS = ['cloud', 'mobile', 'sentinel'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/**
 * Sets the theme by writing to localStorage and reloading.
 * The theme store (Zustand persist) reads from localStorage on init,
 * so a reload applies the new theme class to <html>.
 */
export async function setTheme(page: Page, themeId: ThemeId): Promise<void> {
  await page.evaluate((id) => {
    const stored = localStorage.getItem('comapeo-theme');
    const parsed = stored ? JSON.parse(stored) : {};
    parsed.state = { ...parsed.state, theme: id };
    localStorage.setItem('comapeo-theme', JSON.stringify(parsed));
  }, themeId);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
}

/**
 * Captures a full-page screenshot and uploads to Argos CI for visual diffing.
 *
 * @param page - Playwright Page instance
 * @param name - Screenshot name for Argos (e.g. "home-cloud-desktop")
 */
export async function takeScreenshot(
  page: Page,
  name: string,
  _viewport?: ViewportName,
): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(() => document.fonts.ready);

  await argosScreenshot(page, name, {
    fullPage: true,
  });
}
