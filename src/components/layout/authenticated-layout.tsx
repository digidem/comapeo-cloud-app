import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { useQueryClient } from '@tanstack/react-query';
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router';

import { AppShell } from '@/components/layout/app-shell';
import {
  ShellSlotProvider,
  useShellOverrides,
} from '@/components/layout/shell-slot';
import { useAutoSync } from '@/hooks/useAutoSync';
import { useProjects } from '@/hooks/useProjects';
import { syncRemoteArchive } from '@/lib/data-layer';
import { getDb } from '@/lib/db';
import { AddArchiveServerDialog } from '@/screens/Home/AddArchiveServerDialog';
import { ArchiveBrowser } from '@/screens/Home/ArchiveBrowser';
import { CreateProjectDialog } from '@/screens/Home/CreateProjectDialog';
import { useAuthStore } from '@/stores/auth-store';
import { useMapStore } from '@/stores/map-store';
import { useProjectStore } from '@/stores/project-store';

const messages = defineMessages({
  home: { id: 'home.title', defaultMessage: 'Home' },
  data: { id: 'data.title', defaultMessage: 'Data' },
  alerts: { id: 'alerts.title', defaultMessage: 'Alerts' },
  map: { id: 'map.title', defaultMessage: 'Map' },
  settings: { id: 'settings.title', defaultMessage: 'Settings' },
  appTitle: { id: 'app.title', defaultMessage: 'CoMapeo Cloud' },
});

function HomeIcon(): ReactNode {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={20}
      height={20}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7A1 1 0 003 11h1v6a1 1 0 001 1h4v-4h2v4h4a1 1 0 001-1v-6h1a1 1 0 00.707-1.707l-7-7z" />
    </svg>
  );
}

function DataIcon(): ReactNode {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={20}
      height={20}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M10 1C6.686 1 4 3.686 4 7c0 5 6 11 6 11s6-6 6-11c0-3.314-2.686-6-6-6zm0 9a3 3 0 110-6 3 3 0 010 6z" />
    </svg>
  );
}

function AlertsIcon(): ReactNode {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={20}
      height={20}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M10 2a1 1 0 011 1v1.07A7.001 7.001 0 0117 11v3l1 1v1H2v-1l1-1v-3a7.001 7.001 0 016-6.93V3a1 1 0 011-1zm0 16a2 2 0 01-2-2h4a2 2 0 01-2 2z" />
    </svg>
  );
}

function MapIcon(): ReactNode {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={20}
      height={20}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      {/* Stacked map layers: top rhombus + two offset front-face bands */}
      <path d="M10 1L18 5 10 9 2 5Z" />
      <path d="M2 9L10 13 18 9 18 11 10 15 2 11Z" />
      <path d="M2 13L10 17 18 13 18 15 10 19 2 15Z" />
    </svg>
  );
}

function SettingsIcon(): ReactNode {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={20}
      height={20}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** Normalize a URL for comparison by stripping trailing slashes. */
function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/** Group projects by archive server, returning a map keyed by server ID. */
function groupProjectsByServer(
  servers: Array<{ id: string; baseUrl: string }>,
  projects: Array<{ localId: string; name?: string; serverUrl?: string }>,
): {
  archiveProjects: Record<string, Array<{ localId: string; name: string }>>;
  localProjects: Array<{ localId: string; name: string }>;
} {
  const serverUrlToId: Record<string, string> = {};
  for (const s of servers) {
    serverUrlToId[normalizeUrl(s.baseUrl)] = s.id;
  }

  const archiveProjects: Record<
    string,
    Array<{ localId: string; name: string }>
  > = {};
  const localProjects: Array<{ localId: string; name: string }> = [];

  for (const p of projects) {
    const entry = { localId: p.localId, name: p.name ?? 'Untitled' };
    if (p.serverUrl) {
      const serverId = serverUrlToId[normalizeUrl(p.serverUrl)];
      if (serverId) {
        if (!archiveProjects[serverId]) {
          archiveProjects[serverId] = [];
        }
        archiveProjects[serverId].push(entry);
      } else {
        // Server URL does not match any known server, so treat it as local.
        localProjects.push(entry);
      }
    } else {
      localProjects.push(entry);
    }
  }

  return { archiveProjects, localProjects };
}

function AuthenticatedLayoutInner() {
  const intl = useIntl();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const selectedServerId = useProjectStore((s) => s.selectedServerId);
  const hydrateActiveMap = useMapStore((s) => s.hydrateActiveMap);
  const { topbarWorkspaceName, topbarModeLabel, topbarActions } =
    useShellOverrides();

  // Hydrate the active saved map for the selected project from Dexie whenever
  // the active project changes. The `cancelled` flag guards against stale
  // async: if the user switches projects before the read resolves, the
  // previous project's result is discarded instead of overwriting the store.
  useEffect(() => {
    if (!selectedProjectId) {
      // No project selected — clear any leaked activeMapId from a previous project
      hydrateActiveMap(null, null);
      return;
    }
    let cancelled = false;
    void getDb()
      .projects.get(selectedProjectId)
      .then((proj) => {
        if (!cancelled) {
          hydrateActiveMap(selectedProjectId, proj?.activeMapId ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Preserve the current selection on a transient same-project read
          // failure. Only reset when the store still represents a different
          // project to avoid leaking that project's activeMapId.
          if (
            useMapStore.getState().activeProjectLocalId !== selectedProjectId
          ) {
            hydrateActiveMap(selectedProjectId, null);
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId, hydrateActiveMap]);

  // Shared dialog state for mobile drawer and sidebar actions.
  const [isAddServerOpen, setAddServerOpen] = useState(false);
  const [isCreateProjectOpen, setCreateProjectOpen] = useState(false);

  // Data for drawer archive/project sections.
  const servers = useAuthStore((s) => s.servers);
  const { data: projects = [] } = useProjects();

  const drawerArchives = useMemo(
    () =>
      servers.map((s) => ({
        id: s.id,
        label: s.label ?? s.baseUrl,
        baseUrl: s.baseUrl,
      })),
    [servers],
  );

  // Group projects by archive server.
  const { archiveProjects, localProjects } = useMemo(
    () => groupProjectsByServer(servers, projects),
    [servers, projects],
  );

  const NAV_ITEMS = [
    {
      path: '/',
      label: intl.formatMessage(messages.home),
      icon: <HomeIcon />,
    },
    {
      path: '/data',
      label: intl.formatMessage(messages.data),
      icon: <DataIcon />,
    },
    {
      path: '/alerts',
      label: intl.formatMessage(messages.alerts),
      icon: <AlertsIcon />,
    },
    {
      path: '/map',
      label: intl.formatMessage(messages.map),
      icon: <MapIcon />,
    },
    {
      path: '/settings',
      label: intl.formatMessage(messages.settings),
      icon: <SettingsIcon />,
    },
  ];

  return (
    <>
      <AppShell
        topbarWorkspaceName={topbarWorkspaceName}
        topbarModeLabel={topbarModeLabel}
        topbarActions={topbarActions}
        navItems={NAV_ITEMS}
        activeNavPath={pathname}
        secondaryContent={
          <div className="flex flex-col gap-4 p-4">
            <ArchiveBrowser
              selectedProjectId={selectedProjectId}
              onSelect={(id) => {
                useProjectStore.getState().setSelectedProjectId(id);
                navigate({ to: '/' });
              }}
              onCreateNew={() => setCreateProjectOpen(true)}
              onAddServer={() => setAddServerOpen(true)}
              onSelectServer={(id) => {
                useProjectStore.getState().setSelectedServerId(id);
                navigate({ to: '/' });
              }}
            />
          </div>
        }
        drawerArchives={drawerArchives}
        drawerArchiveProjects={archiveProjects}
        drawerLocalProjects={localProjects}
        activeArchiveId={selectedServerId ?? undefined}
        activeProjectId={selectedProjectId ?? undefined}
        onDrawerAddServer={() => setAddServerOpen(true)}
        onDrawerCreateProject={() => setCreateProjectOpen(true)}
        onDrawerSelectServer={(id) => {
          useProjectStore.getState().setSelectedServerId(id);
          navigate({ to: '/' });
        }}
        onDrawerSelectProject={(id) => {
          useProjectStore.getState().setSelectedProjectId(id);
          navigate({ to: '/' });
        }}
        onDrawerArchiveSettings={(id) => {
          // Archive settings navigates to Home, where ArchiveBrowser owns the dialog.
          useProjectStore.getState().setSelectedServerId(id);
          navigate({ to: '/' });
        }}
      >
        <Outlet />
      </AppShell>

      <AddArchiveServerDialog
        isOpen={isAddServerOpen}
        onClose={() => setAddServerOpen(false)}
        onAdded={(serverId) => {
          setAddServerOpen(false);
          const server = useAuthStore
            .getState()
            .servers.find((s) => s.id === serverId);
          if (server) {
            void syncRemoteArchive(serverId, {
              baseUrl: server.baseUrl,
              token: server.token,
            })
              .then(() => {
                void queryClient.invalidateQueries({ queryKey: ['projects'] });
                void queryClient.invalidateQueries({
                  queryKey: ['observations'],
                });
                void queryClient.invalidateQueries({ queryKey: ['alerts'] });
              })
              .catch(() => {
                // Sync failure is handled by the sync layer — don't block UI
              });
          }
        }}
      />

      <CreateProjectDialog
        isOpen={isCreateProjectOpen}
        onClose={() => setCreateProjectOpen(false)}
        onCreated={(id) => {
          setCreateProjectOpen(false);
          useProjectStore.getState().setSelectedProjectId(id);
          void queryClient.invalidateQueries({ queryKey: ['projects'] });
          navigate({ to: '/' });
        }}
        serverUrl={undefined}
      />
    </>
  );
}

export function AuthenticatedLayout() {
  return (
    <ShellSlotProvider>
      <AutoSyncWrapper />
    </ShellSlotProvider>
  );
}

/**
 * Inner wrapper that runs auto-sync once on mount.
 * Separated so the ShellSlotProvider is already in the tree
 * when sync-triggered invalidations cause re-renders.
 */
function AutoSyncWrapper() {
  useAutoSync();
  return <AuthenticatedLayoutInner />;
}
