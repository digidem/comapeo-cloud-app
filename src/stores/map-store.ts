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
  /**
   * Persist the map selection for the currently hydrated/selected project.
   * Callers must pass that project localId; this does not change
   * activeProjectLocalId.
   */
  setActiveMap: (projectLocalId: string, mapId: string | null) => Promise<void>;
  hydrateActiveMap: (
    projectLocalId: string | null,
    mapId: string | null,
  ) => void;
}

type PersistedMapState = Pick<MapState, 'basemapId'>;

const activeMapOperationVersions = new Map<string, number>();

function nextActiveMapOperationVersion(projectLocalId: string): number {
  const version = (activeMapOperationVersions.get(projectLocalId) ?? 0) + 1;
  activeMapOperationVersions.set(projectLocalId, version);
  return version;
}

export const useMapStore = create<MapState>()(
  persist(
    (set, get) => ({
      basemapId: DEFAULT_BASEMAP_ID,
      setBasemap: (basemapId) => set({ basemapId }),
      activeProjectLocalId: null,
      activeMapId: null,
      // Persist the selection against the explicit target project captured by
      // the caller. The in-memory slot is updated optimistically only when it
      // currently represents that project, while a per-project operation
      // version prevents an older completion from overwriting a newer choice.
      setActiveMap: async (projectLocalId, mapId) => {
        const operationVersion = nextActiveMapOperationVersion(projectLocalId);
        const stateAtStart = get();
        const updatedOptimistically =
          stateAtStart.activeProjectLocalId === projectLocalId;
        const previousMapId = stateAtStart.activeMapId;

        if (updatedOptimistically) set({ activeMapId: mapId });

        const isLatestOperation = () =>
          activeMapOperationVersions.get(projectLocalId) === operationVersion;
        const rollback = () => {
          if (!updatedOptimistically || !isLatestOperation()) return;
          if (get().activeProjectLocalId !== projectLocalId) return;
          if (get().activeMapId !== mapId) return;
          set({ activeMapId: previousMapId });
        };

        let rowsUpdated: number;
        try {
          const db = getDb();
          rowsUpdated = await db.transaction(
            'rw',
            [db.maps, db.projects],
            async () => {
              if (mapId !== null && !(await db.maps.get(mapId))) {
                throw new Error(`Map not found: ${mapId}`);
              }
              return db.projects.update(projectLocalId, {
                activeMapId: mapId,
              });
            },
          );
        } catch (error) {
          rollback();
          throw error;
        }

        if (rowsUpdated === 0) {
          rollback();
          throw new Error(`Project not found: ${projectLocalId}`);
        }

        // If navigation moved away and then back while this write was in flight,
        // hydration may have restored the old persisted value. Reconcile the
        // successful write only when this is still the newest operation for the
        // target project, so a later user selection always wins.
        if (
          isLatestOperation() &&
          get().activeProjectLocalId === projectLocalId
        ) {
          set({ activeMapId: mapId });
        }
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
