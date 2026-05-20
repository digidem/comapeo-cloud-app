import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { DEFAULT_BASEMAP_ID } from '@/lib/map/basemaps';

interface MapState {
  basemapId: string;
  setBasemap: (basemapId: string) => void;
}

type PersistedMapState = Pick<MapState, 'basemapId'>;

export const useMapStore = create<MapState>()(
  persist(
    (set) => ({
      basemapId: DEFAULT_BASEMAP_ID,
      setBasemap: (basemapId) => set({ basemapId }),
    }),
    {
      name: 'comapeo-map',
      version: 1,
      // Only persist the selected basemap id — not the setter function
      partialize: (state): PersistedMapState => ({
        basemapId: state.basemapId,
      }),
    },
  ),
);
