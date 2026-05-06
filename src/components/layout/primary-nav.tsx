interface NavItem {
  path: string;
  label: string;
  icon?: string;
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
      className="hidden w-[76px] flex-col items-center border-r border-[#D9DEE8] bg-white pt-4 lg:flex"
    >
      {items.map((item) => {
        const isActive = activePath === item.path;
        return (
          <a
            key={item.path}
            href={item.path}
            className={`flex w-full flex-col items-center py-3 text-xs ${
              isActive
                ? 'font-semibold text-primary'
                : 'text-[#172033] hover:text-primary'
            }`}
            aria-current={isActive ? 'page' : undefined}
          >
            {item.icon && (
              <span className="mb-1 text-lg" aria-hidden="true">
                {item.icon}
              </span>
            )}
            <span>{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

export { PrimaryNav };
export type { PrimaryNavProps, NavItem };
