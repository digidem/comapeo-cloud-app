import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import { ContextualSubnav } from '@/components/layout/contextual-subnav';
import { MobileNavDrawer } from '@/components/layout/mobile-nav-drawer';
import { PrimaryNav } from '@/components/layout/primary-nav';
import { Topbar } from '@/components/layout/topbar';

interface AppShellProps {
  topbarActions?: ReactNode;
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
  children: ReactNode;
}

function AppShell({
  topbarActions,
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
  children,
}: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const prevNavPathRef = useRef(activeNavPath);
  const isMapRoute = activeNavPath === '/map';

  // Close drawer on route change (handles browser back/forward)
  useEffect(() => {
    if (prevNavPathRef.current !== activeNavPath) {
      setMobileMenuOpen(false);
      prevNavPathRef.current = activeNavPath;
    }
  }, [activeNavPath]);

  return (
    <div className="flex h-screen flex-col">
      <Topbar
        workspaceName={topbarWorkspaceName}
        modeLabel={topbarModeLabel}
        onMenuClick={() => setMobileMenuOpen((prev) => !prev)}
        isMenuOpen={mobileMenuOpen}
      >
        {topbarActions}
      </Topbar>
      <div className={`flex min-h-0 flex-1 ${isMapRoute ? '' : 'pt-14'}`}>
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
          className={`min-w-0 flex-1 bg-surface p-3 sm:p-4 lg:p-6 ${isMapRoute ? 'overflow-hidden' : 'overflow-y-auto'}`}
        >
          {children}
        </main>
      </div>
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
        onNavigate={() => setMobileMenuOpen(false)}
      />
    </div>
  );
}

export { AppShell };
export type { AppShellProps };
