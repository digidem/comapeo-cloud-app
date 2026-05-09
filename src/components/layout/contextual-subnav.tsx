import type { ReactNode } from 'react';

interface ContextualSubnavProps {
  title: string;
  children?: ReactNode;
}

function ContextualSubnav({ title, children }: ContextualSubnavProps) {
  return (
    <aside
      role="complementary"
      aria-label={title}
      className="hidden w-[268px] shrink-0 flex-col border-r border-border bg-white md:flex"
    >
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-text">{title}</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4">{children}</div>
    </aside>
  );
}

export { ContextualSubnav };
export type { ContextualSubnavProps };
