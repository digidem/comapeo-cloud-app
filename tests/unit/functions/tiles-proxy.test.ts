import { afterEach, describe, expect, it, vi } from 'vitest';

import { onRequest } from '../../../functions/api/tiles/index';

function createRequest(method: string, url: string): Request {
  return new Request(url, { method });
}

function createContext(request: Request) {
  return { request } as Parameters<typeof onRequest>[0];
}

const ALLOWED_TILE_URL = 'https://basemaps.cartocdn.com/light_all/0/0/0.png';

const mockTileBody = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const mockTileResponse = new Response(mockTileBody, {
  status: 200,
  headers: { 'Content-Type': 'image/png', 'Content-Length': '4' },
});

describe('tile proxy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 405 for POST requests', async () => {
    const req = createRequest(
      'POST',
      `http://localhost/api/tiles?url=${encodeURIComponent(ALLOWED_TILE_URL)}`,
    );
    const res = await onRequest(createContext(req));

    expect(res.status).toBe(405);
  });

  it('returns 400 when url param is missing', async () => {
    const req = createRequest('GET', 'http://localhost/api/tiles');
    const res = await onRequest(createContext(req));

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid URL scheme (ftp://)', async () => {
    const req = createRequest(
      'GET',
      `http://localhost/api/tiles?url=${encodeURIComponent('ftp://example.com/tile.png')}`,
    );
    const res = await onRequest(createContext(req));

    expect(res.status).toBe(400);
    expect(await res.text()).toBe('Invalid URL scheme');
  });

  it('returns 403 for private IP http://127.0.0.1/', async () => {
    const req = createRequest(
      'GET',
      `http://localhost/api/tiles?url=${encodeURIComponent('http://127.0.0.1/tile.png')}`,
    );
    const res = await onRequest(createContext(req));

    expect(res.status).toBe(403);
    expect(await res.text()).toBe('Private network URLs not allowed');
  });

  it('returns 403 for bare public IP http://1.2.3.4/', async () => {
    const req = createRequest(
      'GET',
      `http://localhost/api/tiles?url=${encodeURIComponent('http://1.2.3.4/tile.png')}`,
    );
    const res = await onRequest(createContext(req));

    expect(res.status).toBe(403);
    expect(await res.text()).toBe('Numeric IP hostnames are not allowed');
  });

  it('returns 403 for localhost', async () => {
    const req = createRequest(
      'GET',
      `http://localhost/api/tiles?url=${encodeURIComponent('http://localhost/tile.png')}`,
    );
    const res = await onRequest(createContext(req));

    expect(res.status).toBe(403);
    expect(await res.text()).toBe('Private network URLs not allowed');
  });

  it('passes through a valid public URL', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockTileResponse);

    const req = createRequest(
      'GET',
      `http://localhost/api/tiles?url=${encodeURIComponent(ALLOWED_TILE_URL)}`,
    );
    const res = await onRequest(createContext(req));

    expect(res.status).toBe(200);
    expect(await res.arrayBuffer()).toEqual(mockTileBody.buffer);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      ALLOWED_TILE_URL,
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('returns 502 when upstream returns a redirect', async () => {
    const redirectResponse = new Response(null, {
      status: 302,
      headers: { Location: 'https://other.com/tile.png' },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(redirectResponse);

    const req = createRequest(
      'GET',
      `http://localhost/api/tiles?url=${encodeURIComponent(ALLOWED_TILE_URL)}`,
    );
    const res = await onRequest(createContext(req));

    expect(res.status).toBe(502);
    expect(await res.text()).toBe('Redirects are not supported');
  });

  it('returns 504 when upstream fetch times out', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      const error = new DOMException(
        'The operation was aborted.',
        'AbortError',
      );
      return Promise.reject(error);
    });

    const req = createRequest(
      'GET',
      `http://localhost/api/tiles?url=${encodeURIComponent(ALLOWED_TILE_URL)}`,
    );
    const res = await onRequest(createContext(req));

    expect(res.status).toBe(504);
    expect(await res.text()).toBe('Upstream timed out');
  });

  it('returns 502 when response Content-Length exceeds 5 MB', async () => {
    const largeResponse = new Response(mockTileBody, {
      status: 200,
      headers: { 'Content-Length': String(6 * 1024 * 1024) },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(largeResponse);

    const req = createRequest(
      'GET',
      `http://localhost/api/tiles?url=${encodeURIComponent(ALLOWED_TILE_URL)}`,
    );
    const res = await onRequest(createContext(req));

    expect(res.status).toBe(502);
    expect(await res.text()).toBe('Response too large');
  });

  it('returns 403 for hostname not in allowlist', async () => {
    const req = createRequest(
      'GET',
      `http://localhost/api/tiles?url=${encodeURIComponent('https://evil.example.com/tile.png')}`,
    );
    const res = await onRequest(createContext(req));

    expect(res.status).toBe(403);
    expect(await res.text()).toBe('Hostname not allowed');
  });

  it('returns 502 when upstream Content-Type is not allowed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    );

    const req = createRequest(
      'GET',
      `http://localhost/api/tiles?url=${encodeURIComponent(ALLOWED_TILE_URL)}`,
    );
    const res = await onRequest(createContext(req));

    expect(res.status).toBe(502);
    expect(await res.text()).toBe('Unsupported or missing content type');
  });

  it('returns 502 when upstream Content-Type is missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(mockTileBody, { status: 200 }),
    );

    const req = createRequest(
      'GET',
      `http://localhost/api/tiles?url=${encodeURIComponent(ALLOWED_TILE_URL)}`,
    );
    const res = await onRequest(createContext(req));

    expect(res.status).toBe(502);
    expect(await res.text()).toContain('content type');
  });

  // Rate-limit state is module-scoped and persists across tests in the same file;
  // this test must be last.
  it('returns 429 after exceeding rate limit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockTileResponse);
    const url = `http://localhost/api/tiles?url=${encodeURIComponent(ALLOWED_TILE_URL)}`;

    let lastRes: Response;
    for (let i = 0; i <= 2000; i++) {
      const req = createRequest('GET', url);
      lastRes = await onRequest(createContext(req));
    }

    expect(lastRes!).toBeInstanceOf(Response);
    expect(lastRes!.status).toBe(429);
    expect(await lastRes!.text()).toBe('Rate limit exceeded');
  });
});
