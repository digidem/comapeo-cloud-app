import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
    },
  ),
);
