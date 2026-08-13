import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PRODUCTION_TILE_HOST,
  PRODUCTION_ZONE_NAME,
  buildCloudflareRateLimitRule,
  buildMeasurementReport,
  findRuleByRef,
  maxRequestsInWindow,
  summarizeHarSample,
  validateEnforcementReadiness,
  validateProductionMeasurementTarget,
  validateProductionZoneName,
} from '../../../scripts/lib/tile-rate-limit';
import {
  disableManagedRule,
  upsertManagedRule,
  writableExistingRule,
} from '../../../scripts/tile-rate-limit';

afterEach(() => {
  vi.unstubAllGlobals();
});

function cloudflareResponse(result: unknown): Response {
  return new Response(
    JSON.stringify({ success: true, result, errors: [], messages: [] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function exampleManagedRule() {
  return buildCloudflareRateLimitRule({
    host: PRODUCTION_TILE_HOST,
    requestsPerPeriod: 1370,
    periodSeconds: 60,
    mitigationTimeoutSeconds: 60,
    mode: 'enforce',
  });
}

describe('tile rate limit operations', () => {
  it('computes the maximum request burst inside a rolling window', () => {
    const timestamps = [0, 1000, 2000, 59_000, 60_001, 61_000];

    expect(maxRequestsInWindow(timestamps, 60_000)).toBe(4);
  });

  it('filters HAR entries to production GET /api/tiles only', () => {
    const har = {
      log: {
        entries: [
          {
            startedDateTime: '2026-08-13T12:00:00.000Z',
            request: {
              method: 'GET',
              url: 'https://app.comapeo.cloud/api/tiles?url=https%3A%2F%2Ftiles.example%2F0%2F0%2F0.png',
            },
          },
          {
            startedDateTime: '2026-08-13T12:00:01.000Z',
            request: {
              method: 'POST',
              url: 'https://app.comapeo.cloud/api/tiles',
            },
          },
          {
            startedDateTime: '2026-08-13T12:00:02.000Z',
            request: {
              method: 'GET',
              url: 'https://app.comapeo.cloud/api/info',
            },
          },
          {
            startedDateTime: '2026-08-13T12:00:03.000Z',
            request: {
              method: 'GET',
              url: 'https://staging.comapeo.cloud/api/tiles',
            },
          },
        ],
      },
    };

    const summary = summarizeHarSample(har, {
      kind: 'small',
      name: 'small representative download',
      host: 'app.comapeo.cloud',
      windowSeconds: 60,
    });

    expect(summary.requestCount).toBe(1);
    expect(summary.maxRequestsPerWindow).toBe(1);
  });

  it('builds a report only when both small and large flows are present', () => {
    const small = {
      kind: 'small' as const,
      name: 'small',
      requestCount: 120,
      durationMs: 12_000,
      maxRequestsPerWindow: 120,
      firstRequestAt: '2026-08-13T12:00:00.000Z',
      lastRequestAt: '2026-08-13T12:00:12.000Z',
    };
    const large = {
      kind: 'large' as const,
      name: 'large',
      requestCount: 910,
      durationMs: 52_000,
      maxRequestsPerWindow: 910,
      firstRequestAt: '2026-08-13T12:05:00.000Z',
      lastRequestAt: '2026-08-13T12:05:52.000Z',
    };

    const report = buildMeasurementReport({
      host: 'app.comapeo.cloud',
      windowSeconds: 60,
      samples: [small, large],
      measuredAt: '2026-08-13T12:10:00.000Z',
      safetyMultiplier: 1.5,
    });

    expect(report.observedMaxRequestsPerWindow).toBe(910);
    expect(report.recommendedRequestsPerPeriod).toBe(1370);
    expect(report.samples).toHaveLength(2);

    expect(() =>
      buildMeasurementReport({
        host: 'app.comapeo.cloud',
        windowSeconds: 60,
        samples: [small],
        measuredAt: '2026-08-13T12:10:00.000Z',
      }),
    ).toThrow(/small and large/i);
  });

  it('builds an exact production-host GET /api/tiles Cloudflare rule', () => {
    const rule = buildCloudflareRateLimitRule({
      host: 'app.comapeo.cloud',
      requestsPerPeriod: 1370,
      periodSeconds: 60,
      mitigationTimeoutSeconds: 60,
      mode: 'enforce',
    });

    expect(rule.expression).toBe(
      '(http.host eq "app.comapeo.cloud" and http.request.method eq "GET" and http.request.uri.path eq "/api/tiles")',
    );
    expect(rule.action).toBe('block');
    expect(rule.action_parameters).toEqual({
      response: {
        status_code: 429,
        content_type: 'text/plain',
        content:
          'Tile download rate limit exceeded. Retry after a short delay.',
      },
    });
    expect(rule.ratelimit.characteristics).toEqual(['cf.colo.id', 'ip.src']);
    expect(rule.ratelimit.requests_per_period).toBe(1370);
    expect(rule.ratelimit.period).toBe(60);
  });

  it('uses a non-blocking log action in observe mode', () => {
    const rule = buildCloudflareRateLimitRule({
      host: 'app.comapeo.cloud',
      requestsPerPeriod: 1370,
      periodSeconds: 60,
      mitigationTimeoutSeconds: 60,
      mode: 'observe',
    });

    expect(rule.action).toBe('log');
    expect(rule).not.toHaveProperty('action_parameters');
  });

  it('rejects a measurement report for a non-production host', () => {
    const report = buildMeasurementReport({
      host: 'preview.example.com',
      windowSeconds: 60,
      samples: [
        {
          kind: 'small',
          name: 'small',
          requestCount: 1,
          durationMs: 1,
          maxRequestsPerWindow: 1,
          firstRequestAt: '2026-08-13T12:00:00.000Z',
          lastRequestAt: '2026-08-13T12:00:00.001Z',
        },
        {
          kind: 'large',
          name: 'large',
          requestCount: 2,
          durationMs: 2,
          maxRequestsPerWindow: 2,
          firstRequestAt: '2026-08-13T12:00:01.000Z',
          lastRequestAt: '2026-08-13T12:00:01.002Z',
        },
      ],
    });

    expect(PRODUCTION_TILE_HOST).toBe('app.comapeo.cloud');
    expect(() => validateProductionMeasurementTarget(report)).toThrow(
      /production/i,
    );
  });

  it('requires the configured production zone', () => {
    expect(PRODUCTION_ZONE_NAME).toBe('comapeo.cloud');
    expect(() => validateProductionZoneName('example.com')).toThrow(
      /production zone/i,
    );
    expect(() => validateProductionZoneName('comapeo.cloud')).not.toThrow();
  });

  it('extracts the managed rule from Cloudflare ruleset mutation responses', () => {
    const managedRule = {
      id: 'rule-id',
      ref: 'comapeo-cloud-app-tiles-rate-limit',
    };
    const ruleset = {
      id: 'ruleset-id',
      rules: [{ id: 'other', ref: 'other' }, managedRule],
    };

    expect(findRuleByRef(ruleset)).toBe(managedRule);
  });

  it('fails closed when duplicate managed rules exist before an upsert', async () => {
    const rule = exampleManagedRule();
    const ruleset = {
      id: 'ruleset-id',
      rules: [
        { ...rule, id: 'managed-a' },
        { ...rule, id: 'managed-b' },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(cloudflareResponse(ruleset));
    vi.stubGlobal('fetch', fetchMock);

    const duplicateUpsert = upsertManagedRule('token', 'zone-id', rule);
    await expect(duplicateUpsert).rejects.toThrow(
      /2 managed tile rate-limit rules/i,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('disables every duplicate managed rule and preserves writable fields', async () => {
    const rule = exampleManagedRule();
    const ruleset = {
      id: 'ruleset-id',
      rules: [
        {
          ...rule,
          id: 'managed-a',
          version: '3',
          last_updated: '2026-08-13T12:00:00.000Z',
          logging: { enabled: true },
        },
        {
          ...rule,
          id: 'managed-b',
          version: '4',
          last_updated: '2026-08-13T12:01:00.000Z',
          logging: { enabled: true },
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(cloudflareResponse(ruleset))
      .mockResolvedValueOnce(cloudflareResponse(ruleset))
      .mockResolvedValueOnce(cloudflareResponse(ruleset));
    vi.stubGlobal('fetch', fetchMock);

    await expect(disableManagedRule('token', 'zone-id')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    for (const callIndex of [1, 2]) {
      const [, init] = fetchMock.mock.calls[callIndex] as [string, RequestInit];
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      expect(init.method).toBe('PATCH');
      expect(body.enabled).toBe(false);
      expect(body.logging).toEqual({ enabled: true });
      expect(body).not.toHaveProperty('id');
      expect(body).not.toHaveProperty('version');
      expect(body).not.toHaveProperty('last_updated');
    }
  });

  it('preserves unknown writable rule fields while removing response metadata', () => {
    const writable = writableExistingRule({
      ...exampleManagedRule(),
      id: 'managed-a',
      version: '7',
      last_updated: '2026-08-13T12:00:00.000Z',
      logging: { enabled: true },
    } as Parameters<typeof writableExistingRule>[0]);

    expect(writable).toMatchObject({
      ref: 'comapeo-cloud-app-tiles-rate-limit',
      logging: { enabled: true },
    });
    expect(writable).not.toHaveProperty('id');
    expect(writable).not.toHaveProperty('version');
    expect(writable).not.toHaveProperty('last_updated');
  });

  it('uses POST to append a managed rule to an existing ruleset', async () => {
    const rule = exampleManagedRule();
    const existingRuleset = {
      id: 'ruleset-id',
      rules: [{ id: 'other', ref: 'other' }],
    };
    const createdRuleset = {
      id: 'ruleset-id',
      rules: [
        { id: 'other', ref: 'other' },
        { ...rule, id: 'managed-a' },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(cloudflareResponse(existingRuleset))
      .mockResolvedValueOnce(cloudflareResponse(createdRuleset));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      upsertManagedRule('token', 'zone-id', rule),
    ).resolves.toMatchObject({
      id: 'managed-a',
      ref: 'comapeo-cloud-app-tiles-rate-limit',
    });
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toMatch(/\/rulesets\/ruleset-id\/rules$/);
    expect(init.method).toBe('POST');
  });

  it('uses PUT to create the phase entrypoint when no ruleset exists', async () => {
    const rule = exampleManagedRule();
    const createdRuleset = {
      id: 'ruleset-id',
      rules: [{ ...rule, id: 'managed-a' }],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(cloudflareResponse(createdRuleset));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      upsertManagedRule('token', 'zone-id', rule),
    ).resolves.toMatchObject({
      id: 'managed-a',
    });
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toMatch(/\/rulesets\/phases\/http_ratelimit\/entrypoint$/);
    expect(init.method).toBe('PUT');
  });

  it('uses PATCH to update the existing unique managed rule', async () => {
    const rule = exampleManagedRule();
    const existingRuleset = {
      id: 'ruleset-id',
      rules: [{ ...rule, id: 'managed-a' }],
    };
    const updatedRuleset = {
      id: 'ruleset-id',
      rules: [{ ...rule, id: 'managed-a', enabled: false }],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(cloudflareResponse(existingRuleset))
      .mockResolvedValueOnce(cloudflareResponse(updatedRuleset));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      upsertManagedRule('token', 'zone-id', rule),
    ).resolves.toMatchObject({
      id: 'managed-a',
    });
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toMatch(/\/rulesets\/ruleset-id\/rules\/managed-a$/);
    expect(init.method).toBe('PATCH');
  });

  it('refuses enforcement when measurement or false-positive validation is incomplete', () => {
    const report = buildMeasurementReport({
      host: 'app.comapeo.cloud',
      windowSeconds: 60,
      samples: [
        {
          kind: 'small',
          name: 'small',
          requestCount: 100,
          durationMs: 10_000,
          maxRequestsPerWindow: 100,
          firstRequestAt: '2026-08-13T12:00:00.000Z',
          lastRequestAt: '2026-08-13T12:00:10.000Z',
        },
        {
          kind: 'large',
          name: 'large',
          requestCount: 900,
          durationMs: 50_000,
          maxRequestsPerWindow: 900,
          firstRequestAt: '2026-08-13T12:05:00.000Z',
          lastRequestAt: '2026-08-13T12:05:50.000Z',
        },
      ],
      measuredAt: '2026-08-13T12:10:00.000Z',
    });

    expect(() =>
      validateEnforcementReadiness({
        report,
        host: 'app.comapeo.cloud',
        requestsPerPeriod: 1350,
        periodSeconds: 60,
        falsePositiveValidationConfirmed: false,
      }),
    ).toThrow(/false-positive validation/i);

    expect(() =>
      validateEnforcementReadiness({
        report,
        host: 'app.comapeo.cloud',
        requestsPerPeriod: 800,
        periodSeconds: 60,
        falsePositiveValidationConfirmed: true,
      }),
    ).toThrow(/observed legitimate burst/i);

    const inconsistentReport = {
      ...report,
      observedMaxRequestsPerWindow: 1,
      recommendedRequestsPerPeriod: 2,
    };
    expect(() =>
      validateEnforcementReadiness({
        report: inconsistentReport,
        host: 'app.comapeo.cloud',
        requestsPerPeriod: 2,
        periodSeconds: 60,
        falsePositiveValidationConfirmed: true,
      }),
    ).toThrow(/samples|inconsistent|observed legitimate burst/i);

    const malformedSampleReport = {
      ...report,
      samples: report.samples.map((sample) =>
        sample.kind === 'small'
          ? { ...sample, requestCount: 10, maxRequestsPerWindow: 100 }
          : sample,
      ),
    };
    expect(() =>
      validateEnforcementReadiness({
        report: malformedSampleReport,
        host: 'app.comapeo.cloud',
        requestsPerPeriod: 1350,
        periodSeconds: 60,
        falsePositiveValidationConfirmed: true,
      }),
    ).toThrow(/burst larger than its request count/i);
  });
});
