import type { ReactNode } from 'react';

interface TopbarProps {
  title: string;
  children?: ReactNode;
}

function Topbar({ title, children }: TopbarProps) {
  return (
    <header
      role="banner"
      className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-b border-[#D9DEE8] bg-white px-4"
    >
      <div className="flex items-center">
        <h1 className="text-lg font-semibold text-[#172033]">{title}</h1>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </header>
  );
}

export { Topbar };
export type { TopbarProps };
