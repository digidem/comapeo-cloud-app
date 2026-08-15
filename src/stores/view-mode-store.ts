import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  VIEW_MODE_STORAGE_KEY,
  comapeoStateStorage,
} from '@/lib/comapeo-local-storage';

export type ViewMode = 'grid' | 'map';

interface ViewModeState {
  viewMode: ViewMode;
  setViewMode: (viewMode: ViewMode) => void;
}

export const useViewModeStore = create<ViewModeState>()(
  persist(
    (set) => ({
      viewMode: 'map',
      setViewMode: (viewMode) => set({ viewMode }),
    }),
    {
      name: VIEW_MODE_STORAGE_KEY,
      storage: createJSONStorage(() => comapeoStateStorage),
    },
  ),
);
