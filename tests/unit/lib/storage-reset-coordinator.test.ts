import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  closeCategoriesDbForStorageReset,
  resetCategoriesDbIsolated,
} from '@/lib/categories-db';
import { removeComapeoKeys } from '@/lib/comapeo-local-storage';
import { closeDbForStorageReset, resetDbIsolated } from '@/lib/db';
import {
  STORAGE_RESET_COORDINATION_KEY,
  STORAGE_RESET_LEASE_MS,
  beginStorageResetCoordination,
  registerStorageResetCoordinator,
  runStorageResetOwnerOperation,
} from '@/lib/storage-reset-coordinator';

vi.mock('@/lib/db', () => ({
  closeDbForStorageReset: vi.fn(),
  resetDbIsolated: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/categories-db', () => ({
  closeCategoriesDbForStorageReset: vi.fn(),
  resetCategoriesDbIsolated: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/comapeo-local-storage', () => ({
  removeComapeoKeys: vi.fn(() => ({
    failedKeys: [],
    enumerationFailed: false,
  })),
}));

function dispatchResetSignal(
  phase: 'start' | 'complete' | 'abort',
  generation = 'generation-1',
) {
  const value = JSON.stringify({
    version: 1,
    generation,
    sourceTabId: 'other-tab',
    phase,
    createdAt: Date.now(),
  });
  // A real storage event is delivered after the receiving tab's localStorage
  // has already observed the new value; mirror that ordering in the test.
  localStorage.setItem(STORAGE_RESET_COORDINATION_KEY, value);
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: STORAGE_RESET_COORDINATION_KEY,
      newValue: value,
      storageArea: localStorage,
    }),
  );
}

function dispatchResetSignalEvent(
  phase: 'start' | 'complete' | 'abort',
  generation: string,
) {
  const value = JSON.stringify({
    version: 1,
    generation,
    sourceTabId: 'other-tab',
    phase,
    createdAt: Date.now(),
  });
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: STORAGE_RESET_COORDINATION_KEY,
      newValue: value,
      storageArea: localStorage,
    }),
  );
}

describe('storage reset coordinator', () => {
  beforeEach(() => {
    let lockTail = Promise.resolve();
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: vi.fn(
          (_name: string, _options: LockOptions, callback: () => unknown) => {
            const result = lockTail.then(callback, callback);
            lockTail = result.then(
              () => undefined,
              () => undefined,
            );
            return result;
          },
        ),
      },
    });
    vi.clearAllMocks();
    localStorage.clear();
    Object.defineProperty(window, 'location', {
      value: { reload: vi.fn() },
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('quiesces open database connections as soon as another tab starts a reset', async () => {
    const { unregister } = registerStorageResetCoordinator();

    try {
      dispatchResetSignal('start');

      await vi.waitFor(() => {
        expect(closeDbForStorageReset).toHaveBeenCalledOnce();
        expect(closeCategoriesDbForStorageReset).toHaveBeenCalledOnce();
      });
      expect(resetDbIsolated).not.toHaveBeenCalled();
      expect(window.location.reload).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  it('honors a renewed durable lease when the original recovery timer fires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-14T12:00:00.000Z'));
    const { unregister } = registerStorageResetCoordinator();

    try {
      dispatchResetSignal('start', 'renewed-generation');
      await vi.advanceTimersByTimeAsync(STORAGE_RESET_LEASE_MS - 1000);

      localStorage.setItem(
        STORAGE_RESET_COORDINATION_KEY,
        JSON.stringify({
          version: 1,
          generation: 'renewed-generation',
          sourceTabId: 'other-tab',
          phase: 'start',
          createdAt: Date.now(),
        }),
      );

      // The old timeout now fires, but the authoritative durable lease is fresh
      // even though this tab received no additional storage/broadcast event.
      await vi.advanceTimersByTimeAsync(1000);
      expect(resetCategoriesDbIsolated).not.toHaveBeenCalled();
      expect(resetDbIsolated).not.toHaveBeenCalled();
      expect(window.location.reload).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(STORAGE_RESET_LEASE_MS - 1000);
      expect(resetCategoriesDbIsolated).toHaveBeenCalledOnce();
      expect(resetDbIsolated).toHaveBeenCalledOnce();
      expect(window.location.reload).toHaveBeenCalledOnce();
    } finally {
      unregister();
    }
  });

  it('automatically takes over when an initiating tab disappears after reset-start', async () => {
    vi.useFakeTimers();
    const { unregister } = registerStorageResetCoordinator();

    try {
      dispatchResetSignal('start', 'crashed-live-generation');
      expect(resetDbIsolated).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(STORAGE_RESET_LEASE_MS);

      expect(resetCategoriesDbIsolated).toHaveBeenCalledOnce();
      expect(resetDbIsolated).toHaveBeenCalledOnce();
      expect(removeComapeoKeys).toHaveBeenCalledWith({ bestEffort: true });
      expect(window.location.reload).toHaveBeenCalledOnce();
      expect(
        JSON.parse(
          localStorage.getItem(STORAGE_RESET_COORDINATION_KEY) ?? '{}',
        ),
      ).toMatchObject({
        generation: 'crashed-live-generation',
        phase: 'complete',
      });
    } finally {
      unregister();
    }
  });

  it('quiesces a tab opened while a reset is already in progress', () => {
    localStorage.setItem(
      STORAGE_RESET_COORDINATION_KEY,
      JSON.stringify({
        version: 1,
        generation: 'generation-1',
        sourceTabId: 'other-tab',
        phase: 'start',
        createdAt: Date.now(),
      }),
    );

    const registration = registerStorageResetCoordinator();

    try {
      expect(registration.resetInProgress).toBe(true);
      expect(closeDbForStorageReset).toHaveBeenCalledOnce();
      expect(closeCategoriesDbForStorageReset).toHaveBeenCalledOnce();
    } finally {
      registration.unregister();
    }
  });

  it('fails closed when the first startup coordination read fails transiently', async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      STORAGE_RESET_COORDINATION_KEY,
      JSON.stringify({
        version: 1,
        generation: 'startup-read-failure',
        sourceTabId: 'other-tab',
        phase: 'start',
        createdAt: Date.now(),
      }),
    );
    const originalGetItem = Storage.prototype.getItem;
    let failFirstCoordinationRead = true;
    const getItemSpy = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(function (this: Storage, key: string) {
        if (
          failFirstCoordinationRead &&
          key === STORAGE_RESET_COORDINATION_KEY
        ) {
          failFirstCoordinationRead = false;
          throw new DOMException('Transient read failure', 'SecurityError');
        }
        return originalGetItem.call(this, key);
      });

    const registration = registerStorageResetCoordinator();

    try {
      // main.tsx uses this synchronous flag to decide whether the app may mount.
      // An indeterminate startup read must therefore be treated as reset-pending.
      expect(registration.resetInProgress).toBe(true);
      expect(closeDbForStorageReset).toHaveBeenCalledOnce();
      expect(closeCategoriesDbForStorageReset).toHaveBeenCalledOnce();
      expect(resetDbIsolated).not.toHaveBeenCalled();

      // No second storage/broadcast event arrives. The scheduled authoritative
      // reconciliation discovers the existing start generation on its own.
      await vi.advanceTimersByTimeAsync(1_000);
      expect(window.location.reload).not.toHaveBeenCalled();
      expect(resetDbIsolated).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(STORAGE_RESET_LEASE_MS - 1_000);
      expect(resetCategoriesDbIsolated).toHaveBeenCalledOnce();
      expect(resetDbIsolated).toHaveBeenCalledOnce();
      expect(window.location.reload).toHaveBeenCalledOnce();
    } finally {
      getItemSpy.mockRestore();
      registration.unregister();
    }
  });

  it('takes over and completes a stale reset lease instead of stranding a newly opened tab', async () => {
    localStorage.setItem(
      STORAGE_RESET_COORDINATION_KEY,
      JSON.stringify({
        version: 1,
        generation: 'crashed-generation',
        sourceTabId: 'crashed-tab',
        phase: 'start',
        createdAt: Date.now() - STORAGE_RESET_LEASE_MS - 1,
      }),
    );

    const registration = registerStorageResetCoordinator();

    try {
      expect(registration.resetInProgress).toBe(true);
      await vi.waitFor(() => {
        expect(resetCategoriesDbIsolated).toHaveBeenCalledOnce();
        expect(resetDbIsolated).toHaveBeenCalledOnce();
        expect(removeComapeoKeys).toHaveBeenCalledWith({ bestEffort: true });
        expect(window.location.reload).toHaveBeenCalledOnce();
      });
      const terminal = JSON.parse(
        localStorage.getItem(STORAGE_RESET_COORDINATION_KEY) ?? '{}',
      );
      expect(terminal).toMatchObject({
        generation: 'crashed-generation',
        phase: 'complete',
      });
    } finally {
      registration.unregister();
    }
  });

  it('holds the generation lock across recovery cleanup before allowing a newer reset', async () => {
    vi.useFakeTimers();
    let releaseCleanup!: () => void;
    let markCleanupStarted!: () => void;
    const cleanupStarted = new Promise<void>((resolve) => {
      markCleanupStarted = resolve;
    });
    const cleanupGate = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });
    vi.mocked(resetCategoriesDbIsolated).mockImplementationOnce(async () => {
      markCleanupStarted();
      await cleanupGate;
    });
    localStorage.setItem(
      STORAGE_RESET_COORDINATION_KEY,
      JSON.stringify({
        version: 1,
        generation: 'stale-recovery-generation',
        sourceTabId: 'crashed-tab',
        phase: 'start',
        createdAt: Date.now() - STORAGE_RESET_LEASE_MS - 1,
      }),
    );
    const { unregister } = registerStorageResetCoordinator();

    try {
      await vi.advanceTimersByTimeAsync(0);
      await cleanupStarted;

      let newerStartSettled = false;
      const newerStart = beginStorageResetCoordination().finally(() => {
        newerStartSettled = true;
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(newerStartSettled).toBe(false);

      releaseCleanup();
      await expect(newerStart).resolves.not.toBe('stale-recovery-generation');
      expect(resetDbIsolated).toHaveBeenCalled();
      expect(window.location.reload).toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  it('retries failed recovery after a transient post-renewal storage read failure', async () => {
    vi.useFakeTimers();
    vi.mocked(resetCategoriesDbIsolated).mockRejectedValueOnce(
      new Error('categories unavailable'),
    );
    localStorage.setItem(
      STORAGE_RESET_COORDINATION_KEY,
      JSON.stringify({
        version: 1,
        generation: 'transient-read-recovery',
        sourceTabId: 'crashed-tab',
        phase: 'start',
        createdAt: Date.now() - STORAGE_RESET_LEASE_MS - 1,
      }),
    );

    const originalSetItem = Storage.prototype.setItem;
    const originalGetItem = Storage.prototype.getItem;
    let recoveryStartWrites = 0;
    let throwNextGet = false;
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (this: Storage, key, value) {
        if (key === STORAGE_RESET_COORDINATION_KEY) {
          const parsed = JSON.parse(value) as { phase?: string };
          if (parsed.phase === 'start') {
            recoveryStartWrites += 1;
            if (recoveryStartWrites === 2) throwNextGet = true;
          }
        }
        return originalSetItem.call(this, key, value);
      });
    const getItemSpy = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(function (this: Storage, key) {
        if (key === STORAGE_RESET_COORDINATION_KEY && throwNextGet) {
          throwNextGet = false;
          throw new DOMException('Transient read failure', 'SecurityError');
        }
        return originalGetItem.call(this, key);
      });
    const { unregister } = registerStorageResetCoordinator();

    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(resetCategoriesDbIsolated).toHaveBeenCalledOnce();
      expect(window.location.reload).not.toHaveBeenCalled();

      // First owned-recovery retry hits the injected read failure and schedules
      // another retry without requiring a new storage or broadcast event.
      await vi.advanceTimersByTimeAsync(1_000);
      expect(window.location.reload).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1_000);
      // The successful authoritative read sees the renewed lease and waits for
      // its remaining lifetime before reclaiming the failed cleanup.
      await vi.advanceTimersByTimeAsync(STORAGE_RESET_LEASE_MS - 2_000);
      await vi.advanceTimersByTimeAsync(0);
      expect(resetCategoriesDbIsolated).toHaveBeenCalledTimes(2);
      expect(resetDbIsolated).toHaveBeenCalledTimes(2);
      expect(window.location.reload).toHaveBeenCalledOnce();
    } finally {
      unregister();
      setItemSpy.mockRestore();
      getItemSpy.mockRestore();
    }
  });

  it('reloads an authoritative complete signal without deleting fresh post-reset data', async () => {
    const { unregister } = registerStorageResetCoordinator();
    localStorage.setItem('comapeo-theme-mode', 'dark');

    try {
      // A suspended tab may receive this complete signal long after another tab
      // has reloaded and users have created fresh data. Completion must therefore
      // quiesce and reload only; destructive cleanup already happened pre-complete.
      dispatchResetSignal('complete');

      await vi.waitFor(() => {
        expect(window.location.reload).toHaveBeenCalledOnce();
      });
      expect(resetCategoriesDbIsolated).not.toHaveBeenCalled();
      expect(resetDbIsolated).not.toHaveBeenCalled();
      expect(removeComapeoKeys).not.toHaveBeenCalled();
      expect(localStorage.getItem('comapeo-theme-mode')).toBe('dark');
      expect(closeDbForStorageReset).toHaveBeenCalled();
      expect(closeCategoriesDbForStorageReset).toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  it('retries authoritative complete validation after a transient lock failure without sweeping data', async () => {
    vi.useFakeTimers();
    const request = vi.mocked(navigator.locks.request);
    request.mockRejectedValueOnce(new Error('Transient complete lock failure'));
    localStorage.setItem('comapeo-theme-mode', 'dark');
    const { unregister } = registerStorageResetCoordinator();

    try {
      dispatchResetSignal('complete', 'terminal-retry-generation');
      await vi.advanceTimersByTimeAsync(0);
      expect(window.location.reload).not.toHaveBeenCalled();
      expect(resetCategoriesDbIsolated).not.toHaveBeenCalled();
      expect(resetDbIsolated).not.toHaveBeenCalled();
      expect(removeComapeoKeys).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1_000);
      await vi.waitFor(() => {
        expect(window.location.reload).toHaveBeenCalledOnce();
      });
      expect(resetCategoriesDbIsolated).not.toHaveBeenCalled();
      expect(resetDbIsolated).not.toHaveBeenCalled();
      expect(removeComapeoKeys).not.toHaveBeenCalled();
      expect(localStorage.getItem('comapeo-theme-mode')).toBe('dark');
    } finally {
      unregister();
    }
  });

  it('ignores a stale complete signal after a newer reset generation starts', async () => {
    const { unregister } = registerStorageResetCoordinator();

    try {
      dispatchResetSignal('start', 'generation-a');
      dispatchResetSignal('start', 'generation-b');
      dispatchResetSignalEvent('complete', 'generation-a');

      await vi.waitFor(() => {
        expect(navigator.locks.request).toHaveBeenCalled();
      });
      await Promise.resolve();

      expect(resetCategoriesDbIsolated).not.toHaveBeenCalled();
      expect(resetDbIsolated).not.toHaveBeenCalled();
      expect(removeComapeoKeys).not.toHaveBeenCalled();
      expect(window.location.reload).not.toHaveBeenCalled();
      expect(
        JSON.parse(
          localStorage.getItem(STORAGE_RESET_COORDINATION_KEY) ?? '{}',
        ),
      ).toMatchObject({ generation: 'generation-b', phase: 'start' });
    } finally {
      unregister();
    }
  });

  it('ignores a stale complete signal after a newer reset generation aborts', async () => {
    const { unregister } = registerStorageResetCoordinator();

    try {
      localStorage.setItem(
        STORAGE_RESET_COORDINATION_KEY,
        JSON.stringify({
          version: 1,
          generation: 'generation-b',
          sourceTabId: 'other-tab',
          phase: 'abort',
          createdAt: Date.now(),
        }),
      );
      dispatchResetSignalEvent('complete', 'generation-a');

      await vi.waitFor(() => {
        expect(navigator.locks.request).toHaveBeenCalled();
      });
      await Promise.resolve();

      expect(resetCategoriesDbIsolated).not.toHaveBeenCalled();
      expect(resetDbIsolated).not.toHaveBeenCalled();
      expect(removeComapeoKeys).not.toHaveBeenCalled();
      expect(window.location.reload).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  it('retries a recoverable start after isolated categories cleanup fails', async () => {
    vi.useFakeTimers();
    vi.mocked(resetCategoriesDbIsolated).mockRejectedValueOnce(
      new Error('categories unavailable'),
    );
    localStorage.setItem(
      STORAGE_RESET_COORDINATION_KEY,
      JSON.stringify({
        version: 1,
        generation: 'categories-recovery-generation',
        sourceTabId: 'reloading-owner',
        phase: 'start',
        createdAt: Date.now() - STORAGE_RESET_LEASE_MS - 1,
      }),
    );
    const { unregister } = registerStorageResetCoordinator();

    try {
      await vi.advanceTimersByTimeAsync(0);

      expect(resetCategoriesDbIsolated).toHaveBeenCalledOnce();
      expect(resetDbIsolated).toHaveBeenCalledOnce();
      expect(removeComapeoKeys).toHaveBeenCalledWith({ bestEffort: true });
      expect(window.location.reload).not.toHaveBeenCalled();
      expect(
        JSON.parse(
          localStorage.getItem(STORAGE_RESET_COORDINATION_KEY) ?? '{}',
        ),
      ).toMatchObject({
        generation: 'categories-recovery-generation',
        phase: 'start',
      });

      await vi.advanceTimersByTimeAsync(STORAGE_RESET_LEASE_MS);
      expect(resetCategoriesDbIsolated).toHaveBeenCalledTimes(2);
      expect(resetDbIsolated).toHaveBeenCalledTimes(2);
      expect(window.location.reload).toHaveBeenCalledOnce();
      expect(
        JSON.parse(
          localStorage.getItem(STORAGE_RESET_COORDINATION_KEY) ?? '{}',
        ),
      ).toMatchObject({
        generation: 'categories-recovery-generation',
        phase: 'complete',
      });
    } finally {
      unregister();
    }
  });

  it('retries a recoverable start after isolated primary cleanup fails', async () => {
    vi.useFakeTimers();
    vi.mocked(resetDbIsolated).mockRejectedValueOnce(
      new Error('primary unavailable'),
    );
    localStorage.setItem(
      STORAGE_RESET_COORDINATION_KEY,
      JSON.stringify({
        version: 1,
        generation: 'primary-recovery-generation',
        sourceTabId: 'reloading-owner',
        phase: 'start',
        createdAt: Date.now() - STORAGE_RESET_LEASE_MS - 1,
      }),
    );
    const { unregister } = registerStorageResetCoordinator();

    try {
      await vi.advanceTimersByTimeAsync(0);

      expect(resetCategoriesDbIsolated).toHaveBeenCalledOnce();
      expect(resetDbIsolated).toHaveBeenCalledOnce();
      expect(window.location.reload).not.toHaveBeenCalled();
      expect(
        JSON.parse(
          localStorage.getItem(STORAGE_RESET_COORDINATION_KEY) ?? '{}',
        ),
      ).toMatchObject({
        generation: 'primary-recovery-generation',
        phase: 'start',
      });

      await vi.advanceTimersByTimeAsync(STORAGE_RESET_LEASE_MS);
      expect(resetCategoriesDbIsolated).toHaveBeenCalledTimes(2);
      expect(resetDbIsolated).toHaveBeenCalledTimes(2);
      expect(window.location.reload).toHaveBeenCalledOnce();
      expect(
        JSON.parse(
          localStorage.getItem(STORAGE_RESET_COORDINATION_KEY) ?? '{}',
        ),
      ).toMatchObject({
        generation: 'primary-recovery-generation',
        phase: 'complete',
      });
    } finally {
      unregister();
    }
  });

  it('releases a quiesced tab without deleting preferences when reset aborts', async () => {
    const { unregister } = registerStorageResetCoordinator();

    try {
      dispatchResetSignal('start');
      dispatchResetSignal('abort');

      await vi.waitFor(() => {
        expect(window.location.reload).toHaveBeenCalledOnce();
      });
      expect(resetDbIsolated).not.toHaveBeenCalled();
      expect(removeComapeoKeys).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  it('holds the generation lock across owner destructive work', async () => {
    const generationA = await beginStorageResetCoordination();
    let releaseCleanup!: () => void;
    let markCleanupStarted!: () => void;
    const cleanupStarted = new Promise<void>((resolve) => {
      markCleanupStarted = resolve;
    });
    const cleanupGate = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });

    const ownerOperation = runStorageResetOwnerOperation(
      generationA,
      async ({ publish }) => {
        markCleanupStarted();
        await cleanupGate;
        publish('complete');
        return 'done';
      },
    );
    await cleanupStarted;

    let newerStartSettled = false;
    const newerStart = beginStorageResetCoordination().finally(() => {
      newerStartSettled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(newerStartSettled).toBe(false);

    releaseCleanup();
    await expect(ownerOperation).resolves.toMatchObject({ owned: true });
    await expect(newerStart).resolves.not.toBe(generationA);
  });

  it('does not run stale owner destructive work after a newer generation wins', async () => {
    const generationA = await beginStorageResetCoordination();
    const generationB = {
      version: 1,
      generation: 'generation-b',
      sourceTabId: 'other-tab',
      phase: 'start',
      createdAt: Date.now() + 1,
    };
    localStorage.setItem(
      STORAGE_RESET_COORDINATION_KEY,
      JSON.stringify(generationB),
    );
    const destructiveWork = vi.fn();

    const result = await runStorageResetOwnerOperation(
      generationA,
      destructiveWork,
    );

    expect(result).toEqual({ owned: false });
    expect(destructiveWork).not.toHaveBeenCalled();
    expect(
      JSON.parse(localStorage.getItem(STORAGE_RESET_COORDINATION_KEY) ?? '{}'),
    ).toEqual(generationB);
  });

  it('reconciles a start signal after the first lock validation fails', async () => {
    vi.useFakeTimers();
    const request = vi.mocked(navigator.locks.request);
    request.mockRejectedValueOnce(new Error('Transient lock failure'));
    const { unregister } = registerStorageResetCoordinator();

    try {
      dispatchResetSignal('start', 'lock-failure-generation');
      await vi.advanceTimersByTimeAsync(0);
      expect(closeDbForStorageReset).toHaveBeenCalled();
      expect(closeCategoriesDbForStorageReset).toHaveBeenCalled();
      expect(resetDbIsolated).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1_000);
      await vi.advanceTimersByTimeAsync(STORAGE_RESET_LEASE_MS - 1_000);

      expect(resetCategoriesDbIsolated).toHaveBeenCalledOnce();
      expect(resetDbIsolated).toHaveBeenCalledOnce();
      expect(window.location.reload).toHaveBeenCalledOnce();
    } finally {
      unregister();
    }
  });

  it('reconciles a terminal signal after the first lock validation fails', async () => {
    vi.useFakeTimers();
    const { unregister } = registerStorageResetCoordinator();

    try {
      dispatchResetSignal('start', 'terminal-lock-failure');
      await vi.advanceTimersByTimeAsync(0);
      vi.mocked(navigator.locks.request).mockRejectedValueOnce(
        new Error('Transient terminal lock failure'),
      );
      dispatchResetSignal('abort', 'terminal-lock-failure');
      await vi.advanceTimersByTimeAsync(0);
      expect(window.location.reload).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1_000);
      expect(window.location.reload).toHaveBeenCalledOnce();
    } finally {
      unregister();
    }
  });

  it.each([
    ['complete', 'generation-a'],
    ['abort', 'generation-a'],
    ['start', 'generation-b'],
  ] as const)(
    'ignores a stale start event when durable state is %s',
    async (durablePhase, durableGeneration) => {
      localStorage.setItem(
        STORAGE_RESET_COORDINATION_KEY,
        JSON.stringify({
          version: 1,
          generation: durableGeneration,
          sourceTabId: 'other-tab',
          phase: durablePhase,
          createdAt: Date.now() + 1,
        }),
      );
      const { unregister } = registerStorageResetCoordinator();
      vi.clearAllMocks();

      try {
        dispatchResetSignalEvent('start', 'generation-a');
        await vi.waitFor(() => {
          expect(navigator.locks.request).toHaveBeenCalled();
        });
        await Promise.resolve();

        expect(closeDbForStorageReset).not.toHaveBeenCalled();
        expect(closeCategoriesDbForStorageReset).not.toHaveBeenCalled();
        expect(window.location.reload).not.toHaveBeenCalled();
      } finally {
        unregister();
      }
    },
  );

  it('reloads an authoritative complete without rewriting its durable marker', async () => {
    const terminal = {
      version: 1,
      generation: 'terminal-generation',
      sourceTabId: 'other-tab',
      phase: 'complete',
      createdAt: Date.now(),
    } as const;
    localStorage.setItem(
      STORAGE_RESET_COORDINATION_KEY,
      JSON.stringify(terminal),
    );
    const { unregister } = registerStorageResetCoordinator();
    const originalSetItem = Storage.prototype.setItem;
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (this: Storage, key, value) {
        if (key === STORAGE_RESET_COORDINATION_KEY) {
          throw new DOMException(
            'Unexpected terminal rewrite',
            'SecurityError',
          );
        }
        return originalSetItem.call(this, key, value);
      });

    try {
      dispatchResetSignalEvent('complete', 'terminal-generation');
      await vi.waitFor(() => {
        expect(window.location.reload).toHaveBeenCalledOnce();
      });

      expect(resetCategoriesDbIsolated).not.toHaveBeenCalled();
      expect(resetDbIsolated).not.toHaveBeenCalled();
      expect(removeComapeoKeys).not.toHaveBeenCalled();
      expect(
        JSON.parse(
          localStorage.getItem(STORAGE_RESET_COORDINATION_KEY) ?? '{}',
        ),
      ).toEqual(terminal);
      expect(setItemSpy).not.toHaveBeenCalled();
    } finally {
      setItemSpy.mockRestore();
      unregister();
    }
  });
});
