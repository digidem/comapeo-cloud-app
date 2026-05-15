/**
 * Tests for Sentry integration module.
 *
 * These tests verify the module's behavior when Sentry is disabled
 * (VITE_SENTRY_DSN not set). When enabled, the real Sentry SDK is
 * initialized — that path is tested via E2E/smoke tests.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactNode } from 'react';

// Mock @sentry/react before importing the module
vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({ name: 'BrowserTracing' })),
  ErrorBoundary: function MockErrorBoundary({
    children,
  }: {
    children: ReactNode;
  }) {
    return children;
  },
}));

describe('sentry module (no DSN)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('initSentry is a no-op when VITE_SENTRY_DSN is not set', async () => {
    // import.meta.env is read-only in vitest, but since the module
    // checks VITE_SENTRY_DSN at import time and it's undefined in tests,
    // initSentry should be a no-op
    const { initSentry } = await import('@/lib/sentry');
    expect(() => initSentry()).not.toThrow();
  });

  it('captureException is callable without error', async () => {
    const { captureException } = await import('@/lib/sentry');
    expect(() => captureException(new Error('test'))).not.toThrow();
  });

  it('addBreadcrumb is callable without error', async () => {
    const { addBreadcrumb } = await import('@/lib/sentry');
    expect(() =>
      addBreadcrumb({ category: 'test', message: 'hello' }),
    ).not.toThrow();
  });
});
