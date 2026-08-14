import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  closeCategoriesDbForStorageReset,
  resetCategoriesDbIsolated,
} from '@/lib/categories-db';
import { removeComapeoKeys } from '@/lib/comapeo-local-storage';
import { closeDbForStorageReset, resetDbIsolated } from '@/lib/db';
import {
  STORAGE_RESET_COORDINATION_KEY,
  registerStorageResetCoordinator,
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
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: STORAGE_RESET_COORDINATION_KEY,
      newValue: JSON.stringify({
        version: 1,
        generation,
        sourceTabId: 'other-tab',
        phase,
        createdAt: Date.now(),
      }),
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
