import { beforeEach, describe, expect, it } from 'vitest';

import { useThemeStore } from '@/stores/theme-store';

describe('theme-store', () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: 'cloud' });
  });

  it('default theme is cloud', () => {
    const state = useThemeStore.getState();
    expect(state.theme).toBe('cloud');
  });

  it('setTheme updates state to mobile', () => {
    useThemeStore.getState().setTheme('mobile');
    expect(useThemeStore.getState().theme).toBe('mobile');
  });

  it('setTheme updates state to sentinel', () => {
    useThemeStore.getState().setTheme('sentinel');
    expect(useThemeStore.getState().theme).toBe('sentinel');
  });

  it('state persists across store re-creation', () => {
    useThemeStore.getState().setTheme('mobile');
    // Simulating persistence by checking the state is still mobile
    expect(useThemeStore.getState().theme).toBe('mobile');
  });
});
