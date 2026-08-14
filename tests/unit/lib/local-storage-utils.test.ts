import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearAllStorage,
  exportLocalStorageData,
  importLocalStorageData,
} from '@/lib/local-storage-utils';

vi.mock('@/lib/db', () => ({
  resetDb: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/categories-db', () => ({
  resetCategoriesDb: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ clearAll: vi.fn() })),
  },
}));

describe('exportLocalStorageData', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('returns valid JSON with version, exportedAt, and data fields', () => {
    localStorage.setItem('comapeo-locale', '"en"');
    const result = exportLocalStorageData();
    const parsed = JSON.parse(result);

    expect(parsed).toHaveProperty('version', 1);
    expect(parsed).toHaveProperty('exportedAt');
    expect(typeof parsed.exportedAt).toBe('string');
    expect(parsed).toHaveProperty('data');
    expect(typeof parsed.data).toBe('object');
  });

  it('only includes keys with comapeo- prefix', () => {
    localStorage.setItem('comapeo-locale', '"en"');
    localStorage.setItem('comapeo-theme', '"dark"');
    localStorage.setItem('other-key', 'should-not-appear');
    localStorage.setItem('unrelated', 'data');

    const result = exportLocalStorageData();
    const parsed = JSON.parse(result);

    expect(parsed.data).toEqual({
      'comapeo-locale': '"en"',
      'comapeo-theme': '"dark"',
    });
    expect(parsed.data).not.toHaveProperty('other-key');
    expect(parsed.data).not.toHaveProperty('unrelated');
  });

  it('keeps the v1 backup scope limited to comapeo-prefixed keys', () => {
    localStorage.setItem('comapeo-locale', '"en"');
    localStorage.setItem('comapeo:activeServerId', 'server-1');
    localStorage.setItem('comapeo:downloadIncludeGlobalOverview', 'true');
    localStorage.setItem('view-mode-preference', 'grid');

    const result = exportLocalStorageData();
    const parsed = JSON.parse(result);

    expect(parsed.data).toEqual({ 'comapeo-locale': '"en"' });
  });

  it('includes all known app-owned storage keys when present', () => {
    localStorage.setItem('comapeo-locale', '"en"');
    localStorage.setItem('comapeo-project', '{"id":"abc"}');
    localStorage.setItem('comapeo-archive', '{"enabled":true}');
    localStorage.setItem('comapeo-theme', '"dark"');

    const result = exportLocalStorageData();
    const parsed = JSON.parse(result);

    expect(Object.keys(parsed.data)).toHaveLength(4);
    expect(parsed.data['comapeo-locale']).toBe('"en"');
    expect(parsed.data['comapeo-project']).toBe('{"id":"abc"}');
    expect(parsed.data['comapeo-archive']).toBe('{"enabled":true}');
    expect(parsed.data['comapeo-theme']).toBe('"dark"');
  });

  it('returns empty data object when no app-owned keys exist', () => {
    localStorage.setItem('other-key', 'value');

    const result = exportLocalStorageData();
    const parsed = JSON.parse(result);

    expect(parsed.data).toEqual({});
  });

  it('fails closed with a stable error and preserves the storage failure as cause', () => {
    localStorage.setItem('comapeo-locale', '"en"');
    const storageError = new DOMException(
      'Storage access denied',
      'SecurityError',
    );
    const keySpy = vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
      throw storageError;
    });

    try {
      let caught: unknown;
      try {
        exportLocalStorageData();
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe(
        'Browser storage is unavailable; backup was not created.',
      );
      expect((caught as Error).cause).toBe(storageError);
    } finally {
      keySpy.mockRestore();
    }
  });
});

describe('importLocalStorageData', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('successfully imports valid v1 backup data', () => {
    const backup = JSON.stringify({
      version: 1,
      exportedAt: '2025-01-01T00:00:00.000Z',
      data: {
        'comapeo-locale': '"en"',
        'comapeo-theme': '"dark"',
      },
    });

    const result = importLocalStorageData(backup);

    expect(result).toEqual({ success: true });
    expect(localStorage.getItem('comapeo-locale')).toBe('"en"');
    expect(localStorage.getItem('comapeo-theme')).toBe('"dark"');
  });

  it('preserves reset-only keys when importing an older v1 backup', () => {
    localStorage.setItem('comapeo:activeServerId', 'server-1');
    localStorage.setItem('comapeo:downloadIncludeGlobalOverview', 'true');
    localStorage.setItem('view-mode-preference', 'grid');
    const backup = JSON.stringify({
      version: 1,
      exportedAt: '2025-01-01T00:00:00.000Z',
      data: { 'comapeo-locale': '"pt"' },
    });

    expect(importLocalStorageData(backup)).toEqual({ success: true });
    expect(localStorage.getItem('comapeo-locale')).toBe('"pt"');
    expect(localStorage.getItem('comapeo:activeServerId')).toBe('server-1');
    expect(localStorage.getItem('comapeo:downloadIncludeGlobalOverview')).toBe(
      'true',
    );
    expect(localStorage.getItem('view-mode-preference')).toBe('grid');
  });

  it('ignores reset-only keys embedded in a v1 backup', () => {
    localStorage.setItem('comapeo:activeServerId', 'current-server');
    localStorage.setItem('view-mode-preference', 'grid');
    const backup = JSON.stringify({
      version: 1,
      exportedAt: '2025-01-01T00:00:00.000Z',
      data: {
        'comapeo-locale': '"en"',
        'comapeo:activeServerId': 'backup-server',
        'view-mode-preference': 'list',
      },
    });

    expect(importLocalStorageData(backup)).toEqual({ success: true });
    expect(localStorage.getItem('comapeo-locale')).toBe('"en"');
    expect(localStorage.getItem('comapeo:activeServerId')).toBe(
      'current-server',
    );
    expect(localStorage.getItem('view-mode-preference')).toBe('grid');
  });

  it('rejects invalid JSON with error message', () => {
    const result = importLocalStorageData('not valid json{{{');

    expect(result).toEqual({
      success: false,
      error: 'invalid-format',
    });
  });

  it('rejects JSON missing version field', () => {
    const backup = JSON.stringify({
      exportedAt: '2025-01-01T00:00:00.000Z',
      data: { 'comapeo-locale': '"en"' },
    });

    const result = importLocalStorageData(backup);

    expect(result).toEqual({
      success: false,
      error: 'invalid-format',
    });
  });

  it('rejects JSON with wrong version number', () => {
    const backup = JSON.stringify({
      version: 2,
      exportedAt: '2025-01-01T00:00:00.000Z',
      data: { 'comapeo-locale': '"en"' },
    });

    const result = importLocalStorageData(backup);

    expect(result).toEqual({
      success: false,
      error: 'invalid-format',
    });
  });

  it('rejects JSON missing data field', () => {
    const backup = JSON.stringify({
      version: 1,
      exportedAt: '2025-01-01T00:00:00.000Z',
    });

    const result = importLocalStorageData(backup);

    expect(result).toEqual({
      success: false,
      error: 'invalid-format',
    });
  });

  it('rejects JSON where data has non-string values', () => {
    const backup = JSON.stringify({
      version: 1,
      exportedAt: '2025-01-01T00:00:00.000Z',
      data: { 'comapeo-locale': 123 },
    });

    // JSON.parse turns 123 into a number, but v.record(v.string(), v.string())
    // requires string values. However, JSON.stringify(123) produces "123" which
    // is a number in JS. The schema should catch this.
    const result = importLocalStorageData(backup);

    expect(result).toEqual({
      success: false,
      error: 'invalid-format',
    });
  });

  it('only restores app-owned keys from backup', () => {
    const backup = JSON.stringify({
      version: 1,
      exportedAt: '2025-01-01T00:00:00.000Z',
      data: {
        'comapeo-locale': '"en"',
        'malicious-key': '"injected"',
      },
    });

    const result = importLocalStorageData(backup);

    expect(result).toEqual({ success: true });
    expect(localStorage.getItem('comapeo-locale')).toBe('"en"');
    expect(localStorage.getItem('malicious-key')).toBeNull();
  });

  it('returns a controlled error when browser storage is blocked', () => {
    localStorage.setItem('comapeo-locale', '"pt"');
    const backup = JSON.stringify({
      version: 1,
      exportedAt: '2025-01-01T00:00:00.000Z',
      data: { 'comapeo-locale': '"en"' },
    });
    const removeItemSpy = vi
      .spyOn(Storage.prototype, 'removeItem')
      .mockImplementation(() => {
        throw new DOMException('Storage access denied', 'SecurityError');
      });

    try {
      expect(importLocalStorageData(backup)).toEqual({
        success: false,
        error: 'storage-unavailable',
      });
    } finally {
      removeItemSpy.mockRestore();
    }
  });

  it('clears existing comapeo keys before restoring backup', () => {
    // Set up existing state that is NOT in the backup
    localStorage.setItem('comapeo-theme', '"dark"');
    localStorage.setItem('comapeo-locale', '"pt"');

    const backup = JSON.stringify({
      version: 1,
      exportedAt: '2025-01-01T00:00:00.000Z',
      data: {
        'comapeo-locale': '"en"',
      },
    });

    const result = importLocalStorageData(backup);

    expect(result).toEqual({ success: true });
    expect(localStorage.getItem('comapeo-locale')).toBe('"en"');
    // comapeo-theme was NOT in the backup, so it should be removed
    expect(localStorage.getItem('comapeo-theme')).toBeNull();
  });
});

describe('clearAllStorage', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('clears CoMapeo-owned localStorage entries and preserves unrelated keys', async () => {
    localStorage.setItem('comapeo-locale', '"en"');
    localStorage.setItem(
      'comapeo-alert-view-mode-preference',
      JSON.stringify({ state: { viewMode: 'grid' }, version: 0 }),
    );
    localStorage.setItem('comapeo:activeServerId', 'server-1');
    localStorage.setItem('view-mode-preference', 'grid');
    localStorage.setItem('other-key', 'value');

    // Prevent actual reload
    Object.defineProperty(window, 'location', {
      value: { reload: vi.fn() },
      writable: true,
    });

    await clearAllStorage();

    expect(localStorage.getItem('comapeo-locale')).toBeNull();
    expect(
      localStorage.getItem('comapeo-alert-view-mode-preference'),
    ).toBeNull();
    expect(localStorage.getItem('comapeo:activeServerId')).toBeNull();
    expect(localStorage.getItem('view-mode-preference')).toBeNull();
    expect(localStorage.getItem('other-key')).toBe('value');
  });

  it('removes browser preferences only after IndexedDB resets complete', async () => {
    const { resetDb } = await import('@/lib/db');
    const { resetCategoriesDb } = await import('@/lib/categories-db');
    vi.mocked(resetDb).mockClear();
    vi.mocked(resetCategoriesDb).mockClear();
    localStorage.setItem('comapeo-locale', '"en"');
    const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');
    Object.defineProperty(window, 'location', {
      value: { reload: vi.fn() },
      writable: true,
    });

    try {
      await clearAllStorage();

      const resetDbOrder = vi.mocked(resetDb).mock.invocationCallOrder[0]!;
      const resetCategoriesDbOrder =
        vi.mocked(resetCategoriesDb).mock.invocationCallOrder[0]!;
      const removeItemOrder = removeItemSpy.mock.invocationCallOrder[0]!;

      expect(resetDbOrder).toBeLessThan(removeItemOrder);
      expect(resetCategoriesDbOrder).toBeLessThan(removeItemOrder);
    } finally {
      removeItemSpy.mockRestore();
    }
  });

  it('continues the reset when localStorage removal is blocked', async () => {
    const { resetDb } = await import('@/lib/db');
    const { resetCategoriesDb } = await import('@/lib/categories-db');
    const { useAuthStore } = await import('@/stores/auth-store');
    const mockClearAll = vi.fn();
    vi.mocked(useAuthStore.getState).mockReturnValue({
      clearAll: mockClearAll,
    } as unknown as ReturnType<typeof useAuthStore.getState>);
    const mockReload = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: mockReload },
      writable: true,
    });
    const removeItemSpy = vi
      .spyOn(Storage.prototype, 'removeItem')
      .mockImplementation(() => {
        throw new DOMException('Storage access denied', 'SecurityError');
      });

    try {
      await expect(clearAllStorage()).resolves.toBeUndefined();
      expect(resetDb).toHaveBeenCalled();
      expect(resetCategoriesDb).toHaveBeenCalled();
      expect(mockClearAll).toHaveBeenCalled();
      expect(mockReload).toHaveBeenCalled();
    } finally {
      removeItemSpy.mockRestore();
    }
  });

  it('calls resetDb() to clear IndexedDB', async () => {
    const { resetDb } = await import('@/lib/db');

    Object.defineProperty(window, 'location', {
      value: { reload: vi.fn() },
      writable: true,
    });

    await clearAllStorage();

    expect(resetDb).toHaveBeenCalledOnce();
  });

  it('calls useAuthStore.getState().clearAll()', async () => {
    const { useAuthStore } = await import('@/stores/auth-store');
    const mockClearAll = vi.fn();
    vi.mocked(useAuthStore.getState).mockReturnValue({
      clearAll: mockClearAll,
    } as unknown as ReturnType<typeof useAuthStore.getState>);

    Object.defineProperty(window, 'location', {
      value: { reload: vi.fn() },
      writable: true,
    });

    await clearAllStorage();

    expect(useAuthStore.getState).toHaveBeenCalledOnce();
    expect(mockClearAll).toHaveBeenCalledOnce();
  });

  it('calls resetCategoriesDb() to clear categories IndexedDB', async () => {
    const { resetCategoriesDb } = await import('@/lib/categories-db');

    Object.defineProperty(window, 'location', {
      value: { reload: vi.fn() },
      writable: true,
    });

    await clearAllStorage();

    expect(resetCategoriesDb).toHaveBeenCalledOnce();
  });

  it('calls window.location.reload()', async () => {
    const mockReload = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: mockReload },
      writable: true,
    });

    await clearAllStorage();

    expect(mockReload).toHaveBeenCalledOnce();
  });

  it('preserves preferences and schedules a reload if resetDb() throws', async () => {
    vi.useFakeTimers();
    try {
      const { resetDb } = await import('@/lib/db');
      vi.mocked(resetDb).mockRejectedValueOnce(new Error('DB error'));
      localStorage.setItem('comapeo-locale', '"pt"');

      const mockReload = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { reload: mockReload },
        writable: true,
      });

      await expect(clearAllStorage()).rejects.toThrow('DB error');
      expect(localStorage.getItem('comapeo-locale')).toBe('"pt"');
      expect(mockReload).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1500);
      expect(mockReload).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves preferences and schedules a reload if resetCategoriesDb() throws', async () => {
    vi.useFakeTimers();
    try {
      const { resetCategoriesDb } = await import('@/lib/categories-db');
      vi.mocked(resetCategoriesDb).mockRejectedValueOnce(
        new Error('Categories error'),
      );
      localStorage.setItem('comapeo-locale', '"pt"');

      const mockReload = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { reload: mockReload },
        writable: true,
      });

      await expect(clearAllStorage()).rejects.toThrow('Categories error');
      expect(localStorage.getItem('comapeo-locale')).toBe('"pt"');
      expect(mockReload).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1500);
      expect(mockReload).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
