import { describe, expect, it } from 'vitest';

import {
  GEOSPATIAL_TELEMETRY_KEYS,
  MAX_SANITIZE_DEPTH,
  MAX_SANITIZE_ENTRIES,
  MAX_SANITIZE_STRING_LENGTH,
  SECRET_TELEMETRY_KEYS,
  SENSITIVE_DOMAIN_TELEMETRY_KEYS,
  TELEMETRY_CIRCULAR,
  TELEMETRY_REDACTED,
  TELEMETRY_TRUNCATED,
  sanitizeTelemetry,
  sanitizeTelemetryString,
} from '@/lib/telemetry-redaction';

describe('telemetry redaction', () => {
  it('exports the issue #238 sanitizer bounds and sensitive key policy', () => {
    expect(MAX_SANITIZE_DEPTH).toBe(8);
    expect(MAX_SANITIZE_ENTRIES).toBe(100);
    expect(MAX_SANITIZE_STRING_LENGTH).toBe(8192);
    expect(SECRET_TELEMETRY_KEYS.has('authorization')).toBe(true);
    expect(SECRET_TELEMETRY_KEYS.has('accesstoken')).toBe(true);
    expect(SECRET_TELEMETRY_KEYS.has('proxyauthorization')).toBe(true);
    expect(SECRET_TELEMETRY_KEYS.has('xapikey')).toBe(true);
    expect(GEOSPATIAL_TELEMETRY_KEYS.has('coordinates')).toBe(true);
    expect(GEOSPATIAL_TELEMETRY_KEYS.has('geometry')).toBe(true);
    expect(SENSITIVE_DOMAIN_TELEMETRY_KEYS.has('tags')).toBe(true);
    expect(SENSITIVE_DOMAIN_TELEMETRY_KEYS.has('observations')).toBe(true);
  });

  it('preserves safe URL origin/path and operation text while stripping query/hash and bearer secrets', () => {
    const secret = ['synthetic', 'credential', '238'].join('-');
    const invite = ['synthetic', 'invite', '238'].join('-');
    const result = sanitizeTelemetryString(
      `GET https://archive.example.com/api/projects/123?code=${invite}#token=${secret} Bearer ${secret}`,
    );

    expect(result).toContain(
      'GET https://archive.example.com/api/projects/[REDACTED]',
    );
    expect(result).toContain('Bearer [REDACTED]');
    expect(result).not.toContain(invite);
    expect(result).not.toContain(secret);
    expect(result).not.toContain('?code=');
    expect(result).not.toContain('#token=');
  });

  it('redacts project identifiers embedded in URL paths without requiring a sibling projectId field', () => {
    const projectId = ['synthetic', 'project', 'path', '238'].join('-');
    const result = sanitizeTelemetryString(
      'GET https://archive.example.com/api/projects/' +
        projectId +
        '/observations',
    );

    expect(result).toContain('/api/projects/[REDACTED]/observations');
    expect(result).not.toContain(projectId);
  });

  it('sanitizes root transaction and child-span style payloads without removing safe diagnostics', () => {
    const secret = ['synthetic', 'credential', 'root', '238'].join('-');
    const project = ['synthetic', 'project', '238'].join('-');
    const latitude = -1.1238123;
    const longitude = -48.1238456;
    const input = {
      transaction: `/invite?code=${project}`,
      op: 'http.client',
      duration: 42,
      request: {
        url: `https://app.example.com/invite?code=${project}#token=${secret}`,
        headers: { Authorization: `Bearer ${secret}` },
      },
      contexts: {
        trace: {
          data: {
            projectId: project,
            latitude,
            longitude,
          },
        },
      },
      description: `GET https://archive.example.com/api/data?token=${secret}`,
    };

    const result = sanitizeTelemetry(input);
    const serialized = JSON.stringify(result);

    expect(result.op).toBe('http.client');
    expect(result.duration).toBe(42);
    expect(result.transaction).toBe('/invite');
    expect(result.request.url).toBe('https://app.example.com/invite');
    expect(result.description).toContain(
      'GET https://archive.example.com/api/data',
    );
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(project);
    expect(serialized).not.toContain(String(latitude));
    expect(serialized).not.toContain(String(longitude));
  });

  it('redacts domain containers and is deterministic, cycle-safe, depth-bounded, and size-bounded', () => {
    const domainCanary = ['synthetic', 'metadata', '238'].join('-');
    const cyclic: Record<string, unknown> = {
      safe: 'keep-me',
      metadata: { secret: domainCanary },
      huge: 'x'.repeat(MAX_SANITIZE_STRING_LENGTH + 500),
    };
    cyclic.self = cyclic;

    let deep: Record<string, unknown> = cyclic;
    for (let index = 0; index < MAX_SANITIZE_DEPTH + 2; index += 1) {
      const next: Record<string, unknown> = {};
      deep[`level-${index}`] = next;
      deep = next;
    }

    const first = sanitizeTelemetry(cyclic);
    const second = sanitizeTelemetry(cyclic);
    const serialized = JSON.stringify(first);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.safe).toBe('keep-me');
    expect(first.metadata).toBe(TELEMETRY_REDACTED);
    expect(serialized).toContain(TELEMETRY_CIRCULAR);
    expect(serialized).toContain(TELEMETRY_TRUNCATED);
    expect(serialized).not.toContain(domainCanary);
    expect(serialized.length).toBeLessThan(MAX_SANITIZE_STRING_LENGTH + 3000);
  });

  it('does not globally replace trivial numeric values collected from sensitive fields', () => {
    const message = 'HTTP 200 in 10ms at 2026-08-26T01:01:00Z';
    const result = sanitizeTelemetry({
      message,
      count: 0,
      attempt: 1,
      contexts: {
        trace: {
          data: {
            coordinates: [0, 0],
            projectId: '1',
          },
        },
      },
    });

    expect(result.contexts.trace.data.coordinates).toBe(TELEMETRY_REDACTED);
    expect(result.contexts.trace.data.projectId).toBe(TELEMETRY_REDACTED);
    expect(result.message).toBe(message);
    expect(result.count).toBe(0);
    expect(result.attempt).toBe(1);
  });

  it('fails closed when a late sensitive key competes with the entry bound', () => {
    const secret = ['synthetic', 'late', 'credential', '238'].join('-');
    const payload: Record<string, unknown> = {
      message: 'request failed for ' + secret,
    };
    for (let index = 0; index < MAX_SANITIZE_ENTRIES - 1; index += 1) {
      payload['padding-' + String(index).padStart(3, '0')] = index;
    }
    payload.token = secret;

    const result = sanitizeTelemetry(payload);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result.message).toBe('request failed for ' + TELEMETRY_REDACTED);
  });

  it('fails closed when sensitive containers saturate the value collection bound', () => {
    const secret = ['synthetic', 'saturated', 'credential', '238'].join('-');
    const coordinates = Array.from(
      { length: MAX_SANITIZE_ENTRIES },
      (_, index) => 'coordinate-' + String(index).padStart(3, '0'),
    );
    const result = sanitizeTelemetry({
      coordinates,
      message: 'request failed for ' + secret,
      token: secret,
    });

    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result.message).toBe(TELEMETRY_REDACTED);
  });

  it('preserves safe event primitives when only non-sensitive containers exceed the collection bound', () => {
    const oversizedValues: unknown[] = [
      Array.from({ length: MAX_SANITIZE_ENTRIES + 1 }, (_, index) => ({
        op: 'http.client',
        index,
      })),
      Object.fromEntries(
        Array.from({ length: MAX_SANITIZE_ENTRIES + 1 }, (_, index) => [
          `entry-${index}`,
          index,
        ]),
      ),
    ];

    for (const oversized of oversizedValues) {
      const result = sanitizeTelemetry({
        event_id: 'event-325',
        timestamp: '2026-09-04T12:00:00.000Z',
        platform: 'javascript',
        oversized,
      });

      expect(result.event_id).toBe('event-325');
      expect(result.timestamp).toBe('2026-09-04T12:00:00.000Z');
      expect(result.platform).toBe('javascript');
    }
  });

  it('preserves object-valued tag keys while redacting every tag value', () => {
    const tagCanary = ['synthetic', 'tag', 'value', '325'].join('-');
    const result = sanitizeTelemetry({
      tags: {
        environment: 'staging',
        release: '2026.09.04',
        attempt: 3,
        enabled: true,
        nested: { value: tagCanary },
      },
    });

    expect(result.tags).toEqual({
      attempt: TELEMETRY_REDACTED,
      enabled: TELEMETRY_REDACTED,
      environment: TELEMETRY_REDACTED,
      nested: TELEMETRY_REDACTED,
      release: TELEMETRY_REDACTED,
    });
    expect(JSON.stringify(result)).not.toContain(tagCanary);
  });

  it('bounds objects and arrays to at most 100 entries before a truncation marker', () => {
    const object = Object.fromEntries(
      Array.from({ length: 120 }, (_, index) => [`key-${index}`, index]),
    );
    const array = Array.from({ length: 120 }, (_, index) => index);
    const result = sanitizeTelemetry({ object, array });

    expect(Object.keys(result.object)).toHaveLength(MAX_SANITIZE_ENTRIES + 1);
    expect(result.object.__truncated__).toBe(TELEMETRY_TRUNCATED);
    expect(result.array).toHaveLength(MAX_SANITIZE_ENTRIES + 1);
    expect(result.array.at(-1)).toBe(TELEMETRY_TRUNCATED);
  });
});
