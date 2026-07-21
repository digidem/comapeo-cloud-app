import { afterEach, describe, expect, it, vi } from 'vitest';

import { onRequest } from '../../../functions/api/_middleware';

function createRequest(
  method: string,
  url: string,
  headers?: Record<string, string>,
): Request {
  return new Request(url, { method, headers });
}

function createContext(
  request: Request,
  next = vi
    .fn()
    .mockResolvedValue(new Response('next-handler', { status: 200 })),
) {
  return { request, next } as unknown as Parameters<typeof onRequest>[0];
}

describe('api/_middleware', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Pass-through routes ──────────────────────────────────────────────

  describe('pass-through routes', () => {
    it('forwards /api/tiles to the tiles handler via context.next()', async () => {
      const tileResponse = new Response('tile-data', { status: 200 });
      const next = vi.fn().mockResolvedValue(tileResponse);
      const req = createRequest(
        'GET',
        'http://localhost/api/tiles?url=https://example.com/tile.png',
      );
      const res = await onRequest(createContext(req, next));

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('tile-data');
    });

    it('forwards /api/tiles/sub/path to next()', async () => {
      const next = vi
        .fn()
        .mockResolvedValue(new Response('deep-tile', { status: 200 }));
      const req = createRequest('GET', 'http://localhost/api/tiles/sub/path');
      const res = await onRequest(createContext(req, next));

      expect(next).toHaveBeenCalledTimes(1);
      expect(await res.text()).toBe('deep-tile');
    });

    it('forwards /api/invites/encrypt to next()', async () => {
      const next = vi
        .fn()
        .mockResolvedValue(new Response('encrypted', { status: 200 }));
      const req = createRequest('POST', 'http://localhost/api/invites/encrypt');
      const res = await onRequest(createContext(req, next));

      expect(next).toHaveBeenCalledTimes(1);
      expect(await res.text()).toBe('encrypted');
    });

    it('forwards /api/invites/decrypt to next()', async () => {
      const next = vi
        .fn()
        .mockResolvedValue(new Response('decrypted', { status: 200 }));
      const req = createRequest('POST', 'http://localhost/api/invites/decrypt');
      const res = await onRequest(createContext(req, next));

      expect(next).toHaveBeenCalledTimes(1);
      expect(await res.text()).toBe('decrypted');
    });
  });

  // ── Archive proxy ────────────────────────────────────────────────────

  describe('archive proxy', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('rejects /api/info without x-target-url with 400', async () => {
      const req = createRequest('GET', 'http://localhost/api/info');
      const res = await onRequest(createContext(req));

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('ARCHIVE_PROXY_BAD_TARGET');
    });

    it('proxies /api/projects with x-target-url to upstream', async () => {
      const fetchSpy = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      globalThis.fetch = fetchSpy as unknown as typeof fetch;

      const req = createRequest('GET', 'http://localhost/api/projects', {
        'x-target-url': 'https://archive.example.com',
      });
      const res = await onRequest(createContext(req));

      expect(res.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      // fetch() receives a Request object — extract its URL
      const calledUrl =
        fetchSpy.mock.calls[0]?.[0]?.url ?? String(fetchSpy.mock.calls[0]?.[0]);
      expect(calledUrl).toContain('https://archive.example.com/projects');
    });

    it('proxies /api/info with x-target-url to upstream', async () => {
      const fetchSpy = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ data: { deviceId: 'abc', name: 'Test' } }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
      globalThis.fetch = fetchSpy as unknown as typeof fetch;

      const req = createRequest('GET', 'http://localhost/api/info', {
        'x-target-url': 'https://archive.example.com',
      });
      const res = await onRequest(createContext(req));

      expect(res.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      // fetch() receives a Request object — extract its URL
      const calledUrl =
        fetchSpy.mock.calls[0]?.[0]?.url ?? String(fetchSpy.mock.calls[0]?.[0]);
      expect(calledUrl).toContain('https://archive.example.com/info');
    });

    it('rejects POST /api/projects with 405 (not a write endpoint)', async () => {
      const req = createRequest('POST', 'http://localhost/api/projects', {
        'x-target-url': 'https://archive.example.com',
      });
      const res = await onRequest(createContext(req));

      expect(res.status).toBe(405);
    });

    it('allows POST to /api/projects/:id/remoteDetectionAlerts', async () => {
      const fetchSpy = vi
        .fn()
        .mockResolvedValue(new Response('', { status: 201 }));
      globalThis.fetch = fetchSpy as unknown as typeof fetch;

      const req = createRequest(
        'POST',
        'http://localhost/api/projects/abc123/remoteDetectionAlerts',
        {
          'x-target-url': 'https://archive.example.com',
          'Content-Type': 'application/json',
        },
      );
      const res = await onRequest(createContext(req));

      expect(res.status).toBe(201);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('rejects invalid upstream URL with 400', async () => {
      const req = createRequest('GET', 'http://localhost/api/info', {
        'x-target-url': 'not-a-valid-url',
      });
      const res = await onRequest(createContext(req));

      expect(res.status).toBe(400);
    });

    it('returns 502 when upstream fetch fails', async () => {
      const fetchSpy = vi.fn().mockRejectedValue(new Error('fetch failed'));
      globalThis.fetch = fetchSpy as unknown as typeof fetch;

      const req = createRequest('GET', 'http://localhost/api/projects', {
        'x-target-url': 'https://archive.example.com',
      });
      const res = await onRequest(createContext(req));

      expect(res.status).toBe(502);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('ARCHIVE_PROXY_UPSTREAM_FAILED');
    });
  });
});
