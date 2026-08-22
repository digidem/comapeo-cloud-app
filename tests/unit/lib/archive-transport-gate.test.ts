import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type ArchiveTransportDecision,
  withApprovedArchiveTransport,
} from '@/lib/archive-transport-gate';

function setStartup(state: string): void {
  document.documentElement.dataset.comapeoSecurityStartup = state;
}

describe('archive transport gate', () => {
  afterEach(() => setStartup('ready'));

  it('runs HTTPS immediately without confirmation using the normalized URL', async () => {
    const confirmInsecure = vi.fn();
    const operation = vi.fn(async (url: string) => `used:${url}`);

    await expect(
      withApprovedArchiveTransport({
        baseUrl: 'HTTPS://Archive.Example.com///',
        confirmInsecure,
        operation,
      }),
    ).resolves.toEqual({
      kind: 'completed',
      value: 'used:https://archive.example.com',
    });
    expect(confirmInsecure).not.toHaveBeenCalled();
    expect(operation).toHaveBeenCalledWith('https://archive.example.com');
  });

  it('returns invalid-url before confirmation or operation', async () => {
    const confirmInsecure = vi.fn();
    const operation = vi.fn();

    await expect(
      withApprovedArchiveTransport({
        baseUrl: 'file:///tmp/archive',
        confirmInsecure,
        operation,
      }),
    ).resolves.toMatchObject({ kind: 'invalid-url' });
    expect(confirmInsecure).not.toHaveBeenCalled();
    expect(operation).not.toHaveBeenCalled();
  });

  it('blocks HTTP until exact URL-bound approval is returned', async () => {
    const confirmInsecure = vi.fn(
      async (normalizedUrl: string): Promise<ArchiveTransportDecision> => ({
        kind: 'approved',
        normalizedUrl,
      }),
    );
    const operation = vi.fn(async () => 'connected');

    await expect(
      withApprovedArchiveTransport({
        baseUrl: 'http://archive.example.com/',
        confirmInsecure,
        operation,
      }),
    ).resolves.toEqual({ kind: 'completed', value: 'connected' });
    expect(confirmInsecure).toHaveBeenCalledWith('http://archive.example.com');
    expect(operation).toHaveBeenCalledWith('http://archive.example.com');
  });

  it('cancels HTTP without invoking operation', async () => {
    const operation = vi.fn();

    await expect(
      withApprovedArchiveTransport({
        baseUrl: 'http://archive.example.com',
        confirmInsecure: async () => ({ kind: 'cancelled' }),
        operation,
      }),
    ).resolves.toEqual({ kind: 'cancelled' });
    expect(operation).not.toHaveBeenCalled();
  });

  it('rejects a stale or forged approval bound to a different normalized URL', async () => {
    const operation = vi.fn();

    await expect(
      withApprovedArchiveTransport({
        baseUrl: 'http://archive.example.com',
        confirmInsecure: async () => ({
          kind: 'approved',
          normalizedUrl: 'http://different.example.com',
        }),
        operation,
      }),
    ).resolves.toEqual({ kind: 'stale-approval' });
    expect(operation).not.toHaveBeenCalled();
  });

  it.each([
    'storage-cleanup-required',
    'worker-transition-required',
    'unknown-marker',
  ])(
    'blocks before URL parsing/confirmation/operation in startup state %s',
    async (state) => {
      setStartup(state);
      const confirmInsecure = vi.fn();
      const operation = vi.fn();

      const result = await withApprovedArchiveTransport({
        baseUrl: 'http://archive.example.com',
        confirmInsecure,
        operation,
      });

      expect(result).toEqual({
        kind: 'startup-blocked',
        state:
          state === 'worker-transition-required'
            ? 'worker-transition-required'
            : 'storage-cleanup-required',
      });
      expect(confirmInsecure).not.toHaveBeenCalled();
      expect(operation).not.toHaveBeenCalled();
    },
  );
});
