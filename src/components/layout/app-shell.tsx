import type { ReactNode } from 'react';

import { ContextualSubnav } from '@/components/layout/contextual-subnav';
import { PrimaryNav } from '@/components/layout/primary-nav';
import { Topbar } from '@/components/layout/topbar';

interface AppShellProps {
  topbarTitle: string;
  topbarActions?: ReactNode;
  navItems: Array<{ path: string; label: string; icon?: string }>;
  activeNavPath: string;
  subnavTitle?: string;
  subnavContent?: ReactNode;
  children: ReactNode;
}

function AppShell({
  topbarTitle,
  topbarActions,
  navItems,
  activeNavPath,
  subnavTitle,
  subnavContent,
  children,
}: AppShellProps) {
  return (
    <div className="flex h-screen flex-col">
      <Topbar title={topbarTitle}>{topbarActions}</Topbar>
      <div className="flex flex-1 pt-14">
        <PrimaryNav items={navItems} activePath={activeNavPath} />
        {subnavTitle && subnavContent !== undefined && (
          <ContextualSubnav title={subnavTitle}>
            {subnavContent}
          </ContextualSubnav>
        )}
        <main className="flex-1 overflow-y-auto bg-[#F4F6FA] p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export { AppShell };
export type { AppShellProps };
