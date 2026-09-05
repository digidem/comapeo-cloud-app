/**
 * Sentry error tracking integration.
 *
 * Initialized only when `VITE_SENTRY_DSN` is set. Provides:
 * - Browser tracing
 * - Global onerror / unhandledrejection handlers (Sentry installs these)
 *
 * When no DSN is configured, all exports are no-ops.
 */
import * as Sentry from '@sentry/react';

import { sanitizeTelemetry } from './telemetry-redaction';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const APP_ORIGIN = import.meta.env.VITE_PUBLIC_APP_ORIGIN as string | undefined;
const RELEASE = import.meta.env.VITE_APP_RELEASE as string | undefined;
const APP_ENV = import.meta.env.VITE_APP_ENV as string | undefined;
// Cloudflare Pages serves PR previews and branch deploys on *.pages.dev; the
// production origin alone would silently drop those users' events. A custom
// origin (e.g. a PAGES_DOMAIN preview host) is ADDITIVE — the default Pages
// origin is always allowed.
const PAGES_DEV_ORIGIN = 'https://comapeo-cloud-app.pages.dev';
const EXTRA_PAGES_ORIGIN = import.meta.env.VITE_CF_PAGES_ORIGIN as
  string | undefined;

const isEnabled = Boolean(SENTRY_DSN);

function resolveEnvironment(): string {
  if (APP_ENV) return APP_ENV;
  if (!APP_ORIGIN) return 'unknown';
  // Treat `staging.` subdomains and PR-preview Cloudflare aliases as staging.
  if (/^https:\/\/(staging|preview)\b/i.test(APP_ORIGIN)) return 'staging';
  if (/\bstaging\./i.test(APP_ORIGIN)) return 'staging';
  return 'production';
}

function resolveAllowUrls(): string[] | null {
  const origins = [
    ...new Set(
      [APP_ORIGIN, PAGES_DEV_ORIGIN, EXTRA_PAGES_ORIGIN].filter(
        (origin): origin is string => Boolean(origin),
      ),
    ),
  ];
  return origins.length > 0 ? origins : null;
}

function isAutomatedBrowser(): boolean {
  // Playwright/WebDriver set `navigator.webdriver`. CI runs (visual regression,
  // E2E) otherwise leak sampled transactions even though `allowUrls` filters
  // their error events, so skip initialization there entirely.
  return typeof navigator !== 'undefined' && navigator.webdriver === true;
}

export function initSentry(): void {
  if (!isEnabled) {
    return;
  }

  if (isAutomatedBrowser()) {
    console.info(
      '[sentry] Skipping init: automated browser detected (navigator.webdriver).',
    );
    return;
  }

  const allowUrls = resolveAllowUrls();

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: resolveEnvironment(),
    release: RELEASE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend: (event) => sanitizeTelemetry(event),
    beforeBreadcrumb: (breadcrumb) => sanitizeTelemetry(breadcrumb),
    beforeSendTransaction: (event) => sanitizeTelemetry(event),
    beforeSendSpan: (span) => sanitizeTelemetry(span),
    // Only capture errors from known deploy origins. Omit the filter entirely
    // when none is configured; an empty array would silently drop everything.
    ...(allowUrls ? { allowUrls } : {}),
  });
}

/**
 * Capture an exception manually (no-op when Sentry is disabled).
 */
export function captureException(error: unknown): void {
  if (isEnabled) {
    Sentry.captureException(error);
  }
}

/**
 * Add a breadcrumb (no-op when Sentry is disabled).
 */
export function addBreadcrumb(breadcrumb: Sentry.Breadcrumb): void {
  if (isEnabled) {
    Sentry.addBreadcrumb(breadcrumb);
  }
}

export { Sentry };
