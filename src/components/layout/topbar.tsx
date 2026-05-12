import type { ReactNode } from 'react';

interface TopbarProps {
  title: string;
  workspaceName?: string;
  modeLabel?: string;
  onMenuClick?: () => void;
  children?: ReactNode;
}

function Topbar({
  title,
  workspaceName,
  modeLabel,
  onMenuClick,
  children,
}: TopbarProps) {
  return (
    <header
      role="banner"
      className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-b border-border bg-white px-4"
    >
      <div className="flex items-center gap-3">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex h-11 w-11 items-center justify-center rounded-btn text-text-muted hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white lg:hidden"
            aria-label="Open menu"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M3 6h18M3 12h18M3 18h18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
        <h1 className="truncate max-w-[140px] text-lg font-semibold text-text sm:max-w-[200px] lg:max-w-none">
          {title}
        </h1>
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
