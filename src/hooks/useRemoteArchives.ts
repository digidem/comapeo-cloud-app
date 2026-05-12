import type { Project } from '@/lib/db';
import { useArchiveStore } from '@/stores/archive-store';
import { useAuthStore } from '@/stores/auth-store';

import { useProjects } from './useProjects';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RemoteArchive {
  archiveId: string;
  name: string;
  url: string | null;
  projectCount: number;
}

export interface UseRemoteArchivesReturn {
  archives: RemoteArchive[];
  selectedArchiveId: string | null;
  selectArchive: (id: string | null) => void;
  localProjects: Project[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function findServerName(
  serverUrl: string,
  servers: { baseUrl: string; label?: string }[],
): string {
  const matched = servers.find((s) => s.baseUrl === serverUrl);
  if (matched?.label) return matched.label;
  return extractHostname(serverUrl);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRemoteArchives(): UseRemoteArchivesReturn {
  const { data: projects = [] } = useProjects();
  const servers = useAuthStore((s) => s.servers);
  const { selectedArchiveId, selectArchive } = useArchiveStore();

  // Group projects by serverUrl
  const groups = new Map<string, Project[]>();

  for (const project of projects) {
    const key = project.serverUrl || '_local';
    const existing = groups.get(key);
    if (existing) {
      existing.push(project);
    } else {
      groups.set(key, [project]);
    }
  }

  // Build archives list
  const archives: RemoteArchive[] = [];

  for (const [key, group] of groups) {
    if (key === '_local') {
      archives.push({
        archiveId: '_local',
        name: 'Local',
        url: null,
        projectCount: group.length,
      });
    } else {
      archives.push({
        archiveId: key,
        name: findServerName(key, servers),
        url: key,
        projectCount: group.length,
      });
    }
  }

  // Sort: '_local' first (pinned), then alphabetical by name
  archives.sort((a, b) => {
    if (a.archiveId === '_local') return -1;
    if (b.archiveId === '_local') return 1;
    return a.name.localeCompare(b.name);
  });

  // localProjects = projects that belong to the '_local' group
  const localProjects = groups.get('_local') ?? [];

  return { archives, selectedArchiveId, selectArchive, localProjects };
}
