import type { ReactNode } from 'react';

import { Link } from '@tanstack/react-router';

interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
}

interface PrimaryNavProps {
  items: NavItem[];
  activePath: string;
}

function PrimaryNav({ items, activePath }: PrimaryNavProps) {
  return (
    <nav
      role="navigation"
      aria-label="Primary navigation"
      className="hidden w-[76px] flex-col items-center border-r border-white/10 bg-primary-navy pt-4 lg:flex"
    >
      {items.map((item) => {
        const isActive = activePath === item.path;
        return (
          <Link
            key={item.path}
            to={item.path}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
            className={`flex w-[54px] h-[54px] items-center justify-center rounded-xl focus-visible:ring-2 focus-visible:ring-white/40 ${
              isActive
                ? 'bg-white/15 text-white'
                : 'text-white/60 hover:text-white hover:bg-white/8'
            }`}
          >
            {item.icon}
          </Link>
        );
      })}
    </nav>
  );
}

export { PrimaryNav };
export type { PrimaryNavProps, NavItem };
