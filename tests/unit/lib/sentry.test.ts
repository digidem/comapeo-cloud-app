/**
 * Tests for Sentry integration module.
 *
 * Tests both the disabled path (VITE_SENTRY_DSN not set) and the
 * enabled path (DSN provided) to meet the 80% branch coverage threshold.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({ name: 'BrowserTracing' })),
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
          allowUrls: [
            'https://app.example.com',
            'https://comapeo-cloud-app.pages.dev',
          ],
        }),
      );
    });

    it('deduplicates allowUrls when APP_ORIGIN equals the Pages origin', async () => {
      vi.stubEnv(
        'VITE_PUBLIC_APP_ORIGIN',
        'https://comapeo-cloud-app.pages.dev',
      );
      const sentry = await import('@sentry/react');
      const { initSentry } = await import('@/lib/sentry');
      initSentry();
      expect(sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          allowUrls: ['https://comapeo-cloud-app.pages.dev'],
        }),
      );
    });

    it('treats VITE_CF_PAGES_ORIGIN as additive to the default Pages origin', async () => {
      vi.stubEnv('VITE_CF_PAGES_ORIGIN', 'https://custom-preview.pages.dev');
      const sentry = await import('@sentry/react');
      const { initSentry } = await import('@/lib/sentry');
      initSentry();
      expect(sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          allowUrls: [
            'https://app.example.com',
            'https://comapeo-cloud-app.pages.dev',
            'https://custom-preview.pages.dev',
          ],
        }),
      );
    });

    it('always keeps the default Pages origin even when APP_ORIGIN is empty', async () => {
      vi.stubEnv('VITE_PUBLIC_APP_ORIGIN', '');
      const sentry = await import('@sentry/react');
      const { initSentry } = await import('@/lib/sentry');
      initSentry();
      const callArgs = (sentry.init as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(callArgs).toHaveProperty('allowUrls', [
        'https://comapeo-cloud-app.pages.dev',
      ]);
    });

    it('deduplicates allowUrls when every configured origin resolves to the same host', async () => {
      vi.stubEnv('VITE_PUBLIC_APP_ORIGIN', '');
      vi.stubEnv('VITE_CF_PAGES_ORIGIN', 'https://comapeo-cloud-app.pages.dev');
      const sentry = await import('@sentry/react');
      const { initSentry } = await import('@/lib/sentry');
      initSentry();
      const callArgs = (sentry.init as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(callArgs).toHaveProperty('allowUrls', [
        'https://comapeo-cloud-app.pages.dev',
      ]);
    });

    it('skips Sentry.init in automated browsers even when the DSN is set', async () => {
      Object.defineProperty(window.navigator, 'webdriver', {
        value: true,
        configurable: true,
      });
      try {
        const sentry = await import('@sentry/react');
        const { initSentry } = await import('@/lib/sentry');
        initSentry();
        expect(sentry.init).not.toHaveBeenCalled();
      } finally {
        delete (window.navigator as { webdriver?: boolean }).webdriver;
      }
    });

    it('initializes Sentry for non-automated browsers', async () => {
      const sentry = await import('@sentry/react');
      const { initSentry } = await import('@/lib/sentry');
      initSentry();
      expect(sentry.init).toHaveBeenCalledTimes(1);
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
  });
});
