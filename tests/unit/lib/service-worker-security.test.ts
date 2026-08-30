import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SERVICE_WORKER_SECURITY_PROBE,
  SERVICE_WORKER_SECURITY_REVISION,
  hasSensitiveInviteRequestUrl,
  requestCarriesCredentialHeader,
  verifyControllingServiceWorker,
} from '@/lib/service-worker-security';

interface FakePort {
  onmessage: ((event: MessageEvent) => void) | null;
  close: ReturnType<typeof vi.fn>;
}

function channelFactory() {
  const port1: FakePort = { onmessage: null, close: vi.fn() };
  const port2: FakePort = { onmessage: null, close: vi.fn() };
  return {
    port1,
    port2,
    emit(data: unknown) {
      port1.onmessage?.({ data } as MessageEvent);
    },
  };
}

describe('service worker security revision probe', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes immediately when no service worker controls the page', async () => {
    await expect(
      verifyControllingServiceWorker({ controller: null }),
    ).resolves.toEqual({ kind: 'current' });
  });

  it('passes only when the controller reports the exact current revision', async () => {
    const channel = channelFactory();
    const controller = {
      postMessage: vi.fn((_message: unknown, _transfer: Transferable[]) => {
        queueMicrotask(() => {
          channel.emit({
            type: SERVICE_WORKER_SECURITY_PROBE,
            revision: SERVICE_WORKER_SECURITY_REVISION,
          });
        });
      }),
    };

    await expect(
      verifyControllingServiceWorker({
        controller,
        createMessageChannel: () => channel as unknown as MessageChannel,
      }),
    ).resolves.toEqual({ kind: 'current' });
    expect(controller.postMessage).toHaveBeenCalledWith(
      { type: SERVICE_WORKER_SECURITY_PROBE },
      [channel.port2],
    );
  });

  it.each([
    { type: SERVICE_WORKER_SECURITY_PROBE, revision: 'old-revision' },
    { type: 'wrong-type', revision: SERVICE_WORKER_SECURITY_REVISION },
    null,
  ])('fails closed for old or malformed response %#', async (response) => {
    const channel = channelFactory();
    const controller = {
      postMessage: vi.fn(() => {
        queueMicrotask(() => channel.emit(response));
      }),
    };

    await expect(
      verifyControllingServiceWorker({
        controller,
        createMessageChannel: () => channel as unknown as MessageChannel,
      }),
    ).resolves.toEqual({ kind: 'transition-required' });
  });

  it('re-probes a replacement controller that takes over during a failed revision probe', async () => {
    const firstChannel = channelFactory();
    const secondChannel = channelFactory();
    let activeController: { postMessage: ReturnType<typeof vi.fn> };

    const currentController = {
      postMessage: vi.fn(() => {
        queueMicrotask(() => {
          secondChannel.emit({
            type: SERVICE_WORKER_SECURITY_PROBE,
            revision: SERVICE_WORKER_SECURITY_REVISION,
          });
        });
      }),
    };
    const oldController = {
      postMessage: vi.fn(() => {
        activeController = currentController;
        queueMicrotask(() => {
          firstChannel.emit({
            type: SERVICE_WORKER_SECURITY_PROBE,
            revision: 'old-revision',
          });
        });
      }),
    };
    activeController = oldController;

    vi.stubGlobal('navigator', {
      serviceWorker: {
        get controller() {
          return activeController;
        },
      },
    });
    const channels = [firstChannel, secondChannel];

    await expect(
      verifyControllingServiceWorker({
        createMessageChannel: () =>
          channels.shift() as unknown as MessageChannel,
      }),
    ).resolves.toEqual({ kind: 'current' });
    expect(oldController.postMessage).toHaveBeenCalledTimes(1);
    expect(currentController.postMessage).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the controller does not respond before the 1s deadline', async () => {
    vi.useFakeTimers();
    const channel = channelFactory();
    const controller = { postMessage: vi.fn() };

    const result = verifyControllingServiceWorker({
      controller,
      timeoutMs: 1_000,
      createMessageChannel: () => channel as unknown as MessageChannel,
    });
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(result).resolves.toEqual({ kind: 'transition-required' });
    expect(channel.port1.close).toHaveBeenCalled();
  });

  it('fails closed when posting the probe throws', async () => {
    const controller = {
      postMessage: vi.fn(() => {
        throw new Error('controller unavailable');
      }),
    };

    await expect(
      verifyControllingServiceWorker({ controller }),
    ).resolves.toEqual({ kind: 'transition-required' });
  });

  it('detects credential-bearing requests before runtime cache matching', () => {
    const request = new Request('https://tiles.example.com/a', {
      headers: { authorization: 'Bearer canary' },
    });
    expect(requestCarriesCredentialHeader(request)).toBe(true);
    expect(
      requestCarriesCredentialHeader(
        new Request('https://tiles.example.com/a'),
      ),
    ).toBe(false);
  });

  it('detects sensitive invite query keys without treating clean routes as sensitive', () => {
    expect(
      hasSensitiveInviteRequestUrl(
        'https://app.example.com/INVITE/?code=invite-canary',
      ),
    ).toBe(true);
    expect(
      hasSensitiveInviteRequestUrl(
        'https://app.example.com/invite?hash=legacy-canary',
      ),
    ).toBe(true);
    expect(hasSensitiveInviteRequestUrl('https://app.example.com/invite')).toBe(
      false,
    );
    expect(
      hasSensitiveInviteRequestUrl(
        'https://app.example.com/not-invite?code=harmless-here',
      ),
    ).toBe(false);
  });
});
