import {
  ARCHIVE_TARGET_HEADER,
  buildArchiveTargetUrl,
  createForwardHeaders,
  stripApiPrefix,
  validateArchiveProxyRequest,
} from '../../src/lib/archive-proxy';

interface PagesContext {
  request: Request;
}

function jsonError(status: number, code: string, message: string): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function withNoStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function onRequest({ request }: PagesContext): Promise<Response> {
  const requestUrl = new URL(request.url);
  const upstreamPath = stripApiPrefix(requestUrl.pathname);
  const proxyRequest = validateArchiveProxyRequest(
    request.method,
    upstreamPath,
  );
  if (!proxyRequest.ok) {
    return jsonError(405, proxyRequest.code, proxyRequest.message);
  }

  const target = buildArchiveTargetUrl(
    request.url,
    request.headers.get(ARCHIVE_TARGET_HEADER),
  );

  if (!target.ok) {
    return jsonError(400, 'ARCHIVE_PROXY_BAD_TARGET', target.message);
  }

  const method = request.method.toUpperCase();
  const body = method === 'GET' || method === 'HEAD' ? undefined : request.body;
  const proxiedRequest = new Request(target.value, {
    method,
    headers: createForwardHeaders(request.headers),
    body,
    redirect: 'manual',
  });

  try {
    return withNoStore(await fetch(proxiedRequest));
  } catch {
    return jsonError(
      502,
      'ARCHIVE_PROXY_UPSTREAM_FAILED',
      'Archive server request failed',
    );
  }
}
