import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCountUp } from '@/hooks/useCountUp';

describe('useCountUp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts at 0 and animates to the target number', () => {
    const { result } = renderHook(() => useCountUp(100, 400));

    // Initially starts at 0
    expect(result.current).toBe('0');

    // Advance halfway through animation
    act(() => {
      vi.advanceTimersByTime(200);
    });
    // Should be partway through (eased)
    expect(result.current).not.toBe('0');
    expect(result.current).not.toBe(100);

    // Complete the animation
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe(100);
  });

  it('shows non-numeric values immediately without animation', () => {
    const { result } = renderHook(() => useCountUp('Connected', 400));
    expect(result.current).toBe('Connected');
  });

  it('shows zero values immediately without animation', () => {
    const { result } = renderHook(() => useCountUp(0, 400));
    expect(result.current).toBe(0);
  });

  it('re-animates when the value prop changes', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useCountUp(value, 400),
      { initialProps: { value: 50 } },
    );

    // Complete first animation
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current).toBe(50);

    // Change value to 200
    rerender({ value: 200 });

    // Should start animating from the previous value (50) toward 200
    act(() => {
      vi.advanceTimersByTime(100);
    });
    // Should be somewhere between 50 and 200
    const currentValue =
      typeof result.current === 'number'
        ? result.current
        : parseInt(String(result.current), 10);
    expect(currentValue).toBeGreaterThan(50);
    expect(currentValue).toBeLessThan(200);

    // Complete animation
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe(200);
  });

  it('animates from previous value to new value when value changes', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useCountUp(value, 400),
      { initialProps: { value: 100 } },
    );

    // Complete first animation
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current).toBe(100);

    // Change to a smaller value
    rerender({ value: 30 });

    // After a tiny bit of time, should be moving from 100 toward 30
    act(() => {
      vi.advanceTimersByTime(50);
    });
    const currentValue =
      typeof result.current === 'number'
        ? result.current
        : parseInt(String(result.current), 10);
    expect(currentValue).toBeLessThan(100);
    expect(currentValue).toBeGreaterThan(30);

    // Complete animation
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current).toBe(30);
  });

  it('handles string numeric values with formatting', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useCountUp(value, 400),
      { initialProps: { value: '1,000' } },
    );

    // Complete first animation
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current).toBe('1,000');

    // Change to a new formatted value
    rerender({ value: '2,500' });

    // Complete second animation
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current).toBe('2,500');
  });

  it('handles transition from numeric to non-numeric value', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string | number }) => useCountUp(value, 400),
      { initialProps: { value: 50 as string | number } },
    );

    // Complete first animation
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current).toBe(50);

    // Switch to non-numeric
    rerender({ value: 'Local' });
    expect(result.current).toBe('Local');
  });
});
