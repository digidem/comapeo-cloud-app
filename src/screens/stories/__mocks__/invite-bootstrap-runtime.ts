/**
 * Storybook-only private invite bootstrap mock.
 *
 * Production receives this one-shot value from the zero-import preflight.
 * Storybook renders the app graph directly, so InviteScreen stories need an
 * equivalent in-memory candidate without placing an invite in URL/storage.
 */
const STORY_INVITE_URL =
  'https://storybook.example/invite?code=storybook-encrypted-invite';

let consumed = false;

function isInviteStory(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    new URLSearchParams(window.location.search)
      .get('id')
      ?.startsWith('screens-invite--') === true
  );
}

export function consumeInviteBootstrapCandidate():
  { kind: 'candidate'; value: string; expiresAt: number } | { kind: 'empty' } {
  if (!isInviteStory() || consumed) return { kind: 'empty' };
  consumed = true;
  return {
    kind: 'candidate',
    value: STORY_INVITE_URL,
    expiresAt: Date.now() + 300_000,
  };
}

export function clearInviteBootstrapCandidate(): void {
  consumed = true;
}

export function storeInviteBootstrapCandidate(_value: string): {
  expiresAt: number;
} {
  consumed = false;
  return { expiresAt: Date.now() + 300_000 };
}
