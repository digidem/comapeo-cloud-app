type ParseResult =
  | { ok: true; baseUrl: string; token: string }
  | { ok: false; code: string; message: string };

export function parseInviteUrl(input: string): ParseResult {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, code: 'INVALID_URL', message: 'Not a valid URL' };
  }

  if (url.pathname !== '/invite') {
    return {
      ok: false,
      code: 'INVALID_PATH',
      message: 'URL path must be /invite',
    };
  }

  const baseUrl = url.searchParams.get('url');
  if (!baseUrl) {
    return {
      ok: false,
      code: 'MISSING_URL',
      message: 'Missing url query parameter',
    };
  }

  const tokenParam = url.searchParams.get('token');
  const hashParam = url.searchParams.get('hash');
  const token = tokenParam ?? hashParam;

  if (!token) {
    return {
      ok: false,
      code: 'MISSING_TOKEN',
      message: 'Missing token or hash query parameter',
    };
  }

  return { ok: true, baseUrl, token };
}
