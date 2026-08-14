import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isComapeoStorageKey,
  removeComapeoKeys,
} from '@/lib/comapeo-local-storage';

describe('removeComapeoKeys', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('removes all app-owned storage keys and preserves unrelated keys', () => {
    localStorage.setItem('comapeo-locale', 'en');
    localStorage.setItem('comapeo:activeServerId', 'server-1');
    localStorage.setItem('comapeo:downloadIncludeGlobalOverview', 'true');
    localStorage.setItem('view-mode-preference', 'grid');
    localStorage.setItem('unrelated-key', 'keep');

    removeComapeoKeys();

    expect(localStorage.getItem('comapeo-locale')).toBeNull();
    expect(localStorage.getItem('comapeo:activeServerId')).toBeNull();
    expect(
      localStorage.getItem('comapeo:downloadIncludeGlobalOverview'),
    ).toBeNull();
    expect(localStorage.getItem('view-mode-preference')).toBeNull();
    expect(localStorage.getItem('unrelated-key')).toBe('keep');
  });

  it('continues removing remaining keys in best-effort mode', () => {
    localStorage.setItem('comapeo-first', 'keep-on-error');
    localStorage.setItem('comapeo-second', 'remove-me');
    const originalRemoveItem = Storage.prototype.removeItem;
    const removeItemSpy = vi
      .spyOn(Storage.prototype, 'removeItem')
      .mockImplementation(function (this: Storage, key: string) {
        if (key === 'comapeo-first') {
          throw new DOMException('Storage access denied', 'SecurityError');
        }
        return originalRemoveItem.call(this, key);
      });

    try {
      expect(() => removeComapeoKeys({ bestEffort: true })).not.toThrow();
      expect(localStorage.getItem('comapeo-first')).toBe('keep-on-error');
      expect(localStorage.getItem('comapeo-second')).toBeNull();
    } finally {
      removeItemSpy.mockRestore();
    }
  });

  it('clears stale preferences and reloads when another tab signals a reset', async () => {
    const {
      COMAPEO_STORAGE_RESET_SIGNAL_KEY,
      registerComapeoStorageResetListener,
    } = await import('@/lib/comapeo-local-storage');
    localStorage.setItem('comapeo-locale', '"pt"');
    localStorage.setItem('view-mode-preference', 'grid');
    localStorage.setItem('unrelated-key', 'keep');
    const mockReload = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: mockReload },
      writable: true,
    });
    const unregister = registerComapeoStorageResetListener();

    try {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: COMAPEO_STORAGE_RESET_SIGNAL_KEY,
          newValue: 'generation-2',
          storageArea: localStorage,
        }),
      );

      expect(localStorage.getItem('comapeo-locale')).toBeNull();
      expect(localStorage.getItem('view-mode-preference')).toBeNull();
      expect(localStorage.getItem('unrelated-key')).toBe('keep');
      expect(mockReload).toHaveBeenCalledOnce();
    } finally {
      unregister();
    }
  });
});

describe('storage key ownership', () => {
  it('recognizes every current persisted app-owned key', () => {
    const persistedKeys = [
      'comapeo-locale',
      'view-mode-preference',
      'comapeo-alert-view-mode-preference',
      'comapeo-archive',
      'comapeo-project',
      'comapeo-map',
      'comapeo-theme-mode',
      'comapeo:activeServerId',
      'comapeo:downloadIncludeGlobalOverview',
    ];

    for (const key of persistedKeys) {
      expect(isComapeoStorageKey(key), key).toBe(true);
    }
  });
});
