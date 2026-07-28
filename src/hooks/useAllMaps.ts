import { useQuery } from '@tanstack/react-query';

import type { Project, SavedMap } from '@/lib/db';
import { getDb } from '@/lib/db';

export const ALL_MAPS_QUERY_KEY = ['maps', 'all'] as const;

export interface SavedMapWithProject extends SavedMap {
  /** Origin project name, or `null` if the project no longer exists. */
  originProjectName: string | null;
}

/**
 * Query every saved map across all projects, sorted by `updatedAt` desc.
 * Each map is joined with its origin project name for cross-project display.
 *
 * Used by the "All projects" view in MapScreen (#16).
 */
export function useAllMaps() {
  return useQuery({
    queryKey: ALL_MAPS_QUERY_KEY,
    queryFn: async (): Promise<SavedMapWithProject[]> => {
      const db = getDb();
      const [maps, projects] = await Promise.all([
        db.maps.toArray(),
        db.projects.toArray(),
      ]);
      const projectMap = new Map<string, Project>();
      for (const project of projects) {
        projectMap.set(project.localId, project);
      }
      const enriched = maps.map((map) => ({
        ...map,
        originProjectName: projectMap.get(map.projectLocalId)?.name ?? null,
      }));
      return enriched.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
  });
}
