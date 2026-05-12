import { useMemo, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { useArchiveStatus } from '@/hooks/useArchiveStatus';
import { useProjects } from '@/hooks/useProjects';
import { useRemoteArchives } from '@/hooks/useRemoteArchives';
import { useAuthStore } from '@/stores/auth-store';
import type { Project } from '@/lib/db';

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
  onEditProject: (localId: string) => void;
  onDeleteProject: (localId: string) => void;
  onSelectServer?: (serverId: string) => void;
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

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function ArchiveBrowser({
  selectedProjectId,
  onSelect,
  onCreateNew,
  onAddServer,
  onEditProject,
  onDeleteProject,
  onSelectServer,
}: ArchiveBrowserProps) {
  const intl = useIntl();
  const { archives, selectedArchiveId, selectArchive } = useRemoteArchives();
  const { data: projects = [], isLoading } = useProjects();
  const servers = useAuthStore((s) => s.servers);
  const archiveStatus = useArchiveStatus();

  // Build a map of server status by baseUrl
  const statusMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const server of archiveStatus.servers) {
      map.set(normalizeUrl(server.baseUrl), resolveStatus(server));
    }
    return map;
  }, [archiveStatus.servers]);

  // Build a map of archive URL to server ID (for detail view)
  // Uses archiveStatus.servers (merged auth store + IndexedDB) so it
  // survives page reloads where auth store is in-memory only.
  const serverIdByUrl = useMemo(() => {
    const map = new Map<string, string>();
    for (const server of archiveStatus.servers) {
      map.set(normalizeUrl(server.baseUrl), server.id);
    }
    return map;
  }, [archiveStatus.servers]);

  // Group projects by archive (serverUrl or '_local')
  const projectsByArchive = useMemo(() => {
    const map = new Map<string, Project[]>();
    for (const p of projects) {
      const key = p.serverUrl || '_local';
      const existing = map.get(key);
      if (existing) existing.push(p);
      else map.set(key, [p]);
    }
    return map;
  }, [projects]);

  function getProjectsForArchive(archiveId: string) {
    return projectsByArchive.get(archiveId) ?? [];
  }

  // Expanded archives state — initialise all expanded by default
  const [expandedArchives, setExpandedArchives] = useState<Set<string>>(
    () => new Set(archives.map((a) => a.archiveId)),
  );

  function toggleArchive(id: string) {
    setExpandedArchives((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    selectArchive(id);
  }

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
        /* Accordion archive sections */
        <div className="flex flex-col gap-1">
          {archives.map((archive) => {
            const status = archive.url ? statusMap.get(normalizeUrl(archive.url)) : null;
            const archiveProjects = getProjectsForArchive(archive.archiveId);
            const isExpanded = expandedArchives.has(archive.archiveId);

            return (
              <div key={archive.archiveId}>
                {/* Archive header — clickable toggle */}
                <button
                  type="button"
                  onClick={() => toggleArchive(archive.archiveId)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-btn text-sm font-medium text-text hover:bg-surface transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {/* Chevron icon — rotates when expanded */}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={`transition-transform shrink-0 ${
                      isExpanded ? 'rotate-90' : ''
                    }`}
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                  {/* Status dot (if applicable) */}
                  {status && (
                    <span
                      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${DOT_COLORS[status] ?? DOT_COLORS['idle']}`}
                      aria-hidden="true"
                    />
                  )}
                  {/* Archive name */}
                  <span className="flex-1 text-left truncate">
                    {archive.name}
                  </span>
                  {/* Project count badge */}
                  <span className="text-xs text-text-muted shrink-0">
                    ({archive.projectCount})
                  </span>
                  {/* Server settings button — only for remote archives */}
                  {archive.url && onSelectServer && (() => {
                    const sid = serverIdByUrl.get(normalizeUrl(archive.url));
                    return sid ? (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectServer(sid);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.stopPropagation();
                            onSelectServer(sid);
                          }
                        }}
                        className="h-6 w-6 rounded-full text-text-muted hover:text-text hover:bg-surface
                                   inline-flex items-center justify-center shrink-0
                                   cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        aria-label={`Manage ${archive.name}`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                             strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="3"/>
                          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                        </svg>
                      </span>
                    ) : null;
                  })()}
                </button>

                {/* Collapsible project list */}
                {isExpanded && (
                  <div className="ml-4 mt-1 flex flex-col gap-0.5">
                    {archiveProjects.map((project) => {
                      const isActive = project.localId === selectedProjectId;
                      return (
                        <div
                          key={project.localId}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-btn text-sm transition-colors ${
                            isActive
                              ? 'bg-primary-soft text-primary font-medium'
                              : 'text-text hover:bg-surface'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => onSelect(project.localId)}
                            className="flex-1 text-left truncate cursor-pointer focus:outline-none"
                          >
                            {project.name ?? 'Untitled'}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditProject(project.localId);
                            }}
                            className="h-6 w-6 rounded-full text-text-muted hover:text-text hover:bg-surface inline-flex items-center justify-center shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            aria-label="Edit project"
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteProject(project.localId);
                            }}
                            className="h-6 w-6 rounded-full text-text-muted hover:text-error hover:bg-surface inline-flex items-center justify-center shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            aria-label="Delete project"
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M3 6h18" />
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      );
                    })}
                    {/* Empty state for an archive with no projects */}
                    {archiveProjects.length === 0 && (
                      <p className="text-xs text-text-muted px-3 py-2">
                        {intl.formatMessage(messages.noProjects)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { ArchiveBrowser };
export type { ArchiveBrowserProps };
