import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  allowComapeoStorageWritesAfterReset,
  blockComapeoStorageWritesForReset,
  comapeoStateStorage,
  isComapeoStorageKey,
  removeComapeoKeys,
  setComapeoStorageItem,
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
});

describe('storage reset write fence', () => {
  afterEach(() => {
    allowComapeoStorageWritesAfterReset();
    localStorage.clear();
  });

  it('drops receiver writes that race after the owner final sweep', () => {
    localStorage.setItem('comapeo-project', 'stale-before-reset');
    blockComapeoStorageWritesForReset();
    removeComapeoKeys();

    // Model an already-mounted receiver callback firing after the owner's final
    // key sweep but before its complete signal/reload reaches this tab.
    expect(setComapeoStorageItem('comapeo-theme-mode', 'dark')).toBe(false);
    comapeoStateStorage.setItem(
      'comapeo-project',
      JSON.stringify({ state: { selectedProjectId: 'project-1' }, version: 0 }),
    );

    expect(localStorage.getItem('comapeo-theme-mode')).toBeNull();
    expect(localStorage.getItem('comapeo-project')).toBeNull();
  });

  it('allows persistence again only after reset coordination releases the fence', () => {
    blockComapeoStorageWritesForReset();
    allowComapeoStorageWritesAfterReset();

    expect(setComapeoStorageItem('comapeo-theme-mode', 'dark')).toBe(true);
    expect(localStorage.getItem('comapeo-theme-mode')).toBe('dark');
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
