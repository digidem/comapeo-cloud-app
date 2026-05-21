/**
 * Mock for invite URL parsing used by InviteScreen.
 */
import type { ParseInviteResult } from '@/lib/invite-url';

export function parseInviteUrl(url: string): ParseInviteResult {
  try {
    const parsed = new URL(url);
    const code = parsed.searchParams.get('code');
    if (code) {
      return { ok: true, kind: 'encrypted', code } as ParseInviteResult;
    }
    return { ok: false } as ParseInviteResult;
  } catch {
    return { ok: false } as ParseInviteResult;
  }
}

export function warnLegacyInviteUrlOnce() {
  /* no-op in Storybook */
}
