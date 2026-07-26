import { CategoryIcon } from '@/screens/CategoriesEditor/CategoryIcon';

interface CategoryCardProps {
  docId: string;
  label: string;
  color?: string;
  iconRef?: { docId: string };
  selected?: boolean;
  onClick?: (docId: string) => void;
  projectRemoteId?: string | null;
  serverBaseUrl?: string | null;
}

function CategoryCard({
  docId,
  label,
  color,
  iconRef,
  selected,
  onClick,
  projectRemoteId,
  serverBaseUrl,
}: CategoryCardProps) {
  return (
    <button
      type="button"
      data-testid="category-card"
      aria-pressed={selected}
      onClick={() => onClick?.(docId)}
      className={`flex h-full min-h-[120px] w-full flex-col items-center justify-center gap-2 rounded-card p-3 text-center outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-all ${
        selected ? 'ring-2 ring-primary' : 'hover:bg-surface-card'
      }`}
    >
      <CategoryIcon
        projectRemoteId={projectRemoteId ?? null}
        iconRef={iconRef}
        label={label}
        color={color}
        size={50}
        iconSize={35}
        serverBaseUrl={serverBaseUrl}
      />
      <span
        className="text-sm font-semibold text-text line-clamp-3"
        style={{
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {label}
      </span>
    </button>
  );
}

export { CategoryCard };
export type { CategoryCardProps };
