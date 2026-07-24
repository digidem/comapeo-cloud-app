import { defineMessages, useIntl } from 'react-intl';

import { CategoryIcon } from '@/screens/CategoriesEditor/CategoryIcon';

const messages = defineMessages({
  fieldCount: {
    id: 'categories.fieldCount',
    defaultMessage: '{count, plural, one {# field} other {# fields}}',
  },
});

interface CategoryCardProps {
  docId: string;
  label: string;
  fieldRefs: Array<{ docId: string; label?: string }>;
  color?: string;
  iconRef?: { docId: string };
  selected?: boolean;
  onClick?: (docId: string) => void;
  projectRemoteId?: string | null;
}

function CategoryCard({
  docId,
  label,
  fieldRefs,
  color,
  iconRef,
  selected,
  onClick,
  projectRemoteId,
}: CategoryCardProps) {
  const intl = useIntl();
  const fieldCount = fieldRefs.length;

  return (
    <article
      data-testid="category-card"
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      onClick={() => onClick?.(docId)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(docId);
        }
      }}
      className={`group relative overflow-hidden rounded-card outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
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
        <CategoryIcon
          projectRemoteId={projectRemoteId ?? null}
          iconRef={iconRef}
          label={label}
          color={color}
          size={40}
        />

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-text">{label}</h3>
          <span className="mt-1 inline-flex items-center rounded-full bg-bg px-2 py-0.5 text-xs font-medium text-text-muted">
            {intl.formatMessage(messages.fieldCount, { count: fieldCount })}
          </span>
        </div>
      </div>
    </article>
  );
}

export { CategoryCard };
export type { CategoryCardProps };
