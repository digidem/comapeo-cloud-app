import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  resetPersistCacheForTesting,
  useStoragePersist,
} from '@/hooks/useStoragePersist';

describe('useStoragePersist', () => {
  const origStorage = navigator.storage;

  afterEach(() => {
    resetPersistCacheForTesting();
    Object.defineProperty(navigator, 'storage', {
      value: origStorage,
      configurable: true,
      writable: true,
    });
  });

  function setStorageApi(api: {
    persist?: () => Promise<boolean>;
    persisted?: () => Promise<boolean>;
    estimate?: () => Promise<StorageEstimate>;
  }) {
    Object.defineProperty(navigator, 'storage', {
      value: api as Navigator['storage'],
      configurable: true,
      writable: true,
    });
  }

  describe('persisted state', () => {
    it('requests persistence on first durable Case use when supported', async () => {
      const persistMock = vi.fn().mockResolvedValue(true);
      const persistedMock = vi.fn().mockResolvedValue(false);
      const estimateMock = vi
        .fn()
        .mockResolvedValue({ quota: 1000, usage: 500 });

      setStorageApi({
        persist: persistMock,
        persisted: persistedMock,
        estimate: estimateMock,
      });

      const { result } = renderHook(() => useStoragePersist());

      // Initially loading
      expect(result.current.state).toBe('loading');

      await waitFor(() => expect(result.current.state).toBe('persisted'));

      // On first use, persist() should be called once (persisted() returned false = not yet known)
      expect(persistMock).toHaveBeenCalledTimes(1);
      expect(persistedMock).toHaveBeenCalledTimes(1);
      expect(result.current.isPersisted).toBe(true);
    });

    it('does not re-prompt when persistence is already known (idempotent repeat)', async () => {
      const persistMock = vi.fn().mockResolvedValue(true);
      const persistedMock = vi.fn().mockResolvedValue(false);
      const estimateMock = vi
        .fn()
        .mockResolvedValue({ quota: 1000, usage: 500 });

      setStorageApi({
        persist: persistMock,
        persisted: persistedMock,
        estimate: estimateMock,
      });

      const { result, rerender } = renderHook(() => useStoragePersist());

      await waitFor(() => expect(result.current.state).toBe('persisted'));

      // Re-render / re-trigger should not call persist again
      rerender();
      expect(persistMock).toHaveBeenCalledTimes(1);
      expect(persistedMock).toHaveBeenCalledTimes(1);
    });

    it('does not call persist when persisted() already returns true (already known persisted)', async () => {
      const persistMock = vi.fn().mockResolvedValue(true);
      const persistedMock = vi.fn().mockResolvedValue(true);
      const estimateMock = vi
        .fn()
        .mockResolvedValue({ quota: 1000, usage: 500 });

      setStorageApi({
        persist: persistMock,
        persisted: persistedMock,
        estimate: estimateMock,
      });

      const { result } = renderHook(() => useStoragePersist());

      await waitFor(() => expect(result.current.state).toBe('persisted'));

      // When persisted() already returns true, persist() should NOT be called
      expect(persistMock).not.toHaveBeenCalled();
      expect(persistedMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('denied state', () => {
    it('surfaces denied state when persist() resolves false', async () => {
      const persistMock = vi.fn().mockResolvedValue(false);
      const persistedMock = vi.fn().mockResolvedValue(false);
      const estimateMock = vi
        .fn()
        .mockResolvedValue({ quota: 1000, usage: 500 });

      setStorageApi({
        persist: persistMock,
        persisted: persistedMock,
        estimate: estimateMock,
      });

      const { result } = renderHook(() => useStoragePersist());

      await waitFor(() => expect(result.current.state).toBe('denied'));
      expect(result.current.isPersisted).toBe(false);
    });
  });

  describe('unsupported state', () => {
    it('surfaces unsupported state when navigator.storage.persist is missing', async () => {
      setStorageApi({
        persisted: vi.fn().mockResolvedValue(false),
        estimate: vi.fn().mockResolvedValue({ quota: 1000, usage: 500 }),
      });

      const { result } = renderHook(() => useStoragePersist());

      await waitFor(() => expect(result.current.state).toBe('unsupported'));
      expect(result.current.isPersisted).toBe(false);
    });

    it('surfaces unsupported state when navigator.storage is entirely absent', async () => {
      Object.defineProperty(navigator, 'storage', {
        value: undefined,
        configurable: true,
        writable: true,
      });

      const { result } = renderHook(() => useStoragePersist());

      await waitFor(() => expect(result.current.state).toBe('unsupported'));
    });
  });

  describe('error state', () => {
    it('surfaces error state and fails safe when persist() throws', async () => {
      const persistMock = vi
        .fn()
        .mockRejectedValue(new Error('persist failed'));
      const persistedMock = vi.fn().mockResolvedValue(false);
      const estimateMock = vi
        .fn()
        .mockResolvedValue({ quota: 1000, usage: 500 });

      setStorageApi({
        persist: persistMock,
        persisted: persistedMock,
        estimate: estimateMock,
      });

      const { result } = renderHook(() => useStoragePersist());

      await waitFor(() => expect(result.current.state).toBe('error'));
      expect(result.current.isPersisted).toBe(false);
    });

    it('surfaces error state when persisted() throws', async () => {
      const persistMock = vi.fn().mockResolvedValue(true);
      const persistedMock = vi
        .fn()
        .mockRejectedValue(new Error('check failed'));
      const estimateMock = vi
        .fn()
        .mockResolvedValue({ quota: 1000, usage: 500 });

      setStorageApi({
        persist: persistMock,
        persisted: persistedMock,
        estimate: estimateMock,
      });

      const { result } = renderHook(() => useStoragePersist());

      await waitFor(() => expect(result.current.state).toBe('error'));
    });
  });

  describe('quota-risk state', () => {
    it('surfaces quota-risk when usage exceeds 80% of quota', async () => {
      const persistMock = vi.fn().mockResolvedValue(true);
      const persistedMock = vi.fn().mockResolvedValue(true);
      const estimateMock = vi
        .fn()
        .mockResolvedValue({ quota: 1000, usage: 900 });

      setStorageApi({
        persist: persistMock,
        persisted: persistedMock,
        estimate: estimateMock,
      });

      const { result } = renderHook(() => useStoragePersist());

      await waitFor(() => {
        expect(result.current.state).toBe('quota-risk');
      });
    });

    it('surfaces persisted state when usage is below threshold', async () => {
      const persistMock = vi.fn().mockResolvedValue(true);
      const persistedMock = vi.fn().mockResolvedValue(true);
      const estimateMock = vi
        .fn()
        .mockResolvedValue({ quota: 1000, usage: 100 });

      setStorageApi({
        persist: persistMock,
        persisted: persistedMock,
        estimate: estimateMock,
      });

      const { result } = renderHook(() => useStoragePersist());

      await waitFor(() => {
        expect(result.current.state).toBe('persisted');
      });
    });
  });

  describe('idempotent repeat after denied', () => {
    it('does not re-prompt when persisted is already false and persist was already attempted', async () => {
      const persistMock = vi.fn().mockResolvedValue(false);
      const persistedMock = vi.fn().mockResolvedValue(false);
      const estimateMock = vi
        .fn()
        .mockResolvedValue({ quota: 1000, usage: 500 });

      setStorageApi({
        persist: persistMock,
        persisted: persistedMock,
        estimate: estimateMock,
      });

      const { result, rerender } = renderHook(() => useStoragePersist());

      await waitFor(() => expect(result.current.state).toBe('denied'));

      rerender();
      // Should not call persist again after the first attempt resolved to denied
      expect(persistMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('unmount/remount idempotency (process-local)', () => {
    it('does not call persist() a second time when the hook remounts against the same StorageManager', async () => {
      const persistMock = vi.fn().mockResolvedValue(true);
      const persistedMock = vi.fn().mockResolvedValue(false);
      const estimateMock = vi
        .fn()
        .mockResolvedValue({ quota: 1000, usage: 500 });

      setStorageApi({
        persist: persistMock,
        persisted: persistedMock,
        estimate: estimateMock,
      });

      // First mount — resolves persistence and caches the result.
      const first = renderHook(() => useStoragePersist());
      await waitFor(() => expect(first.result.current.state).toBe('persisted'));
      expect(persistMock).toHaveBeenCalledTimes(1);

      // Unmount the first hook instance.
      await act(async () => {
        first.unmount();
      });

      // Second mount against the same process — persist() must NOT be called again.
      const second = renderHook(() => useStoragePersist());
      await waitFor(() =>
        expect(second.result.current.state).toBe('persisted'),
      );
      expect(persistMock).toHaveBeenCalledTimes(1);
    });

    it('does not reload persisted state from storage when cache is populated (no persisted() re-call)', async () => {
      const persistMock = vi.fn().mockResolvedValue(true);
      const persistedMock = vi.fn().mockResolvedValue(false);
      const estimateMock = vi
        .fn()
        .mockResolvedValue({ quota: 1000, usage: 500 });

      setStorageApi({
        persist: persistMock,
        persisted: persistedMock,
        estimate: estimateMock,
      });

      const first = renderHook(() => useStoragePersist());
      await waitFor(() => expect(first.result.current.state).toBe('persisted'));
      expect(persistedMock).toHaveBeenCalledTimes(1);

      const second = renderHook(() => useStoragePersist());
      await waitFor(() =>
        expect(second.result.current.state).toBe('persisted'),
      );
      // persisted() should not be called again because the cache short-circuits
      expect(persistedMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        second.unmount();
      });
    });
  });
});
