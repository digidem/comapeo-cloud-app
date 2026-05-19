import { describe, expect, it } from 'vitest';

import {
  decodeBase64Key,
  formatIssues,
  jsonError,
  withNoStore,
} from '@/lib/pages-fn-utils';

describe('jsonError', () => {
  it('returns a Response with the given status, error body, and no-store header', async () => {
    const response = jsonError(400, 'BAD', 'oops');

    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const body = (await response.json()) as unknown;
    expect(body).toEqual({ error: { code: 'BAD', message: 'oops' } });
  });
});

describe('withNoStore', () => {
  it('preserves status, body, and existing headers while setting no-store', async () => {
    const original = new Response('hi', {
      status: 200,
      headers: { 'X-Custom': 'v' },
    });

    const result = withNoStore(original);

    expect(result.status).toBe(200);
    expect(result.headers.get('X-Custom')).toBe('v');
    expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect(await result.text()).toBe('hi');
  });

  it('overrides an existing Cache-Control header with no-store', () => {
    const original = new Response('body', {
      status: 200,
      headers: { 'Cache-Control': 'max-age=60' },
    });

    const result = withNoStore(original);

    expect(result.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('decodeBase64Key', () => {
  it('decodes a valid base64 string to bytes', () => {
    const result = decodeBase64Key('AQID');
    expect(result).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('returns null for invalid base64 input', () => {
    expect(decodeBase64Key('!!!not-base64!!!')).toBeNull();
  });

  it('returns an empty array for an empty string', () => {
    expect(decodeBase64Key('')).toEqual(new Uint8Array(0));
  });
});

describe('formatIssues', () => {
  it('joins multiple issue messages with a separator', () => {
    expect(
      formatIssues([{ message: 'first error' }, { message: 'second error' }]),
    ).toBe('first error; second error');
  });

  it('returns a single message when only one issue is supplied', () => {
    expect(formatIssues([{ message: 'only error' }])).toBe('only error');
  });

  it('returns an empty string when no issues are supplied', () => {
    expect(formatIssues([])).toBe('');
  });
});
