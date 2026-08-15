import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { comapeoStateStorage } from '@/lib/comapeo-local-storage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArchiveState {
  selectedArchiveId: string | null;
  selectArchive: (id: string | null) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useArchiveStore = create<ArchiveState>()(
  persist(
    (set) => ({
      selectedArchiveId: null,
      selectArchive: (id) => set({ selectedArchiveId: id }),
    }),
    {
      name: 'comapeo-archive',
      storage: createJSONStorage(() => comapeoStateStorage),
    },
  ),
);
