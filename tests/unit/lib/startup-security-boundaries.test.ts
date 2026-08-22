import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient, redeemEncryptedInvite } from '@/lib/api-client';
import { SecurityStartupBlockedError } from '@/lib/security-startup-gate';
import { syncArchive } from '@/lib/sync-coordinator';
import { useAuthStore } from '@/stores/auth-store';

const TEST_CREDENTIAL = String(238001);
const STATES = [
  'storage-cleanup-required',
  'worker-transition-required',
] as const;

function setMarker(value: string | undefined): void {
  if (value === undefined) {
    delete document.documentElement.dataset.comapeoSecurityStartup;
  } else {
    document.documentElement.dataset.comapeoSecurityStartup = value;
  }
}

describe('shared startup-security boundaries', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
    useAuthStore.setState({
      tier: 'local',
      servers: [],
      activeServerId: null,
      token: null,
      baseUrl: null,
      isAuthenticated: false,
      hasHydratedServers: false,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it.each(STATES)(
    'blocks api requests, invite decrypt, sync, and credential adoption in %s',
    async (state) => {
      setMarker(state);

      await expect(
        apiClient.healthCheck({
          baseUrl: 'https://archive.example.com',
          token: TEST_CREDENTIAL,
          serverId: null,
        }),
      ).resolves.toBe(false);
      expect(globalThis.fetch).not.toHaveBeenCalled();

      await expect(
        redeemEncryptedInvite('invite-canary'),
      ).rejects.toMatchObject({
        code: 'security-startup-blocked',
        state,
      });
      expect(globalThis.fetch).not.toHaveBeenCalled();

      await expect(syncArchive('server-1')).resolves.toMatchObject({
        success: false,
        errorCode: state,
      });

      await expect(
        useAuthStore.getState().addServer({
          label: 'Blocked',
          baseUrl: 'https://archive.example.com',
          token: TEST_CREDENTIAL,
        }),
      ).rejects.toMatchObject({
        code: 'security-startup-blocked',
        state,
      });
      expect(useAuthStore.getState().servers).toEqual([]);
    },
  );

  it.each([undefined, '', 'READY', 'unknown'])(
    'fails closed for missing/malformed marker %s',
    async (marker) => {
      setMarker(marker);

      await expect(
        apiClient.getProjects({
          baseUrl: 'https://archive.example.com',
          token: TEST_CREDENTIAL,
          serverId: null,
        }),
      ).rejects.toBeInstanceOf(SecurityStartupBlockedError);
      expect(globalThis.fetch).not.toHaveBeenCalled();

      await expect(
        useAuthStore.getState().setToken(TEST_CREDENTIAL),
      ).rejects.toBeInstanceOf(SecurityStartupBlockedError);
      expect(useAuthStore.getState().token).toBeNull();
    },
  );

  it('allows the same boundaries when the exact ready marker is present', async () => {
    setMarker('ready');
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      apiClient.getProjects({
        baseUrl: 'https://archive.example.com',
        token: TEST_CREDENTIAL,
        serverId: null,
      }),
    ).resolves.toMatchObject({ data: [] });
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });
});
