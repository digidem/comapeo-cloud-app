import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { getDb } from '@/lib/db';
import { DEFAULT_BASEMAP_ID } from '@/lib/map/basemaps';

interface MapState {
  basemapId: string;
  setBasemap: (basemapId: string) => void;
  /**
   * The project the store is currently representing. Set (alongside
   * `activeMapId`) by the hydration effect whenever the selected project
   * changes. `setActiveMap` reads it so a failed write's rollback can tell
   * whether the store still represents the project that issued the write —
   * if the user has since switched projects, the rollback must NOT touch the
   * store, or it would restore the old project's selection into the new
   * project's slot.
   */
  activeProjectLocalId: string | null;
  /**
   * The active saved map for the currently selected project, or `null` when
   * cleared. Rehydrated from Dexie (not localStorage) by the hydration effect
   * in AuthenticatedLayoutInner whenever the active project changes — so it is
   * deliberately excluded from persistence below.
   */
  activeMapId: string | null;
  setActiveMap: (projectLocalId: string, mapId: string | null) => void;
  hydrateActiveMap: (
    projectLocalId: string | null,
    mapId: string | null,
  ) => void;
}

type PersistedMapState = Pick<MapState, 'basemapId'>;

export const useMapStore = create<MapState>()(
  persist(
    (set, get) => ({
      basemapId: DEFAULT_BASEMAP_ID,
      setBasemap: (basemapId) => set({ basemapId }),
      activeProjectLocalId: null,
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
        // Revert the optimistic selection only when the store still represents
        // the SAME project that issued this write AND no later setActiveMap
        // call has since changed the value. Once the user switches projects
        // the hydration effect owns activeMapId, so restoring previousMapId
        // here would drop the old project's selection into the new project's
        // slot (the value comparison alone is not enough: both projects can
        // share a value, e.g. null).
        const rollback = () => {
          if (get().activeProjectLocalId !== projectLocalId) return;
          if (get().activeMapId !== mapId) return;
          set({ activeMapId: previousMapId });
        };
        void getDb()
          .projects.update(projectLocalId, { activeMapId: mapId })
          .then((rowsUpdated) => {
            if (rowsUpdated === 0) rollback();
          })
          .catch(() => rollback());
      },
      // Cache-only setter used by the hydration effect to avoid writing back
      // the value it just read from Dexie. Also records which project the
      // store is now representing so setActiveMap's rollback stays scoped to
      // the issuing project.
      hydrateActiveMap: (projectLocalId, mapId) =>
        set({ activeProjectLocalId: projectLocalId, activeMapId: mapId }),
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
