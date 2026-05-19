export type ParseInviteResult =
  | { ok: true; kind: 'encrypted'; code: string }
  | { ok: true; kind: 'legacy'; baseUrl: string; token: string }
  | { ok: false; code: string; message: string };

// Module-level guard so the legacy-deprecation warning fires at most once per session.
// TODO(issue-#8): remove this helper and every `kind: 'legacy'` consumer in the next release.
let legacyWarningEmitted = false;

export function warnLegacyInviteUrlOnce(): void {
  if (legacyWarningEmitted) return;
  legacyWarningEmitted = true;
  console.warn(
    'Invite URL with raw token is deprecated; please request a new invite.',
  );
}

/** Reset the legacy-warning guard. Exported for test use only. */
export function resetLegacyWarningForTests(): void {
  legacyWarningEmitted = false;
}

export function parseInviteUrl(input: string): ParseInviteResult {
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

  const codeParam = url.searchParams.get('code');
  if (codeParam) {
    return { ok: true, kind: 'encrypted', code: codeParam };
  }

  const baseUrl = url.searchParams.get('url');
  if (!baseUrl) {
    return {
      ok: false,
      code: 'MISSING_URL',
      message: 'Missing url query parameter',
    };
  }

  // TODO(issue-#8): remove the `token`/`hash` legacy fallback in the next release.
  // It exists for one-release backward compatibility with invite URLs issued
  // before AES-GCM encryption shipped. See the discriminated `kind: 'legacy'`
  // consumers in InviteScreen.tsx and AddArchiveServerDialog.tsx.
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

  return { ok: true, kind: 'legacy', baseUrl, token };
}
