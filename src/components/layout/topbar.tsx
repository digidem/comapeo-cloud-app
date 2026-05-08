import type { ReactNode } from 'react';

interface TopbarProps {
  title: string;
  workspaceName?: string;
  modeLabel?: string;
  children?: ReactNode;
}

function Topbar({ title, workspaceName, modeLabel, children }: TopbarProps) {
  return (
    <header
      role="banner"
      className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between bg-[#04145C] px-4"
    >
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-white">{title}</h1>
        {workspaceName && (
          <span className="bg-white text-[#04145C] rounded-full px-3 py-0.5 text-sm font-medium">
            {workspaceName}
          </span>
        )}
        {modeLabel && (
          <span className="bg-white/20 text-white rounded-full px-3 py-0.5 text-xs font-medium">
            {modeLabel}
          </span>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </header>
  );
}

export { Topbar };
export type { TopbarProps };
