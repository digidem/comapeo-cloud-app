import { defineMessages, useIntl } from 'react-intl';

import type { CategoryGroup } from '@/hooks/useCategories';
import { CategoryCard } from '@/screens/CategoriesEditor/CategoryCard';

const messages = defineMessages({
  noResults: {
    id: 'categories.noResults',
    defaultMessage: 'No categories match your search',
  },
  uncategorized: {
    id: 'categories.uncategorized',
    defaultMessage: 'Uncategorized',
  },
});

interface CategoryGridProps {
  groups: CategoryGroup[];
  selectedCategoryId?: string | null;
  onCategorySelect?: (docId: string) => void;
  projectRemoteId?: string | null;
}

function CategoryGrid({
  groups,
  selectedCategoryId,
  onCategorySelect,
  projectRemoteId,
}: CategoryGridProps) {
  const intl = useIntl();

  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <span className="text-text-muted text-sm">
          {intl.formatMessage(messages.noResults)}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.type}>
          <h2 className="mb-3 rounded-card bg-bg px-3 py-1.5 text-lg font-semibold text-text">
            {group.type || intl.formatMessage(messages.uncategorized)}
          </h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {group.categories.map((category) => (
              <CategoryCard
                key={category.docId}
                docId={category.docId}
                label={category.label}
                fieldRefs={category.fieldRefs}
                color={category.color}
                iconRef={category.iconRef}
                selected={category.docId === selectedCategoryId}
                onClick={onCategorySelect}
                projectRemoteId={projectRemoteId ?? null}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export { CategoryGrid };
export type { CategoryGridProps };
