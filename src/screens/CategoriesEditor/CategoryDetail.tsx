import { defineMessages, useIntl } from 'react-intl';
import { Link } from '@tanstack/react-router';

import type { Category } from '@/hooks/useCategories';

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
}

function CategoryDetail({ category, fieldLabels }: CategoryDetailProps) {
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

  const initial = category.label.charAt(0).toUpperCase();

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/categories"
        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary-dark min-h-[44px]"
      >
        {intl.formatMessage(messages.backToCategories)}
      </Link>

      <div
        data-testid="category-detail-icon"
        className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white"
        style={{ backgroundColor: category.color ?? '#1F6FFF' }}
      >
        {initial}
      </div>

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
