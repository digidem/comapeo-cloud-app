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
    (set, get) => ({
      basemapId: DEFAULT_BASEMAP_ID,
      setBasemap: (basemapId) => set({ basemapId }),
      activeMapId: null,
      // Optimistically updates the in-memory cache, then persists the choice on
      // the Dexie Project record. If the write never lands — either IndexedDB
      // rejects it, or Dexie's update() touches 0 rows because the project no
      // longer exists — the optimistic cache update is rolled back so the UI
      // matches the still-unchanged project row instead of showing a selection
      // that would silently revert on the next hydration.
      setActiveMap: (projectLocalId, mapId) => {
        const previousMapId = get().activeMapId;
        set({ activeMapId: mapId });
        // Revert the optimistic selection only if no later setActiveMap call has
        // since changed it — otherwise we would clobber the newer choice.
        const rollback = () => {
          if (get().activeMapId === mapId) {
            set({ activeMapId: previousMapId });
          }
        };
        void getDb()
          .projects.update(projectLocalId, { activeMapId: mapId })
          .then((rowsUpdated) => {
            if (rowsUpdated === 0) rollback();
          })
          .catch(() => rollback());
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
