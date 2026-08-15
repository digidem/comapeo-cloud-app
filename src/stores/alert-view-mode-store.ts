import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { comapeoStateStorage } from '@/lib/comapeo-local-storage';
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
      name: 'comapeo-alert-view-mode-preference',
      storage: createJSONStorage(() => comapeoStateStorage),
    },
  ),
);
