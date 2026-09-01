import { readFile, readdir, stat } from 'node:fs/promises';
import {
  type IncomingMessage,
  type ServerResponse,
  createServer,
} from 'node:http';
import path from 'node:path';

import {
  ARCHIVE_CREDENTIAL_REVISION,
  ARCHIVE_CREDENTIAL_REVISION_HEADER,
} from '../../src/lib/archive-proxy';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const legacyDistDir = process.env.SECURITY_E2E_LEGACY_DIST_DIR
  ? path.resolve(process.env.SECURITY_E2E_LEGACY_DIST_DIR)
  : null;
const port = Number(process.env.SECURITY_E2E_PORT ?? 4174);
let allowSecureWorker = true;
let deploymentMode: 'current' | 'legacy' = 'current';
const apiRequests: Array<{
  method: string;
  url: string;
  authorization: string | null;
  target: string | null;
}> = [];
const archiveForwards: typeof apiRequests = [];

const MIME: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml; charset=utf-8',
};

function send(
  response: ServerResponse,
  status: number,
  body: string | Buffer,
  contentType = 'text/plain; charset=utf-8',
): void {
  response.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
  });
  response.end(body);
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function listAssetUrls(): Promise<string[]> {
  const names = await readdir(path.join(distDir, 'assets'));
  return names.map((name) => `/assets/${name}`);
}

async function legacyWorkerSource(): Promise<string> {
  const assets = await listAssetUrls();
  const precache = JSON.stringify(['/', '/index.html', ...assets]);
  return `
const CACHE = 'legacy-shell-cache';
const PRECACHE = ${precache};
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request, { ignoreSearch: event.request.mode === 'navigate' }).then((cached) => cached || fetch(event.request)));
});
`;
}

function decodeInviteCode(code: string): { url: string; token: string } | null {
  if (!code.startsWith('e2e-')) return null;
  try {
    const payload = Buffer.from(code.slice(4), 'base64url').toString('utf8');
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    if (typeof parsed.url !== 'string' || typeof parsed.token !== 'string') {
      return null;
    }
    return { url: parsed.url, token: parsed.token };
  } catch {
    return null;
  }
}

async function handleApi(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<void> {
  const requestRecord = {
    method: request.method ?? 'GET',
    url: url.pathname + url.search,
    authorization:
      typeof request.headers.authorization === 'string'
        ? request.headers.authorization
        : null,
    target:
      typeof request.headers['x-target-url'] === 'string'
        ? request.headers['x-target-url']
        : null,
  };
  apiRequests.push(requestRecord);

  if (url.pathname === '/api/invites/decrypt' && request.method === 'POST') {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(await readBody(request)) as Record<string, unknown>;
    } catch {
      send(
        response,
        400,
        JSON.stringify({ error: { code: 'INVITE_BAD_JSON' } }),
        'application/json',
      );
      return;
    }
    const code = typeof body.code === 'string' ? body.code : '';
    const decoded = decodeInviteCode(code);
    if (!decoded) {
      send(
        response,
        400,
        JSON.stringify({ error: { code: 'INVITE_DECRYPT_FAILED' } }),
        'application/json',
      );
      return;
    }
    send(response, 200, JSON.stringify(decoded), 'application/json');
    return;
  }

  // Generic archive API calls model a request that would be forwarded by the
  // deployed Pages Function. Once the secure deployment is active, stale
  // clients may still send their historical persisted bearer to same-origin
  // /api, but the Pages boundary must not forward it to the archive unless the
  // request proves it came from the hardened credential client revision.
  if (
    deploymentMode === 'current' &&
    requestRecord.authorization &&
    request.headers[ARCHIVE_CREDENTIAL_REVISION_HEADER] !==
      ARCHIVE_CREDENTIAL_REVISION
  ) {
    send(
      response,
      428,
      JSON.stringify({
        error: { code: 'ARCHIVE_CLIENT_SECURITY_UPDATE_REQUIRED' },
      }),
      'application/json',
    );
    return;
  }
  archiveForwards.push(requestRecord);

  if (url.pathname === '/api/healthcheck') {
    send(response, 200, JSON.stringify({ ok: true }), 'application/json');
    return;
  }

  if (url.pathname === '/api/projects') {
    send(response, 200, JSON.stringify({ data: [] }), 'application/json');
    return;
  }

  if (/^\/api\/projects\/[^/]+\/icon\//.test(url.pathname)) {
    send(
      response,
      200,
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><circle cx=".5" cy=".5" r=".5"/></svg>',
      'image/svg+xml',
    );
    return;
  }

  if (url.pathname.startsWith('/api/projects/')) {
    send(response, 200, JSON.stringify({ data: [] }), 'application/json');
    return;
  }

  send(
    response,
    404,
    JSON.stringify({ error: { code: 'NOT_FOUND' } }),
    'application/json',
  );
}

const server = createServer(async (request, response) => {
  const origin = `http://${request.headers.host ?? `127.0.0.1:${port}`}`;
  const url = new URL(request.url ?? '/', origin);

  if (url.pathname === '/__security_e2e__/worker') {
    allowSecureWorker = url.searchParams.get('allow') !== '0';
    send(
      response,
      200,
      JSON.stringify({ allowSecureWorker }),
      'application/json',
    );
    return;
  }
  if (url.pathname === '/__security_e2e__/deployment') {
    const requestedMode = url.searchParams.get('mode');
    if (requestedMode !== 'current' && requestedMode !== 'legacy') {
      send(response, 400, JSON.stringify({ error: 'invalid deployment mode' }));
      return;
    }
    if (requestedMode === 'legacy' && !legacyDistDir) {
      send(response, 409, JSON.stringify({ error: 'legacy dist unavailable' }));
      return;
    }
    deploymentMode = requestedMode;
    send(response, 200, JSON.stringify({ deploymentMode }), 'application/json');
    return;
  }
  if (url.pathname === '/__security_e2e__/requests') {
    send(response, 200, JSON.stringify(apiRequests), 'application/json');
    return;
  }
  if (url.pathname === '/__security_e2e__/forwards') {
    send(response, 200, JSON.stringify(archiveForwards), 'application/json');
    return;
  }
  if (url.pathname === '/__security_e2e__/requests/clear') {
    apiRequests.length = 0;
    archiveForwards.length = 0;
    send(response, 200, JSON.stringify({ ok: true }), 'application/json');
    return;
  }
  if (url.pathname === '/__security_e2e__/blank') {
    send(
      response,
      200,
      '<!doctype html><title>security e2e blank</title>',
      'text/html; charset=utf-8',
    );
    return;
  }
  if (url.pathname === '/legacy-sw.js') {
    send(
      response,
      200,
      await legacyWorkerSource(),
      'text/javascript; charset=utf-8',
    );
    return;
  }
  if (
    url.pathname === '/sw.js' &&
    deploymentMode !== 'legacy' &&
    !allowSecureWorker
  ) {
    send(
      response,
      503,
      '// secure worker intentionally unavailable for transition test',
      'text/javascript; charset=utf-8',
    );
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    await handleApi(request, response, url);
    return;
  }

  const activeDistDir =
    deploymentMode === 'legacy' && legacyDistDir ? legacyDistDir : distDir;
  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const candidate = path.join(activeDistDir, requestedPath.replace(/^\//, ''));
  try {
    const candidateStat = await stat(candidate);
    if (candidateStat.isFile()) {
      const body = await readFile(candidate);
      send(
        response,
        200,
        body,
        MIME[path.extname(candidate)] ?? 'application/octet-stream',
      );
      return;
    }
  } catch {
    // SPA fallback below.
  }

  const index = await readFile(path.join(activeDistDir, 'index.html'));
  send(response, 200, index, 'text/html; charset=utf-8');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[security-production-server] http://127.0.0.1:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
