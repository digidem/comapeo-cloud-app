import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { getDb } from '@/lib/db';
import { DEFAULT_BASEMAP_ID } from '@/lib/map/basemaps';

interface MapState {
  basemapId: string;
  setBasemap: (basemapId: string) => void;
  /**
   * The active saved map for the currently selected project, or `null` when
   * cleared. Rehydrated from Dexie (not localStorage) by the hydration effect
   * in AuthenticatedLayoutInner whenever the active project changes — so it is
   * deliberately excluded from persistence below.
   */
  activeMapId: string | null;
  setActiveMap: (projectLocalId: string, mapId: string | null) => void;
  hydrateActiveMap: (mapId: string | null) => void;
}

type PersistedMapState = Pick<MapState, 'basemapId'>;

export const useMapStore = create<MapState>()(
  persist(
    (set) => ({
      basemapId: DEFAULT_BASEMAP_ID,
      setBasemap: (basemapId) => set({ basemapId }),
      activeMapId: null,
      // Updates the in-memory cache and persists the choice on the Dexie
      // Project record. Dexie's update() returns 0 (no rows touched) when the
      // project does not exist, so a stale projectLocalId is a silent no-op
      // rather than a throw.
      setActiveMap: (projectLocalId, mapId) => {
        set({ activeMapId: mapId });
        void getDb()
          .projects.update(projectLocalId, { activeMapId: mapId })
          .catch(() => {
            // Swallow Dexie errors — the cache update above remains the source
            // of truth for the current session.
          });
      },
      // Cache-only setter used by the hydration effect to avoid writing back
      // the value it just read from Dexie.
      hydrateActiveMap: (mapId) => set({ activeMapId: mapId }),
    }),
    {
      name: 'comapeo-map',
      version: 1,
      // Only persist the selected basemap id — not the setter functions and not
      // the project-scoped activeMapId (which is rehydrated from Dexie).
      partialize: (state): PersistedMapState => ({
        basemapId: state.basemapId,
      }),
    },
  ),
);
