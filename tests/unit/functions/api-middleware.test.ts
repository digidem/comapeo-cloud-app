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

function expectSecurityHeaders(response: Response) {
  expect(response.headers.get('Strict-Transport-Security')).toBe(
    'max-age=31536000',
  );
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
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

    it('forwards bare /api/tiles (no query params) to next()', async () => {
      const next = vi
        .fn()
        .mockResolvedValue(new Response('tiles-index', { status: 200 }));
      const req = createRequest('GET', 'http://localhost/api/tiles');
      const res = await onRequest(createContext(req, next));

      expect(next).toHaveBeenCalledTimes(1);
      expect(await res.text()).toBe('tiles-index');
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

    it('forwards POST /api/invites/encrypt to next()', async () => {
      const next = vi
        .fn()
        .mockResolvedValue(new Response('encrypted', { status: 200 }));
      const req = createRequest('POST', 'http://localhost/api/invites/encrypt');
      const res = await onRequest(createContext(req, next));

      expect(next).toHaveBeenCalledTimes(1);
      expect(await res.text()).toBe('encrypted');
    });

    it('forwards POST /api/invites/decrypt to next()', async () => {
      const next = vi
        .fn()
        .mockResolvedValue(new Response('decrypted', { status: 200 }));
      const req = createRequest('POST', 'http://localhost/api/invites/decrypt');
      const res = await onRequest(createContext(req, next));

      expect(next).toHaveBeenCalledTimes(1);
      expect(await res.text()).toBe('decrypted');
    });

    it('forwards GET /api/invites/encrypt to next() (handler returns 405)', async () => {
      const next = vi
        .fn()
        .mockResolvedValue(new Response('method-not-allowed', { status: 405 }));
      const req = createRequest('GET', 'http://localhost/api/invites/encrypt');
      const res = await onRequest(createContext(req, next));

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(405);
    });

    it('forwards GET /api/invites/decrypt to next() (handler returns 405)', async () => {
      const next = vi
        .fn()
        .mockResolvedValue(new Response('method-not-allowed', { status: 405 }));
      const req = createRequest('GET', 'http://localhost/api/invites/decrypt');
      const res = await onRequest(createContext(req, next));

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(405);
    });
  });

  describe('security response boundary', () => {
    it('decorates delegated tile responses without replacing public cache or MIME', async () => {
      const next = vi.fn().mockResolvedValue(
        new Response('tile-bytes', {
          status: 206,
          statusText: 'Partial Content',
          headers: {
            'Cache-Control': 'public, max-age=86400, s-maxage=604800',
            'Content-Type': 'image/png',
          },
        }),
      );
      const req = createRequest(
        'GET',
        'http://localhost/api/tiles?url=https://basemaps.cartocdn.com/tile.png',
      );

      const res = await onRequest(createContext(req, next));

      expectSecurityHeaders(res);
      expect(res.status).toBe(206);
      expect(res.statusText).toBe('Partial Content');
      expect(res.headers.get('Cache-Control')).toBe(
        'public, max-age=86400, s-maxage=604800',
      );
      expect(res.headers.get('Content-Type')).toContain('image/png');
      expect(await res.text()).toBe('tile-bytes');
    });

    it('decorates delegated invite errors while preserving no-store and body', async () => {
      const next = vi.fn().mockResolvedValue(
        new Response('invite-error', {
          status: 400,
          statusText: 'Bad Request',
          headers: { 'Cache-Control': 'no-store' },
        }),
      );
      const req = createRequest('POST', 'http://localhost/api/invites/encrypt');

      const res = await onRequest(createContext(req, next));

      expectSecurityHeaders(res);
      expect(res.status).toBe(400);
      expect(res.statusText).toBe('Bad Request');
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(await res.text()).toBe('invite-error');
    });

    it.each([
      ['tile', 'GET', 'http://localhost/api/tiles'],
      ['invite', 'POST', 'http://localhost/api/invites/decrypt'],
    ])(
      'converts a delegated %s throw into a generic decorated 500',
      async (_kind, method, url) => {
        const canaryDetail = 'CANARY_DELEGATED_ERROR_DETAIL';
        const next = vi.fn().mockRejectedValue(new Error(canaryDetail));

        const res = await onRequest(
          createContext(createRequest(method, url), next),
        );

        expectSecurityHeaders(res);
        expect(res.status).toBe(500);
        expect(res.headers.get('Cache-Control')).toBe('no-store');
        expect(await res.text()).not.toContain(canaryDetail);
      },
    );

    it('decorates archive validation errors and preserves no-store', async () => {
      const res = await onRequest(
        createContext(
          createRequest('GET', 'http://localhost/api/info'),
          vi.fn(),
        ),
      );

      expectSecurityHeaders(res);
      expect(res.status).toBe(400);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    });

    it('decorates archive upstream responses while preserving status, body, and no-store', async () => {
      const fetchSpy = vi.fn().mockResolvedValue(
        new Response('archive-body', {
          status: 202,
          statusText: 'Accepted',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=60',
          },
        }),
      );
      globalThis.fetch = fetchSpy as unknown as typeof fetch;
      const req = createRequest('GET', 'http://localhost/api/projects', {
        'x-target-url': 'https://archive.example.com',
      });

      const res = await onRequest(createContext(req, vi.fn()));

      expectSecurityHeaders(res);
      expect(res.status).toBe(202);
      expect(res.statusText).toBe('Accepted');
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(await res.text()).toBe('archive-body');
    });
  });

  // ── Archive proxy ────────────────────────────────────────────────────

  describe('archive proxy', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('rejects /api/info without x-target-url with 400', async () => {
      const next = vi.fn();
      const req = createRequest('GET', 'http://localhost/api/info');
      const res = await onRequest(createContext(req, next));

      expect(res.status).toBe(400);
      expect(next).not.toHaveBeenCalled();
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('ARCHIVE_PROXY_BAD_TARGET');
    });

    it('proxies /api/projects with x-target-url to upstream', async () => {
      const next = vi.fn();
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
      const res = await onRequest(createContext(req, next));

      expect(res.status).toBe(200);
      expect(next).not.toHaveBeenCalled();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      // fetch() receives a Request object — extract its URL
      const calledUrl =
        fetchSpy.mock.calls[0]?.[0]?.url ?? String(fetchSpy.mock.calls[0]?.[0]);
      expect(calledUrl).toContain('https://archive.example.com/projects');
    });

    it('proxies /api/info with x-target-url to upstream', async () => {
      const next = vi.fn();
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
      const res = await onRequest(createContext(req, next));

      expect(res.status).toBe(200);
      expect(next).not.toHaveBeenCalled();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      // fetch() receives a Request object — extract its URL
      const calledUrl =
        fetchSpy.mock.calls[0]?.[0]?.url ?? String(fetchSpy.mock.calls[0]?.[0]);
      expect(calledUrl).toContain('https://archive.example.com/info');
    });

    it('rejects POST /api/projects with 405 (not a write endpoint)', async () => {
      const next = vi.fn();
      const req = createRequest('POST', 'http://localhost/api/projects', {
        'x-target-url': 'https://archive.example.com',
      });
      const res = await onRequest(createContext(req, next));

      expect(res.status).toBe(405);
      expect(next).not.toHaveBeenCalled();
    });

    it('allows POST to /api/projects/:id/remoteDetectionAlerts', async () => {
      const next = vi.fn();
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
      const res = await onRequest(createContext(req, next));

      expect(res.status).toBe(201);
      expect(next).not.toHaveBeenCalled();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('rejects invalid upstream URL with 400', async () => {
      const next = vi.fn();
      const req = createRequest('GET', 'http://localhost/api/info', {
        'x-target-url': 'not-a-valid-url',
      });
      const res = await onRequest(createContext(req, next));

      expect(res.status).toBe(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 502 when upstream fetch fails', async () => {
      const next = vi.fn();
      const fetchSpy = vi.fn().mockRejectedValue(new Error('fetch failed'));
      globalThis.fetch = fetchSpy as unknown as typeof fetch;

      const req = createRequest('GET', 'http://localhost/api/projects', {
        'x-target-url': 'https://archive.example.com',
      });
      const res = await onRequest(createContext(req, next));

      expect(res.status).toBe(502);
      expect(next).not.toHaveBeenCalled();
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('ARCHIVE_PROXY_UPSTREAM_FAILED');
    });
  });
});
