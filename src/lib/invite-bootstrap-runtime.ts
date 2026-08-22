export const INVITE_BOOTSTRAP_MAX_LIFETIME_MS = 300_000 as const;

export type InviteBootstrapConsumeResult =
  | { kind: 'candidate'; value: string; expiresAt: number }
  | { kind: 'expired' }
  | { kind: 'empty' };

interface StoredCandidate {
  value: string;
  expiresAt: number;
}

let candidate: StoredCandidate | null = null;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
let expiredPending = false;

function cancelExpiryTimer(): void {
  if (expiryTimer !== undefined) {
    clearTimeout(expiryTimer);
    expiryTimer = undefined;
  }
}

export function clearInviteBootstrapCandidate(): void {
  cancelExpiryTimer();
  candidate = null;
  expiredPending = false;
}

export function storeInviteBootstrapCandidate(value: string): {
  expiresAt: number;
} {
  clearInviteBootstrapCandidate();
  const expiresAt = Date.now() + INVITE_BOOTSTRAP_MAX_LIFETIME_MS;
  candidate = { value, expiresAt };
  expiryTimer = setTimeout(() => {
    candidate = null;
    expiryTimer = undefined;
    expiredPending = true;
  }, INVITE_BOOTSTRAP_MAX_LIFETIME_MS);
  return { expiresAt };
}

export function consumeInviteBootstrapCandidate(): InviteBootstrapConsumeResult {
  if (expiredPending) {
    expiredPending = false;
    return { kind: 'expired' };
  }

  if (!candidate) return { kind: 'empty' };
  if (Date.now() >= candidate.expiresAt) {
    cancelExpiryTimer();
    candidate = null;
    return { kind: 'expired' };
  }

  const consumed = candidate;
  cancelExpiryTimer();
  candidate = null;
  return {
    kind: 'candidate',
    value: consumed.value,
    expiresAt: consumed.expiresAt,
  };
}
