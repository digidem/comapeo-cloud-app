import type { Category } from '@/hooks/useCategories';

interface CategoryCardProps {
  docId: string;
  label: string;
  fieldRefs: Array<{ docId: string; label?: string }>;
  color?: string;
  iconRef?: { docId: string };
}

function CategoryCard({
  label,
  fieldRefs,
  color,
}: CategoryCardProps) {
  const fieldCount = fieldRefs.length;
  const initial = label.charAt(0).toUpperCase();

  return (
    <article
      data-testid="category-card"
      tabIndex={0}
      className="group relative overflow-hidden rounded-card outline-none focus-visible:ring-2 focus-visible:ring-primary"
      style={{
        backgroundColor: 'var(--color-surface-card, #fff)',
        boxShadow: '0 8px 24px rgba(9,30,66,0.08)',
      }}
    >
      {color && (
        <div
          data-testid="color-accent"
          className="absolute top-0 left-0 h-full w-1"
          style={{ backgroundColor: color }}
        />
      )}

      <div className="flex items-start gap-3 p-4">
        <div
          data-testid="category-icon"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: color ?? '#1F6FFF' }}
        >
          {initial}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-text">
            {label}
          </h3>
          <span className="mt-1 inline-flex items-center rounded-full bg-bg px-2 py-0.5 text-xs font-medium text-text-muted">
            {fieldCount === 1 ? '1 field' : `${fieldCount} fields`}
          </span>
        </div>
      </div>
    </article>
  );
}

export { CategoryCard };
export type { CategoryCardProps };
