import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useResponsivePageSize } from '@/hooks/useResponsivePageSize';

describe('useResponsivePageSize', () => {
  const originalInnerWidth = window.innerWidth;

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      value: originalInnerWidth,
      writable: true,
    });
  });

  it('returns mobile page size on narrow viewports', () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 375,
      writable: true,
    });
    const { result } = renderHook(() => useResponsivePageSize());
    expect(result.current).toBe(50);
  });

  it('returns desktop page size on wide viewports', () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 1440,
      writable: true,
    });
    const { result } = renderHook(() => useResponsivePageSize());
    expect(result.current).toBe(60);
  });

  it('updates when viewport crosses the breakpoint', () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 375,
      writable: true,
    });
    const { result } = renderHook(() => useResponsivePageSize());
    expect(result.current).toBe(50);

    act(() => {
      Object.defineProperty(window, 'innerWidth', {
        value: 1440,
        writable: true,
      });
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current).toBe(60);
  });
});
