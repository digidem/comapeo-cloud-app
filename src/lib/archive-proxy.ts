export const ARCHIVE_TARGET_HEADER = 'x-target-url';

type Result =
  | { ok: true; value: string }
  | {
      ok: false;
      code:
        | 'MISSING_ARCHIVE_TARGET'
        | 'INVALID_ARCHIVE_URL'
        | 'UNSUPPORTED_ARCHIVE_PROTOCOL'
        | 'UNSUPPORTED_ARCHIVE_URL_CREDENTIALS'
        | 'UNSUPPORTED_ARCHIVE_PROXY_METHOD'
        | 'UNSUPPORTED_ARCHIVE_PROXY_PATH';
      message: string;
    };

const FORWARDED_HEADERS = new Set([
  'accept',
  'accept-language',
  'authorization',
  'content-type',
]);

export function shouldForwardArchiveHeader(headerName: string): boolean {
  return FORWARDED_HEADERS.has(headerName.toLowerCase());
}

export function normalizeArchiveBaseUrl(value: string): Result {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return {
      ok: false,
      code: 'INVALID_ARCHIVE_URL',
      message: 'Enter a full URL including http:// or https://',
    };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      ok: false,
      code: 'UNSUPPORTED_ARCHIVE_PROTOCOL',
      message: 'Archive server URL must start with http:// or https://',
    };
  }

  if (url.username || url.password) {
    return {
      ok: false,
      code: 'UNSUPPORTED_ARCHIVE_URL_CREDENTIALS',
      message: 'Archive server URL must not include credentials',
    };
  }

  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '');

  return { ok: true, value: url.toString().replace(/\/$/, '') };
}

export function stripApiPrefix(pathname: string): string {
  const stripped = pathname.replace(/^\/api(?:\/|$)/, '/');
  return stripped === '' ? '/' : stripped;
}

export function buildArchiveTargetUrl(
  incomingRequestUrl: string,
  archiveBaseUrl: string | null,
): Result {
  if (!archiveBaseUrl) {
    return {
      ok: false,
      code: 'MISSING_ARCHIVE_TARGET',
      message: 'Missing archive target URL',
    };
  }

  const normalized = normalizeArchiveBaseUrl(archiveBaseUrl);
  if (!normalized.ok) return normalized;

  const incoming = new URL(incomingRequestUrl);
  const target = new URL(normalized.value);
  const basePath = target.pathname.replace(/\/+$/, '');
  const upstreamPath = stripApiPrefix(incoming.pathname);

  target.pathname = `${basePath}${upstreamPath}`.replace(/\/{2,}/g, '/');
  target.search = incoming.search;
  target.hash = '';

  return { ok: true, value: target.toString() };
}

export function validateArchiveProxyRequest(
  method: string,
  pathname: string,
): Result {
  const normalizedMethod = method.toUpperCase();
  if (!['GET', 'POST'].includes(normalizedMethod)) {
    return {
      ok: false,
      code: 'UNSUPPORTED_ARCHIVE_PROXY_METHOD',
      message: 'Archive proxy only supports GET and POST requests',
    };
  }

  const normalizedPath = pathname === '' ? '/' : pathname;
  const isReadEndpoint =
    normalizedPath === '/info' ||
    normalizedPath === '/healthcheck' ||
    normalizedPath === '/projects' ||
    /^\/projects\/[^/]+\/observations$/.test(normalizedPath) ||
    /^\/projects\/[^/]+\/remoteDetectionAlerts$/.test(normalizedPath) ||
    /^\/projects\/[^/]+\/attachments\/.+/.test(normalizedPath);
  const isWriteEndpoint = /^\/projects\/[^/]+\/remoteDetectionAlerts$/.test(
    normalizedPath,
  );

  if (
    (normalizedMethod === 'GET' && isReadEndpoint) ||
    (normalizedMethod === 'POST' && isWriteEndpoint)
  ) {
    return { ok: true, value: normalizedPath };
  }

  return {
    ok: false,
    code: 'UNSUPPORTED_ARCHIVE_PROXY_PATH',
    message: 'Archive proxy path is not supported',
  };
}

export function createForwardHeaders(headers: Headers): Headers {
  const output = new Headers();
  headers.forEach((value, key) => {
    if (shouldForwardArchiveHeader(key)) {
      output.set(key, value);
    }
  });
  return output;
}
