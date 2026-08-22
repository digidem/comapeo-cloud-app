import { describe, expect, it, vi } from 'vitest';

import { runSecurityPreflight } from '@/preflight';

function createHarness(
  href: string,
  options?: {
    cleanupResult?: { kind: 'ok' } | { kind: 'failed'; code: string };
    cleanupImportReject?: boolean;
    workerResult?: { kind: 'current' } | { kind: 'transition-required' };
    workerImportReject?: boolean;
    bootstrapImportReject?: boolean;
    mainImportReject?: boolean;
    historyReject?: boolean;
  },
) {
  const parsed = new URL(href);
  const order: string[] = [];
  const root = { dataset: {} as DOMStringMap };
  const replace = vi.fn(() => order.push('location-replace'));
  const replaceState = vi.fn(() => {
    order.push('history-replace');
    if (options?.historyReject) throw new Error('history blocked');
  });
  const cleanup = vi.fn(async () => {
    order.push('cleanup');
    return options?.cleanupResult ?? { kind: 'ok' as const };
  });
  const verifyWorker = vi.fn(async () => {
    order.push('worker-probe');
    return options?.workerResult ?? { kind: 'current' as const };
  });
  const store = vi.fn((_value: string) => {
    order.push('bootstrap-store');
    return { expiresAt: Date.now() + 300_000 };
  });
  const clear = vi.fn(() => order.push('bootstrap-clear'));
  let pagehide: (() => void) | undefined;
  const mainImport = vi.fn(async () => {
    order.push('main-import');
    if (options?.mainImportReject) throw new Error('main unavailable');
  });

  return {
    order,
    root,
    replace,
    replaceState,
    cleanup,
    verifyWorker,
    store,
    clear,
    mainImport,
    getPagehide: () => pagehide,
    deps: {
      location: {
        href,
        pathname: parsed.pathname,
        search: parsed.search,
        hash: parsed.hash,
        replace,
      },
      history: { replaceState },
      root,
      importCleanup: options?.cleanupImportReject
        ? async () => {
            throw new Error('cleanup chunk unavailable');
          }
        : async () => ({ cleanupLegacyCredentialStorage: cleanup }),
      importWorkerSecurity: options?.workerImportReject
        ? async () => {
            throw new Error('worker helper unavailable');
          }
        : async () => ({ verifyControllingServiceWorker: verifyWorker }),
      importBootstrap: options?.bootstrapImportReject
        ? async () => {
            throw new Error('bootstrap chunk unavailable');
          }
        : async () => ({
            storeInviteBootstrapCandidate: store,
            clearInviteBootstrapCandidate: clear,
          }),
      importMain: mainImport,
      addPagehideListener: (handler: () => void) => {
        pagehide = handler;
      },
      mark: vi.fn(),
    },
  };
}

describe('security preflight ordering', () => {
  it('canonicalizes invite query/hash before cleanup or any application import', async () => {
    const harness = createHarness(
      'https://app.example.com/InViTe/?code=invite-canary#fragment-canary',
    );

    await runSecurityPreflight(harness.deps);

    expect(harness.replaceState).toHaveBeenCalledWith(null, '', '/invite');
    expect(harness.order.slice(0, 3)).toEqual([
      'history-replace',
      'cleanup',
      'worker-probe',
    ]);
    expect(harness.root.dataset.comapeoSecurityStartup).toBe('ready');
    expect(harness.store).toHaveBeenCalledWith(
      'https://app.example.com/InViTe/?code=invite-canary#fragment-canary',
    );
    expect(harness.order.indexOf('bootstrap-store')).toBeLessThan(
      harness.order.indexOf('main-import'),
    );
  });

  it.each([
    { cleanupImportReject: true },
    {
      cleanupResult: {
        kind: 'failed' as const,
        code: 'LEGACY_STORAGE_CLEANUP_FAILED',
      },
    },
  ])(
    'fails closed for cleanup failure %# and discards invite candidate',
    async (options) => {
      const harness = createHarness(
        'https://app.example.com/invite?code=invite-canary',
        options,
      );

      await runSecurityPreflight(harness.deps);

      expect(harness.root.dataset.comapeoSecurityStartup).toBe(
        'storage-cleanup-required',
      );
      expect(harness.store).not.toHaveBeenCalled();
      expect(harness.verifyWorker).not.toHaveBeenCalled();
      expect(harness.mainImport).toHaveBeenCalledOnce();
    },
  );

  it.each([
    { workerResult: { kind: 'transition-required' as const } },
    { workerImportReject: true },
  ])(
    'requires worker transition for unverifiable controller %#',
    async (options) => {
      const harness = createHarness(
        'https://app.example.com/invite?code=invite-canary',
        options,
      );

      await runSecurityPreflight(harness.deps);

      expect(harness.root.dataset.comapeoSecurityStartup).toBe(
        'worker-transition-required',
      );
      expect(harness.store).not.toHaveBeenCalled();
      expect(harness.mainImport).toHaveBeenCalledOnce();
    },
  );

  it('clears the helper candidate on pagehide after successful transfer', async () => {
    const harness = createHarness(
      'https://app.example.com/invite?code=invite-canary',
    );

    await runSecurityPreflight(harness.deps);
    harness.getPagehide()?.();

    expect(harness.clear).toHaveBeenCalledOnce();
  });

  it('does not start main if the private bootstrap helper cannot load', async () => {
    const harness = createHarness(
      'https://app.example.com/invite?code=invite-canary',
      { bootstrapImportReject: true },
    );

    await runSecurityPreflight(harness.deps);

    expect(harness.mainImport).not.toHaveBeenCalled();
    expect(harness.root.dataset.comapeoSecurityStartup).toBe('ready');
  });

  it('clears transferred candidate when the later main import fails', async () => {
    const harness = createHarness(
      'https://app.example.com/invite?code=invite-canary',
      { mainImportReject: true },
    );

    await runSecurityPreflight(harness.deps);

    expect(harness.clear).toHaveBeenCalledOnce();
  });

  it('navigates to clean /invite and imports nothing when sanitization fails while the secret URL is visible', async () => {
    const harness = createHarness(
      'https://app.example.com/invite?code=invite-canary',
      { historyReject: true },
    );

    await runSecurityPreflight(harness.deps);

    expect(harness.replace).toHaveBeenCalledWith('/invite');
    expect(harness.cleanup).not.toHaveBeenCalled();
    expect(harness.verifyWorker).not.toHaveBeenCalled();
    expect(harness.mainImport).not.toHaveBeenCalled();
  });

  it('does not rewrite an ordinary route or a clean invite route', async () => {
    const ordinary = createHarness('https://app.example.com/data?filter=local');
    const cleanInvite = createHarness('https://app.example.com/invite');

    await runSecurityPreflight(ordinary.deps);
    await runSecurityPreflight(cleanInvite.deps);

    expect(ordinary.replaceState).not.toHaveBeenCalled();
    expect(cleanInvite.replaceState).not.toHaveBeenCalled();
    expect(ordinary.mainImport).toHaveBeenCalledOnce();
    expect(cleanInvite.mainImport).toHaveBeenCalledOnce();
  });
});
