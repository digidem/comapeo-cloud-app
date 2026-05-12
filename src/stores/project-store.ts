import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProjectStore {
  selectedProjectId: string | null;
  selectedServerId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  setSelectedServerId: (id: string | null) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
      selectedProjectId: null,
      selectedServerId: null,
      setSelectedProjectId: (id) => set({ selectedProjectId: id }),
      setSelectedServerId: (id) => set({ selectedServerId: id }),
    }),
    {
      name: 'comapeo-project',
    },
  ),
);
