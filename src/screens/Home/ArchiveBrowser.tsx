import { useMemo } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { useArchiveStatus } from '@/hooks/useArchiveStatus';
import { useProjects } from '@/hooks/useProjects';
import { useRemoteArchives } from '@/hooks/useRemoteArchives';
import { useAuthStore } from '@/stores/auth-store';

import { ProjectList } from './ProjectList';

const messages = defineMessages({
  archives: {
    id: 'home.archives',
    defaultMessage: 'Archives',
  },
  noProjects: {
    id: 'home.archives.noProjects',
    defaultMessage: 'No projects in this archive',
  },
  emptyTitle: {
    id: 'home.archives.empty.title',
    defaultMessage: 'Welcome to CoMapeo Cloud',
  },
  emptyDesc: {
    id: 'home.archives.empty.desc',
    defaultMessage:
      'Add a remote archive server or create your first project to get started.',
  },
  emptyCta: {
    id: 'home.archives.empty.cta',
    defaultMessage: 'Create Project',
  },
  addAria: {
    id: 'home.archive.addAria',
    defaultMessage: 'Add a new archive server',
  },
  addServer: {
    id: 'home.archive.addServer',
    defaultMessage: 'Add Server',
  },
  firstProjectListAria: {
    id: 'home.noProjects.listCtaAria',
    defaultMessage: 'Create your first project from project list',
  },
});

interface ArchiveBrowserProps {
  selectedProjectId: string | null;
  onSelect: (id: string) => void;
  onCreateNew: () => void;
  onAddServer: () => void;
}

const DOT_COLORS: Record<string, string> = {
  ok: 'bg-success',
  error: 'bg-error',
  syncing: 'bg-info',
  idle: 'bg-tag-neutral-text',
};

function resolveStatus(server: {
  isSyncing: boolean;
  error: string | null;
  lastSyncedAt: string | null;
}): string {
  if (server.isSyncing) return 'syncing';
  if (server.error) return 'error';
  if (server.lastSyncedAt) return 'ok';
  return 'idle';
}

function ArchiveBrowser({
  selectedProjectId,
  onSelect,
  onCreateNew,
  onAddServer,
}: ArchiveBrowserProps) {
  const intl = useIntl();
  const { archives, selectedArchiveId, selectArchive, localProjects } =
    useRemoteArchives();
  const { data: projects = [], isLoading } = useProjects();
  const servers = useAuthStore((s) => s.servers);
  const archiveStatus = useArchiveStatus();

  // Build a map of server status by baseUrl
  const statusMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const server of archiveStatus.servers) {
      map.set(server.baseUrl, resolveStatus(server));
    }
    return map;
  }, [archiveStatus.servers]);

  // Filter projects based on selected archive
  const filteredProjects = useMemo(() => {
    if (!selectedArchiveId) {
      // No archive selected — show all projects
      return projects;
    }
    if (selectedArchiveId === '_local') {
      return localProjects;
    }
    return projects.filter((p) => p.serverUrl === selectedArchiveId);
  }, [selectedArchiveId, projects, localProjects]);

  const hasProjects = projects.length > 0;
  const hasServers = servers.length > 0;
  const isEmpty = !isLoading && !hasProjects && !hasServers;

  return (
    <div className="flex flex-col gap-3">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text">
          {intl.formatMessage(messages.archives)}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onAddServer}
          aria-label={intl.formatMessage(messages.addAria)}
        >
          + {intl.formatMessage(messages.addServer)}
        </Button>
      </div>

      {/* Archive Tabs — horizontal scrolling row */}
      {archives.length > 0 && (
        <div className="overflow-x-auto">
          <div className="flex gap-2 pb-1">
            {archives.map((archive) => {
              const isSelected = archive.archiveId === selectedArchiveId;
              const status = archive.url ? statusMap.get(archive.url) : null;
              return (
                <button
                  key={archive.archiveId}
                  type="button"
                  onClick={() => selectArchive(archive.archiveId)}
                  className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-pill text-sm font-medium transition-colors cursor-pointer whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    isSelected
                      ? 'bg-primary-soft text-primary'
                      : 'text-text hover:bg-surface border border-border'
                  }`}
                >
                  {archive.archiveId === '_local' && (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                  )}
                  <span>{archive.name}</span>
                  <span className="text-xs text-text-muted">
                    ({archive.projectCount})
                  </span>
                  {status && (
                    <span
                      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${DOT_COLORS[status] ?? DOT_COLORS['idle']}`}
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state when no projects AND no servers */}
      {isEmpty ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm font-medium text-text">
            {intl.formatMessage(messages.emptyTitle)}
          </p>
          <p className="text-sm text-text-muted">
            {intl.formatMessage(messages.emptyDesc)}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 mt-1">
            <Button
              variant="primary"
              size="sm"
              onClick={onCreateNew}
              aria-label={intl.formatMessage(messages.firstProjectListAria)}
            >
              {intl.formatMessage(messages.emptyCta)}
            </Button>
            <Button variant="secondary" size="sm" onClick={onAddServer}>
              + {intl.formatMessage(messages.addServer)}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <ProjectList
            projects={filteredProjects}
            selectedProjectId={selectedProjectId}
            onSelect={onSelect}
            onCreateNew={onCreateNew}
            isLoading={isLoading}
            hideEmptyState={!selectedProjectId}
          />
          {/* No projects message for selected archive that has none */}
          {!isLoading && filteredProjects.length === 0 && selectedArchiveId && (
            <p className="text-sm text-text-muted text-center py-4">
              {intl.formatMessage(messages.noProjects)}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export { ArchiveBrowser };
export type { ArchiveBrowserProps };
