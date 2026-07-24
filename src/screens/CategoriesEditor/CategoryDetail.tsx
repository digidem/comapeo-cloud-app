import { defineMessages, useIntl } from 'react-intl';

import type { Category } from '@/hooks/useCategories';
import { CategoryIcon } from '@/screens/CategoriesEditor/CategoryIcon';

const messages = defineMessages({
  selectCategory: {
    id: 'categories.detail.selectCategory',
    defaultMessage: 'Select a category',
  },
  backToCategories: {
    id: 'categories.detail.backToCategories',
    defaultMessage: '← Categories',
  },
  fields: {
    id: 'categories.detail.fields',
    defaultMessage: '{count, plural, one {# field} other {# fields}}',
  },
});

interface CategoryDetailProps {
  category: Category | null;
  fieldLabels: Map<string, string>;
  onBack: () => void;
  projectRemoteId?: string | null;
}

function CategoryDetail({
  category,
  fieldLabels,
  onBack,
  projectRemoteId,
}: CategoryDetailProps) {
  const intl = useIntl();

  if (!category) {
    return (
      <div className="flex items-center justify-center p-8">
        <span className="text-text-muted text-sm">
          {intl.formatMessage(messages.selectCategory)}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary-dark min-h-[44px]"
      >
        {intl.formatMessage(messages.backToCategories)}
      </button>

      <CategoryIcon
        projectRemoteId={projectRemoteId ?? null}
        iconRef={category.iconRef}
        label={category.label}
        color={category.color}
        size={64}
      />

      <h2 className="text-xl font-bold text-text">{category.label}</h2>

      {category.color && (
        <div className="flex items-center gap-2">
          <div
            data-testid="color-swatch"
            className="h-6 w-6 rounded"
            style={{ backgroundColor: category.color }}
          />
          <span className="text-sm font-mono text-text-muted">
            {category.color}
          </span>
        </div>
      )}

      <div>
        <span className="text-sm font-medium text-text">
          {intl.formatMessage(messages.fields, {
            count: category.fieldRefs.length,
          })}
        </span>
        {category.fieldRefs.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {category.fieldRefs.map((ref) => (
              <li key={ref.docId} className="text-sm text-text-muted">
                {fieldLabels.get(ref.docId) ?? ref.docId}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export { CategoryDetail };
