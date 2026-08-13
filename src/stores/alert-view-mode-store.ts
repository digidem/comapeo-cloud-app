import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ViewMode } from '@/stores/view-mode-store';

interface AlertViewModeState {
  viewMode: ViewMode;
  setViewMode: (viewMode: ViewMode) => void;
}

export const useAlertViewModeStore = create<AlertViewModeState>()(
  persist(
    (set) => ({
      viewMode: 'map',
      setViewMode: (viewMode) => set({ viewMode }),
    }),
    {
      name: 'alert-view-mode-preference',
    },
  ),
);
