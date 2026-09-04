/**
 * Tests for Sentry integration module.
 *
 * Tests both the disabled path (VITE_SENTRY_DSN not set) and the
 * enabled path (DSN provided) to meet the 80% branch coverage threshold.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ComponentType, ReactNode } from 'react';

vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({ name: 'BrowserTracing' })),
  ErrorBoundary: function MockErrorBoundary({
    children,
  }: {
    children: ReactNode;
    fallback?: ReactNode;
  }) {
    return children;
  },
}));

describe('sentry module', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // -----------------------------------------------------------------------
  // Disabled path — no DSN
  // -----------------------------------------------------------------------
  describe('disabled (no DSN)', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_SENTRY_DSN', undefined);
    });

    it('initSentry does not call Sentry.init', async () => {
      const sentry = await import('@sentry/react');
      const { initSentry } = await import('@/lib/sentry');
      initSentry();
      expect(sentry.init).not.toHaveBeenCalled();
    });

    it('captureException does not forward to Sentry', async () => {
      const sentry = await import('@sentry/react');
      const { captureException } = await import('@/lib/sentry');
      captureException(new Error('test'));
      expect(sentry.captureException).not.toHaveBeenCalled();
    });

    it('addBreadcrumb does not forward to Sentry', async () => {
      const sentry = await import('@sentry/react');
      const { addBreadcrumb } = await import('@/lib/sentry');
      addBreadcrumb({ category: 'test', message: 'hello' });
      expect(sentry.addBreadcrumb).not.toHaveBeenCalled();
    });

    it('exports FallbackErrorBoundary when disabled', async () => {
      const { ErrorBoundary } = await import('@/lib/sentry');
      expect(ErrorBoundary).toBeInstanceOf(Function);
      // When disabled, ErrorBoundary is the FallbackErrorBoundary class
      // (not the Sentry.ErrorBoundary mock)
      expect(ErrorBoundary.name).toBe('FallbackErrorBoundary');
    });

    it('FallbackErrorBoundary renders children when no error', async () => {
      const React = await import('react');
      const { render, screen } = await import('@testing-library/react');
      const { ErrorBoundary } = await import('@/lib/sentry');

      render(
        React.createElement(
          ErrorBoundary as ComponentType<Record<string, unknown>>,
          {},
          'child-content',
        ),
      );
      expect(screen.getByText('child-content')).toBeTruthy();
    });

    it('FallbackErrorBoundary renders fallback on error', async () => {
      const React = await import('react');
      const { render, screen } = await import('@testing-library/react');
      const { ErrorBoundary } = await import('@/lib/sentry');

      const Throw = (): React.ReactElement => {
        throw new Error('test error');
      };

      render(
        React.createElement(
          ErrorBoundary as ComponentType<Record<string, unknown>>,
          { fallback: 'fallback-content' },
          React.createElement(Throw),
        ),
      );
      expect(screen.getByText('fallback-content')).toBeTruthy();
    });

    it('FallbackErrorBoundary renders null on error without fallback', async () => {
      const React = await import('react');
      const { render } = await import('@testing-library/react');
      const { ErrorBoundary } = await import('@/lib/sentry');

      const Throw = (): React.ReactElement => {
        throw new Error('test error');
      };

      // Should not throw — renders null instead of children
      const { container } = render(
        React.createElement(
          ErrorBoundary as ComponentType<Record<string, unknown>>,
          {},
          React.createElement(Throw),
        ),
      );
      expect(container.innerHTML).toBe('');
    });
  });

  // -----------------------------------------------------------------------
  // Enabled path — DSN set
  // -----------------------------------------------------------------------
  describe('enabled (DSN set)', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://example@sentry.io/123');
      vi.stubEnv('VITE_PUBLIC_APP_ORIGIN', 'https://app.example.com');
      vi.stubEnv('VITE_APP_RELEASE', 'test-release');
      vi.stubEnv('VITE_APP_ENV', 'production');
    });

    it('calls Sentry.init with correct config', async () => {
      const sentry = await import('@sentry/react');
      const { initSentry } = await import('@/lib/sentry');
      initSentry();
      expect(sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: 'https://example@sentry.io/123',
          environment: 'production',
          release: 'test-release',
        }),
      );
    });

    it('uses VITE_APP_ENV for environment', async () => {
      vi.stubEnv('VITE_APP_ENV', 'staging');
      const sentry = await import('@sentry/react');
      const { initSentry } = await import('@/lib/sentry');
      initSentry();
      expect(sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({ environment: 'staging' }),
      );
    });

    it('falls back to staging when origin matches staging pattern', async () => {
      vi.stubEnv('VITE_APP_ENV', '');
      vi.stubEnv('VITE_PUBLIC_APP_ORIGIN', 'https://staging.comapeo.cloud');
      const sentry = await import('@sentry/react');
      const { initSentry } = await import('@/lib/sentry');
      initSentry();
      expect(sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({ environment: 'staging' }),
      );
    });

    it('falls back to staging when origin matches preview pattern', async () => {
      vi.stubEnv('VITE_APP_ENV', '');
      vi.stubEnv('VITE_PUBLIC_APP_ORIGIN', 'https://preview-abc.pages.dev');
      const sentry = await import('@sentry/react');
      const { initSentry } = await import('@/lib/sentry');
      initSentry();
      expect(sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({ environment: 'staging' }),
      );
    });

    it('falls back to production when origin has no staging pattern', async () => {
      vi.stubEnv('VITE_APP_ENV', '');
      vi.stubEnv('VITE_PUBLIC_APP_ORIGIN', 'https://app.example.com');
      const sentry = await import('@sentry/react');
      const { initSentry } = await import('@/lib/sentry');
      initSentry();
      expect(sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({ environment: 'production' }),
      );
    });

    it('falls back to unknown when no origin is set', async () => {
      vi.stubEnv('VITE_APP_ENV', '');
      vi.stubEnv('VITE_PUBLIC_APP_ORIGIN', '');
      const sentry = await import('@sentry/react');
      const { initSentry } = await import('@/lib/sentry');
      initSentry();
      expect(sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({ environment: 'unknown' }),
      );
    });

    it('includes allowUrls when APP_ORIGIN is set', async () => {
      const sentry = await import('@sentry/react');
      const { initSentry } = await import('@/lib/sentry');
      initSentry();
      expect(sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          allowUrls: ['https://app.example.com'],
        }),
      );
    });

    it('omits allowUrls when APP_ORIGIN is empty', async () => {
      vi.stubEnv('VITE_PUBLIC_APP_ORIGIN', '');
      const sentry = await import('@sentry/react');
      const { initSentry } = await import('@/lib/sentry');
      initSentry();
      const callArgs = (sentry.init as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(callArgs).not.toHaveProperty('allowUrls');
    });

    it('forwards captureException to Sentry', async () => {
      const sentry = await import('@sentry/react');
      const { captureException } = await import('@/lib/sentry');
      const error = new Error('enabled-test');
      captureException(error);
      expect(sentry.captureException).toHaveBeenCalledWith(error);
    });

    it('forwards addBreadcrumb to Sentry', async () => {
      const sentry = await import('@sentry/react');
      const { addBreadcrumb } = await import('@/lib/sentry');
      addBreadcrumb({ category: 'nav', message: 'clicked' });
      expect(sentry.addBreadcrumb).toHaveBeenCalledWith({
        category: 'nav',
        message: 'clicked',
      });
    });

    it('disables default PII and installs privacy hooks for errors, breadcrumbs, transactions, and spans', async () => {
      const sentry = await import('@sentry/react');
      const { initSentry } = await import('@/lib/sentry');
      initSentry();

      const options = (sentry.init as ReturnType<typeof vi.fn>).mock.calls.at(
        -1,
      )?.[0] as Record<string, unknown> | undefined;
      expect(options).toEqual(
        expect.objectContaining({
          sendDefaultPii: false,
          beforeSend: expect.any(Function),
          beforeBreadcrumb: expect.any(Function),
          beforeSendTransaction: expect.any(Function),
          beforeSendSpan: expect.any(Function),
        }),
      );
    });

    it('preserves root tag keys only for Sentry events and transactions', async () => {
      const sentry = await import('@sentry/react');
      const { initSentry } = await import('@/lib/sentry');
      initSentry();
      const options = (sentry.init as ReturnType<typeof vi.fn>).mock.calls.at(
        -1,
      )?.[0] as Record<string, (...args: unknown[]) => unknown>;

      const input = {
        tags: { environment: 'staging', release: '2026.09.04' },
      };

      for (const hookName of ['beforeSend', 'beforeSendTransaction']) {
        expect(options[hookName]!(input, {})).toEqual({
          tags: { environment: '[REDACTED]', release: '[REDACTED]' },
        });
      }

      for (const hookName of ['beforeBreadcrumb', 'beforeSendSpan']) {
        expect(options[hookName]!(input, {})).toEqual({ tags: '[REDACTED]' });
      }
    });

    it('redacts credential, invite, URL query, geospatial, and project canaries from every Sentry hook', async () => {
      const sentry = await import('@sentry/react');
      const { initSentry } = await import('@/lib/sentry');
      initSentry();
      const options = (sentry.init as ReturnType<typeof vi.fn>).mock.calls.at(
        -1,
      )?.[0] as Record<string, (...args: unknown[]) => unknown>;

      const canaries = {
        token: String(238001),
        invite: 'invite-canary-238',
        project: 'project-canary-238',
        latitude: -1.238001,
        longitude: -48.238002,
      };
      const payload = {
        request: {
          url:
            'https://app.example.com/invite?code=' +
            canaries.invite +
            '#token=' +
            canaries.token,
          headers: { authorization: 'Bearer ' + canaries.token },
        },
        extra: {
          token: canaries.token,
          inviteCode: canaries.invite,
          projectId: canaries.project,
          geometry: {
            type: 'Point',
            coordinates: [canaries.longitude, canaries.latitude],
          },
        },
        contexts: {
          map: { latitude: canaries.latitude, longitude: canaries.longitude },
        },
      };

      const hookInputs: Array<[string, unknown]> = [
        ['beforeSend', { ...payload, message: 'failure ' + canaries.token }],
        [
          'beforeBreadcrumb',
          {
            category: 'navigation',
            message: 'visit https://archive.test/path?token=' + canaries.token,
            data: payload,
          },
        ],
        [
          'beforeSendTransaction',
          { ...payload, transaction: canaries.project },
        ],
        [
          'beforeSendSpan',
          {
            description: 'GET https://archive.test/api?code=' + canaries.invite,
            data: payload,
            origin: canaries.project,
          },
        ],
      ];

      for (const [hookName, input] of hookInputs) {
        const result = options[hookName]!(input, {});
        const serialized = JSON.stringify(result);
        expect(serialized, hookName).not.toContain(canaries.token);
        expect(serialized, hookName).not.toContain(canaries.invite);
        expect(serialized, hookName).not.toContain(canaries.project);
        expect(serialized, hookName).not.toContain(String(canaries.latitude));
        expect(serialized, hookName).not.toContain(String(canaries.longitude));
        expect(serialized, hookName).not.toContain('?code=');
        expect(serialized, hookName).not.toContain('?token=');
      }
    });

    it('sanitizes cycles and oversized telemetry deterministically without throwing', async () => {
      const sentry = await import('@sentry/react');
      const { initSentry } = await import('@/lib/sentry');
      initSentry();
      const options = (sentry.init as ReturnType<typeof vi.fn>).mock.calls.at(
        -1,
      )?.[0] as Record<string, (...args: unknown[]) => unknown>;

      const cyclic: Record<string, unknown> = {
        token: String(238099),
        huge: 'x'.repeat(20_000),
        nested: { a: { b: { c: { d: { e: { f: 'too-deep-canary-238' } } } } } },
      };
      cyclic.self = cyclic;

      const first = options.beforeSend!({ extra: cyclic }, {});
      const second = options.beforeSend!({ extra: cyclic }, {});
      const firstJson = JSON.stringify(first);
      const secondJson = JSON.stringify(second);

      expect(firstJson).toBe(secondJson);
      expect(firstJson).not.toContain(String(238099));
      expect(firstJson.length).toBeLessThan(10_000);
      expect(firstJson).toContain('[Circular]');
    });

    it('exports Sentry.ErrorBoundary when enabled', async () => {
      const { ErrorBoundary } = await import('@/lib/sentry');
      expect(ErrorBoundary).toBeInstanceOf(Function);
    });
  });
});
