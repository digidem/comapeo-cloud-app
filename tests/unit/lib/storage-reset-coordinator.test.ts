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
  finishStorageResetCoordination,
  registerStorageResetCoordinator,
  startStorageResetLeaseHeartbeat,
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

  it('quiesces open database connections as soon as another tab starts a reset', () => {
    const { unregister } = registerStorageResetCoordinator();

    try {
      dispatchResetSignal('start');

      expect(closeDbForStorageReset).toHaveBeenCalledOnce();
      expect(closeCategoriesDbForStorageReset).toHaveBeenCalledOnce();
      expect(resetDbIsolated).not.toHaveBeenCalled();
      expect(window.location.reload).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  it('renews an active reset lease so long-running initiators are not taken over', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-14T12:00:00.000Z'));
    const generation = beginStorageResetCoordination();
    const initial = JSON.parse(
      localStorage.getItem(STORAGE_RESET_COORDINATION_KEY) ?? '{}',
    );
    const stopHeartbeat = startStorageResetLeaseHeartbeat(generation);

    try {
      await vi.advanceTimersByTimeAsync(Math.ceil(STORAGE_RESET_LEASE_MS / 2));
      const renewed = JSON.parse(
        localStorage.getItem(STORAGE_RESET_COORDINATION_KEY) ?? '{}',
      );

      expect(renewed).toMatchObject({ generation, phase: 'start' });
      expect(renewed.createdAt).toBeGreaterThan(initial.createdAt);
    } finally {
      stopHeartbeat();
    }
  });

  it('honors a renewed durable lease even when its heartbeat event is delayed', async () => {
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

      // The old timeout now fires, but the durable lease is fresh even though no
      // heartbeat event was dispatched to this tab.
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

  it('preserves the durable start marker when terminal publication fails', () => {
    const generation = beginStorageResetCoordination();
    const originalSetItem = Storage.prototype.setItem;
    let shouldFailCoordinationWrite = true;
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (this: Storage, key, value) {
        if (
          shouldFailCoordinationWrite &&
          key === STORAGE_RESET_COORDINATION_KEY
        ) {
          shouldFailCoordinationWrite = false;
          throw new DOMException('Storage access denied', 'SecurityError');
        }
        return originalSetItem.call(this, key, value);
      });

    const published = finishStorageResetCoordination(generation, 'complete');

    expect(published).toBe(false);
    setItemSpy.mockRestore();

    const durableMarker = JSON.parse(
      localStorage.getItem(STORAGE_RESET_COORDINATION_KEY) ?? '{}',
    );
    expect(durableMarker).toMatchObject({ generation, phase: 'start' });
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

  it('performs an isolated final database clear before a receiving tab reloads', async () => {
    const { unregister } = registerStorageResetCoordinator();

    try {
      // A complete signal must be safe even if this tab missed the start event:
      // close its app connections first, then clear through isolated connections.
      dispatchResetSignal('complete');

      await vi.waitFor(() => {
        expect(resetCategoriesDbIsolated).toHaveBeenCalledOnce();
        expect(resetDbIsolated).toHaveBeenCalledOnce();
        expect(removeComapeoKeys).toHaveBeenCalledWith({ bestEffort: true });
        expect(window.location.reload).toHaveBeenCalledOnce();
      });
      expect(closeDbForStorageReset).toHaveBeenCalledOnce();
      expect(closeCategoriesDbForStorageReset).toHaveBeenCalledOnce();
    } finally {
      unregister();
    }
  });

  it('ignores a stale complete signal after a newer reset generation starts', () => {
    const { unregister } = registerStorageResetCoordinator();

    try {
      dispatchResetSignal('start', 'generation-a');
      dispatchResetSignal('start', 'generation-b');
      dispatchResetSignalEvent('complete', 'generation-a');

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

  it('ignores a stale complete signal after a newer reset generation aborts', () => {
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

      expect(resetCategoriesDbIsolated).not.toHaveBeenCalled();
      expect(resetDbIsolated).not.toHaveBeenCalled();
      expect(removeComapeoKeys).not.toHaveBeenCalled();
      expect(window.location.reload).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  it('still clears the primary database and retries when isolated categories cleanup fails', async () => {
    vi.useFakeTimers();
    vi.mocked(resetCategoriesDbIsolated).mockRejectedValueOnce(
      new Error('categories unavailable'),
    );
    const { unregister } = registerStorageResetCoordinator();

    try {
      dispatchResetSignal('complete');
      await vi.advanceTimersByTimeAsync(0);

      expect(resetCategoriesDbIsolated).toHaveBeenCalledOnce();
      expect(resetDbIsolated).toHaveBeenCalledOnce();
      expect(removeComapeoKeys).toHaveBeenCalledWith({ bestEffort: true });
      expect(window.location.reload).not.toHaveBeenCalled();
      expect(
        JSON.parse(
          localStorage.getItem(STORAGE_RESET_COORDINATION_KEY) ?? '{}',
        ),
      ).toMatchObject({ phase: 'start' });

      await vi.advanceTimersByTimeAsync(STORAGE_RESET_LEASE_MS);
      expect(resetCategoriesDbIsolated).toHaveBeenCalledTimes(2);
      expect(resetDbIsolated).toHaveBeenCalledTimes(2);
      expect(window.location.reload).toHaveBeenCalledOnce();
    } finally {
      unregister();
    }
  });

  it('stays quiesced and retries instead of reloading when isolated primary cleanup fails', async () => {
    vi.useFakeTimers();
    vi.mocked(resetDbIsolated).mockRejectedValueOnce(
      new Error('primary unavailable'),
    );
    const { unregister } = registerStorageResetCoordinator();

    try {
      dispatchResetSignal('complete');
      await vi.advanceTimersByTimeAsync(0);

      expect(resetCategoriesDbIsolated).toHaveBeenCalledOnce();
      expect(resetDbIsolated).toHaveBeenCalledOnce();
      expect(window.location.reload).not.toHaveBeenCalled();
      expect(
        JSON.parse(
          localStorage.getItem(STORAGE_RESET_COORDINATION_KEY) ?? '{}',
        ),
      ).toMatchObject({ phase: 'start' });

      await vi.advanceTimersByTimeAsync(STORAGE_RESET_LEASE_MS);
      expect(resetCategoriesDbIsolated).toHaveBeenCalledTimes(2);
      expect(resetDbIsolated).toHaveBeenCalledTimes(2);
      expect(window.location.reload).toHaveBeenCalledOnce();
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
});
