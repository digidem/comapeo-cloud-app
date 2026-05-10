import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useThemeTokens } from '@/hooks/useThemeTokens';
import { useThemeStore } from '@/stores/theme-store';

describe('useThemeTokens', () => {
  it('returns correct map colors for cloud theme', () => {
    useThemeStore.setState({ theme: 'cloud' });
    const { result } = renderHook(() => useThemeTokens());
    expect(result.current.mapColors.observed).toBe('#1F6FFF');
    expect(result.current.mapColors.connectivity).toBe('#0F9D58');
    expect(result.current.mapColors.warning).toBe('#FF6B00');
    expect(result.current.mapColors.cluster).toBe('#7C3AED');
    expect(result.current.mapColors.grid).toBe('#04145C');
  });

  it('returns correct navy color for cloud theme', () => {
    useThemeStore.setState({ theme: 'cloud' });
    const { result } = renderHook(() => useThemeTokens());
    expect(result.current.navy).toBe('#04145C');
  });

  it('returns correct map colors for mobile theme', () => {
    useThemeStore.setState({ theme: 'mobile' });
    const { result } = renderHook(() => useThemeTokens());
    expect(result.current.mapColors.observed).toBe('#E85C41');
    expect(result.current.mapColors.connectivity).toBe('#529214');
    expect(result.current.navy).toBe('#020E62');
  });

  it('returns correct map colors for sentinel theme', () => {
    useThemeStore.setState({ theme: 'sentinel' });
    const { result } = renderHook(() => useThemeTokens());
    expect(result.current.mapColors.observed).toBe('#0053CD');
    expect(result.current.mapColors.connectivity).toBe('#008649');
    expect(result.current.navy).toBe('#04145C');
  });
});
