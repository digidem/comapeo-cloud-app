import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearAllStorage,
  exportLocalStorageData,
  importLocalStorageData,
} from '@/lib/local-storage-utils';

vi.mock('@/lib/db', () => ({
  resetDb: vi.fn().mockResolvedValue(undefined),
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

  it('includes all known comapeo-* keys when present', () => {
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

  it('returns empty data object when no comapeo-* keys exist', () => {
    localStorage.setItem('other-key', 'value');

    const result = exportLocalStorageData();
    const parsed = JSON.parse(result);

    expect(parsed.data).toEqual({});
  });
});

describe('importLocalStorageData', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('successfully imports valid backup data and writes keys to localStorage', () => {
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

  it('rejects invalid JSON with error message', () => {
    const result = importLocalStorageData('not valid json{{{');

    expect(result).toEqual({
      success: false,
      error: 'Invalid backup file format',
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
      error: 'Invalid backup file format',
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
      error: 'Invalid backup file format',
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
      error: 'Invalid backup file format',
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
      error: 'Invalid backup file format',
    });
  });

  it('only writes comapeo-prefixed keys from backup to localStorage', () => {
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
  it('clears only comapeo-prefixed localStorage entries', async () => {
    localStorage.setItem('comapeo-locale', '"en"');
    localStorage.setItem('other-key', 'value');

    // Prevent actual reload
    Object.defineProperty(window, 'location', {
      value: { reload: vi.fn() },
      writable: true,
    });

    await clearAllStorage();

    expect(localStorage.getItem('comapeo-locale')).toBeNull();
    // Non-comapeo keys should be preserved
    expect(localStorage.getItem('other-key')).toBe('value');
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

  it('calls window.location.reload()', async () => {
    const mockReload = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: mockReload },
      writable: true,
    });

    await clearAllStorage();

    expect(mockReload).toHaveBeenCalledOnce();
  });

  it('still reloads even if resetDb() throws', async () => {
    const { resetDb } = await import('@/lib/db');
    vi.mocked(resetDb).mockRejectedValueOnce(new Error('DB error'));

    const mockReload = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: mockReload },
      writable: true,
    });

    await clearAllStorage();

    expect(mockReload).toHaveBeenCalledOnce();
  });
});
