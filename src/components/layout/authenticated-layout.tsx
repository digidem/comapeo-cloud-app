import type { ReactNode } from 'react';

import { Outlet, useRouterState } from '@tanstack/react-router';

import { AppShell } from '@/components/layout/app-shell';
import {
  ShellSlotProvider,
  useShellOverrides,
} from '@/components/layout/shell-slot';

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

const NAV_ITEMS = [
  { path: '/', label: 'Home', icon: <HomeIcon /> },
  { path: '/settings', label: 'Settings', icon: <SettingsIcon /> },
];

function AuthenticatedLayoutInner() {
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });
  const {
    topbarWorkspaceName,
    topbarModeLabel,
    topbarActions,
    secondaryContent,
  } = useShellOverrides();

  return (
    <AppShell
      topbarTitle="CoMapeo Cloud"
      topbarWorkspaceName={topbarWorkspaceName}
      topbarModeLabel={topbarModeLabel}
      topbarActions={topbarActions}
      navItems={NAV_ITEMS}
      activeNavPath={pathname}
      secondaryContent={secondaryContent}
    >
      <Outlet />
    </AppShell>
  );
}

export function AuthenticatedLayout() {
  return (
    <ShellSlotProvider>
      <AuthenticatedLayoutInner />
    </ShellSlotProvider>
  );
}
