import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { ContextualSubnav } from '@/components/layout/contextual-subnav';
import { MobileNavDrawer } from '@/components/layout/mobile-nav-drawer';
import { PrimaryNav } from '@/components/layout/primary-nav';
import { Topbar } from '@/components/layout/topbar';
import { MapDownloadStatus } from '@/screens/MapScreen/MapDownloadStatus';

interface AppShellProps {
  topbarActions?: ReactNode;
  /**
   * Layout-owned actions rendered beside `topbarActions` (route overrides).
   * Kept separate so a route cannot displace the global sync control.
   */
  topbarPersistentActions?: ReactNode;
  topbarWorkspaceName?: string;
  topbarModeLabel?: string;
  navItems: Array<{ path: string; label: string; icon: ReactNode }>;
  activeNavPath: string;
  subnavTitle?: string;
  subnavContent?: ReactNode;
  secondaryContent?: ReactNode;
  /** Archive servers for mobile drawer */
  drawerArchives?: Array<{ id: string; label: string; baseUrl?: string }>;
  /** Projects grouped by archive server ID */
  drawerArchiveProjects?: Record<
    string,
    Array<{ localId: string; name: string }>
  >;
  /** Local projects (not tied to any archive) */
  drawerLocalProjects?: Array<{ localId: string; name: string }>;
  /** Active archive server ID */
  activeArchiveId?: string;
  /** Active project ID */
  activeProjectId?: string;
  /** Opens AddArchiveServerDialog (available from any route) */
  onDrawerAddServer?: () => void;
  /** Opens CreateProjectDialog (available from any route) */
  onDrawerCreateProject?: () => void;
  /** Select an archive server (navigates to home) */
  onDrawerSelectServer?: (id: string) => void;
  /** Select a project (navigates to home) */
  onDrawerSelectProject?: (id: string) => void;
  /** Open archive settings dialog */
  onDrawerArchiveSettings?: (id: string) => void;
  /** Manually sync an archive server from the drawer's overflow sheet */
  onDrawerSyncServer?: (id: string) => void;
  children: ReactNode;
}

function AppShell({
  topbarActions,
  topbarPersistentActions,
  topbarWorkspaceName,
  topbarModeLabel,
  navItems,
  activeNavPath,
  subnavTitle,
  subnavContent,
  secondaryContent,
  drawerArchives,
  drawerArchiveProjects,
  drawerLocalProjects,
  activeArchiveId,
  activeProjectId,
  onDrawerAddServer,
  onDrawerCreateProject,
  onDrawerSelectServer,
  onDrawerSelectProject,
  onDrawerArchiveSettings,
  onDrawerSyncServer,
  children,
}: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isMapRoute = activeNavPath === '/map';

  // Drawer navigation already closes through `onNavigate`. Browser history
  // navigation does not invoke that callback, so close explicitly on popstate,
  // including intra-section back/forward such as /cases ↔ /cases/:id.
  useEffect(() => {
    const closeOnHistoryNavigation = () => setMobileMenuOpen(false);
    window.addEventListener('popstate', closeOnHistoryNavigation);
    return () =>
      window.removeEventListener('popstate', closeOnHistoryNavigation);
  }, []);

  return (
    <div className="flex h-dvh flex-col">
      <Topbar
        workspaceName={topbarWorkspaceName}
        modeLabel={topbarModeLabel}
        onMenuClick={() => setMobileMenuOpen((prev) => !prev)}
        isMenuOpen={mobileMenuOpen}
      >
        {/* Single guarded expression: Topbar renders a divider only when it
            receives children, so this must stay undefined when both slots
            are empty rather than an empty fragment. */}
        {(topbarActions ?? topbarPersistentActions) ? (
          <>
            {topbarActions}
            {topbarPersistentActions}
          </>
        ) : undefined}
      </Topbar>
      <div className="flex min-h-0 flex-1 pt-14">
        <PrimaryNav items={navItems} activePath={activeNavPath} />
        {secondaryContent !== undefined && (
          <aside className="hidden w-[268px] flex-col border-r border-border bg-surface-card lg:flex">
            {secondaryContent}
          </aside>
        )}
        {subnavTitle && subnavContent !== undefined && (
          <ContextualSubnav title={subnavTitle}>
            {subnavContent}
          </ContextualSubnav>
        )}
        <main
          className={`min-w-0 flex-1 bg-surface p-3 sm:p-4 lg:p-6 ${isMapRoute ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}
        >
          {children}
        </main>
      </div>
      {!isMapRoute && <MapDownloadStatus />}
      <MobileNavDrawer
        open={mobileMenuOpen}
        onOpenChange={setMobileMenuOpen}
        navItems={navItems}
        activePath={activeNavPath}
        archives={drawerArchives}
        archiveProjects={drawerArchiveProjects}
        localProjects={drawerLocalProjects}
        activeArchiveId={activeArchiveId}
        activeProjectId={activeProjectId}
        onAddServer={onDrawerAddServer}
        onCreateProject={onDrawerCreateProject}
        onSelectServer={onDrawerSelectServer}
        onSelectProject={onDrawerSelectProject}
        onArchiveSettings={onDrawerArchiveSettings}
        onSyncServer={onDrawerSyncServer}
        onNavigate={() => setMobileMenuOpen(false)}
      />
    </div>
  );
}

export { AppShell };
export type { AppShellProps };
