import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeId = 'cloud' | 'mobile' | 'sentinel';

interface ThemeState {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'cloud',
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'comapeo-theme',
    },
  ),
);
