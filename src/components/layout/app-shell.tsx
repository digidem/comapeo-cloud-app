import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import { ContextualSubnav } from '@/components/layout/contextual-subnav';
import { MobileNavDrawer } from '@/components/layout/mobile-nav-drawer';
import { PrimaryNav } from '@/components/layout/primary-nav';
import { Topbar } from '@/components/layout/topbar';

interface AppShellProps {
  topbarTitle: string;
  topbarActions?: ReactNode;
  topbarWorkspaceName?: string;
  topbarModeLabel?: string;
  navItems: Array<{ path: string; label: string; icon: ReactNode }>;
  activeNavPath: string;
  subnavTitle?: string;
  subnavContent?: ReactNode;
  secondaryContent?: ReactNode;
  children: ReactNode;
}

function AppShell({
  topbarTitle,
  topbarActions,
  topbarWorkspaceName,
  topbarModeLabel,
  navItems,
  activeNavPath,
  subnavTitle,
  subnavContent,
  secondaryContent,
  children,
}: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const prevNavPathRef = useRef(activeNavPath);

  // Close drawer on route change (handles browser back/forward)
  // Read the previous value before updating the ref, all within one effect
  useEffect(() => {
    if (prevNavPathRef.current !== activeNavPath) {
      setMobileMenuOpen(false);
      prevNavPathRef.current = activeNavPath;
    }
  }, [activeNavPath]);

  return (
    <div className="flex h-screen flex-col">
      <Topbar
        title={topbarTitle}
        workspaceName={topbarWorkspaceName}
        modeLabel={topbarModeLabel}
        onMenuClick={() => setMobileMenuOpen(true)}
      >
        {topbarActions}
      </Topbar>
      <div className="flex flex-1 pt-14">
        <PrimaryNav items={navItems} activePath={activeNavPath} />
        {secondaryContent !== undefined && (
          <aside className="hidden w-[268px] flex-col border-r border-border bg-white lg:flex">
            {secondaryContent}
          </aside>
        )}
        {subnavTitle && subnavContent !== undefined && (
          <ContextualSubnav title={subnavTitle}>
            {subnavContent}
          </ContextualSubnav>
        )}
        <main className="flex-1 overflow-y-auto bg-surface p-3 sm:p-4 lg:p-6">
          {children}
        </main>
      </div>
      <MobileNavDrawer
        open={mobileMenuOpen}
        onOpenChange={setMobileMenuOpen}
        navItems={navItems}
        activePath={activeNavPath}
        secondaryContent={secondaryContent}
        onNavigate={() => setMobileMenuOpen(false)}
      />
    </div>
  );
}

export { AppShell };
export type { AppShellProps };
