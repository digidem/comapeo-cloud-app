import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ViewMode = 'grid' | 'map';

interface ViewModeState {
  viewMode: ViewMode;
  setViewMode: (viewMode: ViewMode) => void;
}

export const useViewModeStore = create<ViewModeState>()(
  persist(
    (set) => ({
      viewMode: 'grid',
      setViewMode: (viewMode) => set({ viewMode }),
    }),
    {
      name: 'view-mode-preference',
    },
  ),
);
