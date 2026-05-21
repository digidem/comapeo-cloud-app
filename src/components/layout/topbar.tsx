import type { ReactNode } from 'react';

import { LanguageSelector } from '@/components/layout/language-selector';

interface TopbarProps {
  workspaceName?: string;
  modeLabel?: string;
  onMenuClick?: () => void;
  isMenuOpen?: boolean;
  children?: ReactNode;
}

function Topbar({
  workspaceName,
  modeLabel,
  onMenuClick,
  isMenuOpen,
  children,
}: TopbarProps) {
  return (
    <header
      role="banner"
      className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-b border-border bg-surface-card px-4"
    >
      <div className="flex items-center gap-3">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex h-11 w-11 items-center justify-center rounded-btn text-text-muted motion-safe:transition-transform motion-safe:duration-300 hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-75 lg:hidden"
            aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isMenuOpen ? 'true' : 'false'}
          >
            <span className="sr-only">
              {isMenuOpen ? 'Close menu' : 'Open menu'}
            </span>
            <span
              aria-hidden="true"
              className="flex h-5 w-6 flex-col items-center justify-center gap-[5px]"
            >
              <span
                className={`block h-[2px] w-full rounded-full bg-current motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isMenuOpen ? 'translate-y-[7px] rotate-45' : ''}`}
              />
              <span
                className={`block h-[2px] w-full rounded-full bg-current motion-safe:transition-opacity motion-safe:duration-[250ms] ${isMenuOpen ? 'opacity-0' : ''}`}
              />
              <span
                className={`block h-[2px] w-full rounded-full bg-current motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isMenuOpen ? '-translate-y-[7px] -rotate-45' : ''}`}
              />
            </span>
          </button>
        )}
        <span className="font-semibold" aria-label="CoMapeo Cloud">
          <span className="text-warning">Co</span>
          <span className="text-text">Mapeo Cloud</span>
        </span>
        {workspaceName && (
          <span className="hidden bg-primary-soft text-primary rounded-full px-3 py-0.5 text-sm font-medium sm:inline-flex">
            {workspaceName}
          </span>
        )}
        {modeLabel && (
          <span className="hidden bg-surface-container-low text-text-muted rounded-full px-3 py-0.5 text-xs font-medium md:inline-flex">
            {modeLabel}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <LanguageSelector />
        {children && (
          <>
            <div className="h-4 w-px bg-border" />
            {children}
          </>
        )}
      </div>
    </header>
  );
}

export { Topbar };
export type { TopbarProps };
