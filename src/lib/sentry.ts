/**
 * Sentry error tracking integration.
 *
 * Initialized only when `VITE_SENTRY_DSN` is set. Provides:
 * - React error boundary integration
 * - Browser tracing
 * - Global onerror / unhandledrejection handlers (Sentry installs these)
 *
 * When no DSN is configured, all exports are no-ops.
 */
import * as Sentry from '@sentry/react';

import { Component, type ErrorInfo, type ReactNode } from 'react';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const APP_ORIGIN = import.meta.env.VITE_PUBLIC_APP_ORIGIN as string | undefined;
const RELEASE = import.meta.env.VITE_APP_RELEASE as string | undefined;
const APP_ENV = import.meta.env.VITE_APP_ENV as string | undefined;

const isEnabled = Boolean(SENTRY_DSN);

function resolveEnvironment(): string {
  if (APP_ENV) return APP_ENV;
  if (!APP_ORIGIN) return 'unknown';
  // Treat `staging.` subdomains and PR-preview Cloudflare aliases as staging.
  if (/^https:\/\/(staging|preview)\b/i.test(APP_ORIGIN)) return 'staging';
  if (/\bstaging\./i.test(APP_ORIGIN)) return 'staging';
  return 'production';
}

export function initSentry(): void {
  if (!isEnabled) {
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: resolveEnvironment(),
    release: RELEASE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    // Only capture errors from the app origin. Omit the filter entirely when
    // no origin is configured; an empty array would silently drop everything.
    ...(APP_ORIGIN ? { allowUrls: [APP_ORIGIN] } : {}),
  });
}

interface FallbackErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

class FallbackErrorBoundary extends Component<
  FallbackErrorBoundaryProps,
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[FallbackErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}

/**
 * Sentry Error Boundary component wrapper.
 * Returns the Sentry.ErrorBoundary when enabled; otherwise a minimal local
 * boundary that still renders `fallback` on error.
 */
export const ErrorBoundary = isEnabled
  ? Sentry.ErrorBoundary
  : FallbackErrorBoundary;

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
