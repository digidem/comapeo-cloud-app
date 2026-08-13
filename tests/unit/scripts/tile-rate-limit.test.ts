import { describe, expect, it } from 'vitest';

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
  });
});
