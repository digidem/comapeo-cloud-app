import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  INVITE_BOOTSTRAP_MAX_LIFETIME_MS,
  clearInviteBootstrapCandidate,
  consumeInviteBootstrapCandidate,
  storeInviteBootstrapCandidate,
} from '@/lib/invite-bootstrap-runtime';

const CANARY = 'https://example.test/invite?code=invite-canary-238';

describe('invite bootstrap runtime memory', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-19T12:00:00.000Z'));
    clearInviteBootstrapCandidate();
  });

  afterEach(() => {
    clearInviteBootstrapCandidate();
    vi.useRealTimers();
  });

  it('stores one candidate in module memory and consumes it exactly once', () => {
    const stored = storeInviteBootstrapCandidate(CANARY);

    expect(stored.expiresAt).toBe(
      Date.now() + INVITE_BOOTSTRAP_MAX_LIFETIME_MS,
    );
    expect(consumeInviteBootstrapCandidate()).toEqual({
      kind: 'candidate',
      value: CANARY,
      expiresAt: stored.expiresAt,
    });
    expect(consumeInviteBootstrapCandidate()).toEqual({ kind: 'empty' });
  });

  it('returns expired without retaining the candidate after the absolute deadline', async () => {
    storeInviteBootstrapCandidate(CANARY);

    await vi.advanceTimersByTimeAsync(INVITE_BOOTSTRAP_MAX_LIFETIME_MS);

    expect(consumeInviteBootstrapCandidate()).toEqual({ kind: 'expired' });
    expect(consumeInviteBootstrapCandidate()).toEqual({ kind: 'empty' });
  });

  it('does not extend the absolute deadline when consumed close to expiry', async () => {
    const stored = storeInviteBootstrapCandidate(CANARY);
    await vi.advanceTimersByTimeAsync(INVITE_BOOTSTRAP_MAX_LIFETIME_MS - 1);

    expect(consumeInviteBootstrapCandidate()).toEqual({
      kind: 'candidate',
      value: CANARY,
      expiresAt: stored.expiresAt,
    });
    expect(stored.expiresAt).toBe(Date.now() + 1);
  });

  it('clear removes candidate and expiry state', async () => {
    storeInviteBootstrapCandidate(CANARY);
    clearInviteBootstrapCandidate();
    await vi.advanceTimersByTimeAsync(INVITE_BOOTSTRAP_MAX_LIFETIME_MS);

    expect(consumeInviteBootstrapCandidate()).toEqual({ kind: 'empty' });
  });

  it('replacing a candidate cancels the previous expiry timer', async () => {
    storeInviteBootstrapCandidate(CANARY);
    await vi.advanceTimersByTimeAsync(60_000);
    const replacement = storeInviteBootstrapCandidate(
      'https://example.test/invite?code=replacement',
    );

    await vi.advanceTimersByTimeAsync(
      INVITE_BOOTSTRAP_MAX_LIFETIME_MS - 60_000,
    );
    expect(consumeInviteBootstrapCandidate()).toEqual({
      kind: 'candidate',
      value: 'https://example.test/invite?code=replacement',
      expiresAt: replacement.expiresAt,
    });
  });
});
