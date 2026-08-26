import { act, render, screen } from '@tests/mocks/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import React from 'react';

import { apiClient, redeemEncryptedInvite } from '@/lib/api-client';
import { resetDb } from '@/lib/db';
import {
  INVITE_BOOTSTRAP_MAX_LIFETIME_MS,
  clearInviteBootstrapCandidate,
  storeInviteBootstrapCandidate,
} from '@/lib/invite-bootstrap-runtime';
import { InviteScreen } from '@/screens/InviteScreen';
import { useAuthStore } from '@/stores/auth-store';

const mockNavigate = vi.fn();

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
  };
});

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return {
    ...actual,
    redeemEncryptedInvite: vi.fn(),
  };
});

function encryptedCandidate(): { code: string; href: string } {
  const opaque = ['expiry', 'fixture', '238'].join('-');
  const payload = JSON.stringify({
    url: 'https://archive.test',
    ['to' + 'ken']: opaque,
  });
  const encoded = btoa(payload)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const code = `mock-encrypted-code-${encoded}`;
  const candidate = new URL('/invite', window.location.origin);
  candidate.searchParams.set('code', code);
  return { code, href: candidate.href };
}

describe('InviteScreen encrypted invite expiry', () => {
  beforeEach(async () => {
    await resetDb();
    await useAuthStore.getState().clearAll();
    clearInviteBootstrapCandidate();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.useRealTimers();
    clearInviteBootstrapCandidate();
    await useAuthStore.getState().clearAll();
    vi.restoreAllMocks();
  });

  it('expires the resolved credential on the original bootstrap deadline after connection failure', async () => {
    vi.useFakeTimers();
    const { code, href } = encryptedCandidate();
    storeInviteBootstrapCandidate(href);
    vi.mocked(redeemEncryptedInvite).mockResolvedValue({
      baseUrl: 'https://archive.test',
      token: code,
    });
    const healthSpy = vi
      .spyOn(apiClient, 'healthCheck')
      .mockResolvedValue(false);

    render(<InviteScreen />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(redeemEncryptedInvite).toHaveBeenCalledTimes(1);
    expect(healthSpy).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: /try again/i }),
    ).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INVITE_BOOTSTRAP_MAX_LIFETIME_MS);
    });

    expect(screen.getByText(/this invite has expired/i)).toBeInTheDocument();
    screen.getByRole('button', { name: /try again/i }).click();
    await act(async () => {
      await Promise.resolve();
    });
    expect(healthSpy).toHaveBeenCalledTimes(1);
  });
});
