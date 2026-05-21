import * as Dialog from '@radix-ui/react-dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { Link } from '@tanstack/react-router';

import { ArchiveOverflowSheet } from '@/components/shared/ArchiveOverflowSheet';
import { Button } from '@/components/ui/button';
import { SUPPORTED_LOCALES } from '@/i18n/load-messages';
import { useLocaleStore } from '@/stores/locale-store';
import type { Locale } from '@/stores/locale-store';

const messages = defineMessages({
  navTitle: {
    id: 'mobileNav.navTitle',
    defaultMessage: 'Navigation',
  },
  dialogTitle: {
    id: 'mobileNav.dialogTitle',
    defaultMessage: 'Menu',
  },
  archivesTitle: {
    id: 'mobileNav.archivesTitle',
    defaultMessage: 'Archives',
  },
  addServer: {
    id: 'mobileNav.addServer',
    defaultMessage: 'Add Server',
  },
  createProject: {
    id: 'mobileNav.createProject',
    defaultMessage: 'Create Project',
  },
  noServersTitle: {
    id: 'mobileNav.noServersTitle',
    defaultMessage: 'No remote archive servers yet.',
  },
  noServersDesc: {
    id: 'mobileNav.noServersDesc',
    defaultMessage: 'Add a server to sync projects, observations, and alerts.',
  },
  noProjectsInArchive: {
    id: 'mobileNav.noProjectsInArchive',
    defaultMessage: 'No projects in this archive yet.',
  },
  localProjects: {
    id: 'mobileNav.localProjects',
    defaultMessage: 'Local',
  },
  language: {
    id: 'mobileNav.language',
    defaultMessage: 'Language',
  },
  closeMenu: {
    id: 'mobileNav.closeMenu',
    defaultMessage: 'Close menu',
  },
  archiveSettings: {
    id: 'mobileNav.archiveSettings',
    defaultMessage: 'Archive settings',
  },
  archiveActions: {
    id: 'mobileNav.archiveActions',
    defaultMessage: 'Archive actions',
  },
  collapseAria: {
    id: 'mobileNav.collapseAria',
    defaultMessage: 'Toggle archive section',
  },
});

const LOCALE_NAMES: Record<Locale, string> = {
  en: 'EN',
  pt: 'PT',
  es: 'ES',
};

function getServerStatusColor({
  isActive,
  status,
}: {
  isActive: boolean;
  status?: ServerEntry['status'];
}): string {
  if (isActive) return 'bg-primary';
  if (status === 'syncing') return 'bg-warning';
  if (status === 'error') return 'bg-danger';
  return 'bg-success';
}

interface ServerEntry {
  id: string;
  label: string;
  baseUrl?: string;
  status?: 'idle' | 'syncing' | 'error' | 'success';
}

interface ProjectEntry {
  localId: string;
  name: string;
}

interface MobileNavDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  navItems: Array<{ path: string; label: string; icon: ReactNode }>;
  activePath: string;
  onNavigate: () => void;
  /** Archive servers with their nested projects */
  archives?: ServerEntry[];
  /** Projects grouped by archive server ID */
  archiveProjects?: Record<string, ProjectEntry[]>;
  /** Local projects (not tied to any archive) */
  localProjects?: ProjectEntry[];
  /** Currently active archive server ID */
  activeArchiveId?: string;
  /** Currently active project localId */
  activeProjectId?: string;
  /** Handlers */
  onAddServer?: () => void;
  onCreateProject?: () => void;
  onSelectServer?: (id: string) => void;
  onSelectProject?: (id: string) => void;
  onArchiveSettings?: (id: string) => void;
}

function MobileNavDrawer({
  open,
  onOpenChange,
  navItems,
  activePath,
  onNavigate,
  archives = [],
  archiveProjects = {},
  localProjects = [],
  activeArchiveId,
  activeProjectId,
  onAddServer,
  onCreateProject,
  onSelectServer,
  onSelectProject,
  onArchiveSettings,
}: MobileNavDrawerProps) {
  const intl = useIntl();
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);

  // Store explicit user toggles; archives default to expanded.
  const [expandedArchives, setExpandedArchives] = useState<
    Record<string, boolean>
  >({});
  const [overflowArchive, setOverflowArchive] = useState<{
    id: string;
    label: string;
    baseUrl?: string;
  } | null>(null);

  const toggleArchive = (id: string) => {
    setExpandedArchives((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));
  };

  const hasArchives = archives.length > 0;
  const hasLocalProjects = localProjects.length > 0;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          forceMount
          className="fixed inset-0 z-50 bg-black/50 motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-out data-[state=closed]:opacity-0 data-[state=closed]:backdrop-blur-0 data-[state=open]:opacity-100 data-[state=open]:backdrop-blur-sm"
        />
        <Dialog.Content
          forceMount
          aria-describedby={undefined}
          className="drawer-content fixed top-0 bottom-0 left-0 z-50 flex w-[84vw] max-w-sm flex-col bg-surface-card shadow-elevated focus:outline-none motion-safe:transition-all motion-safe:duration-[400ms] motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] data-[state=closed]:-translate-x-full data-[state=closed]:scale-[0.85] data-[state=closed]:opacity-0 data-[state=open]:translate-x-0 data-[state=open]:scale-100 data-[state=open]:opacity-100"
        >
          <Dialog.Title asChild>
            <VisuallyHidden.Root>
              {intl.formatMessage(messages.dialogTitle)}
            </VisuallyHidden.Root>
          </Dialog.Title>

          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <img
                src="/comapeo_cloud_app.svg"
                alt=""
                className="h-8 w-auto"
                aria-hidden="true"
              />
              <span
                className="text-sm font-semibold"
                aria-label="CoMapeo Cloud"
              >
                <span className="text-warning">Co</span>
                <span className="text-text">Mapeo Cloud</span>
              </span>
            </div>
            <Dialog.Close
              className="inline-flex h-11 w-11 items-center justify-center rounded-btn text-text-muted hover:bg-surface hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={intl.formatMessage(messages.closeMenu)}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 15 15"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
                  fill="currentColor"
                  fillRule="evenodd"
                  clipRule="evenodd"
                />
              </svg>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="px-2 pt-4 pb-2">
              <h3 className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
                {intl.formatMessage(messages.navTitle)}
              </h3>
              <nav
                aria-label="Main navigation"
                className="flex flex-col gap-0.5"
              >
                {navItems.map((item) => {
                  const isActive = activePath === item.path;
                  return (
                    <div key={item.path} className="drawer-nav-item">
                      <Link
                        to={item.path}
                        onClick={onNavigate}
                        aria-current={isActive ? 'page' : undefined}
                        className={`flex w-full items-center gap-3 rounded-btn px-3 py-2.5 text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-primary-soft text-primary'
                            : 'text-text hover:bg-surface'
                        }`}
                      >
                        <span
                          className={`shrink-0 ${
                            isActive ? 'text-primary' : 'text-text-muted'
                          }`}
                        >
                          {item.icon}
                        </span>
                        <span>{item.label}</span>
                      </Link>
                    </div>
                  );
                })}
              </nav>
            </div>

            <div className="mx-4 my-1 border-t border-border" />

            <div className="px-2 pt-2 pb-2">
              <div className="flex items-center justify-between px-3 pb-1">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  {intl.formatMessage(messages.archivesTitle)}
                </h3>
                {onAddServer && hasArchives && (
                  <button
                    type="button"
                    onClick={() => {
                      onNavigate();
                      onAddServer();
                    }}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-btn bg-primary-soft/50 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary-soft hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={intl.formatMessage(messages.addServer)}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    {intl.formatMessage(messages.addServer)}
                  </button>
                )}
              </div>

              {hasArchives ? (
                <div className="flex flex-col gap-2">
                  {archives.map((server) => {
                    const isActiveArchive = activeArchiveId === server.id;
                    const projects = archiveProjects[server.id] ?? [];
                    const isExpanded = expandedArchives[server.id] ?? true;

                    return (
                      <div
                        key={server.id}
                        className={`drawer-archive-group rounded-card border ${
                          isActiveArchive
                            ? 'border-primary/30 bg-primary-soft/30'
                            : 'border-border'
                        }`}
                      >
                        {/* Archive header row */}
                        <div className="flex items-center gap-1 px-3 py-3">
                          {/* Toggle button */}
                          {projects.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleArchive(server.id);
                              }}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-btn text-text-muted transition-colors hover:bg-surface hover:text-text"
                              aria-label={intl.formatMessage(
                                messages.collapseAria,
                              )}
                              aria-expanded={isExpanded}
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                                className={`motion-safe:transition-transform motion-safe:duration-200 ${
                                  isExpanded ? 'rotate-0' : '-rotate-90'
                                }`}
                              >
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </button>
                          )}
                          {/* Spacer when no projects (no toggle needed) */}
                          {projects.length === 0 && (
                            <div className="w-11 shrink-0" />
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              onNavigate();
                              onSelectServer?.(server.id);
                            }}
                            className={`flex min-w-0 flex-1 items-center gap-2 rounded-btn py-1 text-left text-sm font-medium transition-colors ${
                              isActiveArchive
                                ? 'text-primary'
                                : 'text-text hover:text-primary'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${getServerStatusColor(
                                {
                                  isActive: isActiveArchive,
                                  status: server.status,
                                },
                              )}`}
                            />
                            <span className="truncate">{server.label}</span>
                          </button>

                          {/* Overflow actions button */}
                          {onArchiveSettings && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOverflowArchive({
                                  id: server.id,
                                  label: server.label,
                                  baseUrl: server.baseUrl,
                                });
                              }}
                              className="ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-btn text-text-muted transition-colors hover:bg-surface hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                              aria-label={intl.formatMessage(
                                messages.archiveActions,
                              )}
                            >
                              <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                aria-hidden="true"
                              >
                                <circle cx="12" cy="5" r="1.5" />
                                <circle cx="12" cy="12" r="1.5" />
                                <circle cx="12" cy="19" r="1.5" />
                              </svg>
                            </button>
                          )}
                        </div>

                        {isExpanded && (
                          <div className="flex flex-col gap-1 pb-2 pl-11 pr-3">
                            {projects.length > 0 ? (
                              projects.map((proj) => {
                                const isActiveProject =
                                  activeProjectId === proj.localId;
                                return (
                                  <button
                                    key={proj.localId}
                                    type="button"
                                    onClick={() => {
                                      onNavigate();
                                      onSelectProject?.(proj.localId);
                                    }}
                                    aria-current={
                                      isActiveProject ? 'page' : undefined
                                    }
                                    className={`flex w-full items-center gap-2 rounded-btn px-3 py-2.5 text-left text-sm transition-colors ${
                                      isActiveProject
                                        ? 'bg-primary-soft text-primary font-medium'
                                        : 'text-text hover:bg-surface'
                                    }`}
                                  >
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
                                      className={`shrink-0 ${
                                        isActiveProject
                                          ? 'text-primary'
                                          : 'text-text-muted'
                                      }`}
                                    >
                                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                    </svg>
                                    <span className="truncate">
                                      {proj.name}
                                    </span>
                                  </button>
                                );
                              })
                            ) : (
                              <p className="px-3 py-2 text-xs text-text-muted">
                                {intl.formatMessage(
                                  messages.noProjectsInArchive,
                                )}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
                  <p className="text-sm font-medium text-text">
                    {intl.formatMessage(messages.noServersTitle)}
                  </p>
                  <p className="max-w-[240px] text-xs text-text-muted">
                    {intl.formatMessage(messages.noServersDesc)}
                  </p>
                  {onAddServer && (
                    <Button
                      onClick={() => {
                        onNavigate();
                        onAddServer();
                      }}
                    >
                      {intl.formatMessage(messages.addServer)}
                    </Button>
                  )}
                </div>
              )}
            </div>

            {hasLocalProjects && (
              <>
                <div className="mx-4 my-1 border-t border-border" />
                <div className="px-2 pt-1 pb-1">
                  <h3 className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
                    {intl.formatMessage(messages.localProjects)}
                  </h3>
                  <div className="flex flex-col gap-0.5">
                    {localProjects.map((proj) => {
                      const isActiveProject = activeProjectId === proj.localId;
                      return (
                        <button
                          key={proj.localId}
                          type="button"
                          onClick={() => {
                            onNavigate();
                            onSelectProject?.(proj.localId);
                          }}
                          aria-current={isActiveProject ? 'page' : undefined}
                          className={`flex w-full items-center gap-2 rounded-btn px-3 py-2 text-left text-sm transition-colors ${
                            isActiveProject
                              ? 'bg-primary-soft text-primary font-medium'
                              : 'text-text hover:bg-surface'
                          }`}
                        >
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
                            className={`shrink-0 ${
                              isActiveProject
                                ? 'text-primary'
                                : 'text-text-muted'
                            }`}
                          >
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                          </svg>
                          <span className="truncate">{proj.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {hasArchives && onCreateProject && (
              <div className="px-2 pt-3 pb-2">
                <button
                  type="button"
                  onClick={() => {
                    onNavigate();
                    onCreateProject();
                  }}
                  className="flex w-full items-center gap-2 rounded-btn px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-surface hover:text-primary-hover"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  {intl.formatMessage(messages.createProject)}
                </button>
              </div>
            )}

            <div className="h-4" />
          </div>

          <div className="border-t border-border px-4 py-3">
            <h3 className="pb-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
              {intl.formatMessage(messages.language)}
            </h3>
            <div className="flex gap-1">
              {SUPPORTED_LOCALES.map((loc) => {
                const isActive = loc === locale;
                return (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => setLocale(loc)}
                    aria-label={LOCALE_NAMES[loc]}
                    aria-pressed={isActive}
                    className={`min-h-[44px] min-w-[44px] rounded-btn text-sm font-semibold transition-colors ${
                      isActive
                        ? 'bg-primary text-white'
                        : 'text-text-muted hover:text-text hover:bg-surface'
                    }`}
                  >
                    {LOCALE_NAMES[loc]}
                  </button>
                );
              })}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>

      {/* Nested overflow sheet for archive actions */}
      <ArchiveOverflowSheet
        open={overflowArchive !== null}
        onOpenChange={(open) => {
          if (!open) setOverflowArchive(null);
        }}
        archiveName={overflowArchive?.label ?? ''}
        onViewDetails={() => {
          if (overflowArchive) {
            onNavigate();
            onArchiveSettings?.(overflowArchive.id);
          }
        }}
        onEdit={() => {
          if (overflowArchive) {
            onNavigate();
            onArchiveSettings?.(overflowArchive.id);
          }
        }}
        onSync={() => {
          // no-op for now
        }}
        onCopyUrl={() => {
          if (overflowArchive?.baseUrl) {
            try {
              void navigator.clipboard.writeText(overflowArchive.baseUrl);
            } catch {
              // Clipboard API not available
            }
          }
        }}
        onRemove={() => {
          if (overflowArchive) {
            onNavigate();
            onArchiveSettings?.(overflowArchive.id);
          }
        }}
      />
    </Dialog.Root>
  );
}

export { MobileNavDrawer };
export type { MobileNavDrawerProps, ServerEntry, ProjectEntry };
