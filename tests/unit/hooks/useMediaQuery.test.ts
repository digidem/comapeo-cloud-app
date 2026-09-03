import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useMediaQuery } from '@/hooks/useMediaQuery';

// tests/setup.ts installs a global matchMedia stub (matches: false, no-op
// listeners), so each test spies on window.matchMedia to control the result
// and capture the change listener — same approach as theme-store.test.ts.

type ChangeListener = (event: { matches: boolean }) => void;

function mockMatchMedia(initialMatches: boolean) {
  const listeners = new Set<ChangeListener>();
  const spy = vi.spyOn(window, 'matchMedia').mockImplementation(((
    query: string,
  ) => ({
    matches: initialMatches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(
      (
        type: string,
        listener: EventListenerOrEventListenerObject,
        _options?: boolean | AddEventListenerOptions,
      ) => {
        if (type === 'change' && typeof listener === 'function') {
          listeners.add(listener as unknown as ChangeListener);
        }
      },
    ),
    removeEventListener: vi.fn(
      (
        type: string,
        listener: EventListenerOrEventListenerObject,
        _options?: boolean | AddEventListenerOptions,
      ) => {
        if (type === 'change' && typeof listener === 'function') {
          listeners.delete(listener as unknown as ChangeListener);
        }
      },
    ),
    dispatchEvent: vi.fn(() => false),
  })) as unknown as typeof window.matchMedia);

  return {
    spy,
    emit(matches: boolean) {
      act(() => {
        for (const listener of listeners) {
          listener({ matches } as unknown as MediaQueryListEvent);
        }
      });
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useMediaQuery', () => {
  it('returns false when the query does not match', () => {
    mockMatchMedia(false);

    const { result } = renderHook(() => useMediaQuery('(min-width: 48rem)'));
    expect(result.current).toBe(false);
  });

  it('returns true when the query matches', () => {
    mockMatchMedia(true);

    const { result } = renderHook(() => useMediaQuery('(min-width: 48rem)'));
    expect(result.current).toBe(true);
  });

  it('lazily reads matchMedia on first render with the requested query', () => {
    const mql = mockMatchMedia(true);

    renderHook(() => useMediaQuery('(min-width: 48rem)'));
    expect(mql.spy).toHaveBeenCalledWith('(min-width: 48rem)');
  });

  it('updates when the query change event fires', () => {
    const mql = mockMatchMedia(false);

    const { result } = renderHook(() => useMediaQuery('(min-width: 48rem)'));
    expect(result.current).toBe(false);

    mql.emit(true);
    expect(result.current).toBe(true);

    mql.emit(false);
    expect(result.current).toBe(false);
  });

  it('cleans up the change listener on unmount', () => {
    const mql = mockMatchMedia(false);

    const { unmount } = renderHook(() => useMediaQuery('(min-width: 48rem)'));
    expect(mql.listenerCount).toBe(1);

    unmount();
    expect(mql.listenerCount).toBe(0);
  });

  it('re-reads matches immediately when the query prop changes', () => {
    // Per-query mock: each query string resolves to its own `matches` value,
    // so switching the prop must consult the NEW query's list.
    const listeners = new Set<ChangeListener>();
    const matchesByQuery = new Map<string, boolean>([
      ['(min-width: 48rem)', true],
      ['(min-width: 64rem)', false],
    ]);
    vi.spyOn(window, 'matchMedia').mockImplementation(((query: string) => ({
      matches: matchesByQuery.get(query) ?? false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: (
        type: string,
        listener: EventListenerOrEventListenerObject,
        _options?: boolean | AddEventListenerOptions,
      ) => {
        if (type === 'change' && typeof listener === 'function') {
          listeners.add(listener as unknown as ChangeListener);
        }
      },
      removeEventListener: (
        type: string,
        listener: EventListenerOrEventListenerObject,
        _options?: boolean | AddEventListenerOptions,
      ) => {
        if (type === 'change' && typeof listener === 'function') {
          listeners.delete(listener as unknown as ChangeListener);
        }
      },
      dispatchEvent: vi.fn(() => false),
    })) as unknown as typeof window.matchMedia);

    const { result, rerender } = renderHook(
      ({ query }: { query: string }) => useMediaQuery(query),
      { initialProps: { query: '(min-width: 48rem)' } },
    );
    expect(result.current).toBe(true);

    // No change event fires between these renders — the effect itself must
    // re-sync state from the new query's media list.
    rerender({ query: '(min-width: 64rem)' });
    expect(result.current).toBe(false);

    rerender({ query: '(min-width: 48rem)' });
    expect(result.current).toBe(true);
  });
});
