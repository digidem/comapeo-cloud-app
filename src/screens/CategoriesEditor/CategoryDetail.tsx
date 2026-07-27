import { defineMessages, useIntl } from 'react-intl';

import type { Category } from '@/hooks/useCategories';
import type { NormalizedField } from '@/lib/fields/normalize';
import { CategoryIcon } from '@/screens/CategoriesEditor/CategoryIcon';
import { FieldViewer } from '@/screens/CategoriesEditor/FieldViewer';

const messages = defineMessages({
  selectCategory: {
    id: 'categories.detail.selectCategory',
    defaultMessage: 'Select a category',
  },
  backToCategories: {
    id: 'categories.detail.backToCategories',
    defaultMessage: 'Categories',
  },
  fields: {
    id: 'categories.detail.fields',
    defaultMessage: '{count, plural, one {# field} other {# fields}}',
  },
});

interface CategoryDetailProps {
  category: Category | null;
  fields: NormalizedField[]; // resolved fields in preset order
  onBack: () => void;
  projectRemoteId?: string | null;
  serverBaseUrl?: string | null;
}

function CategoryDetail({
  category,
  fields,
  onBack,
  projectRemoteId,
  serverBaseUrl,
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
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
        {intl.formatMessage(messages.backToCategories)}
      </button>

      <div className="flex flex-col items-center gap-3">
        <CategoryIcon
          projectRemoteId={projectRemoteId ?? null}
          iconRef={category.iconRef}
          label={category.label}
          color={category.color}
          size={64}
          iconSize={45}
          serverBaseUrl={serverBaseUrl}
        />

        <h2 className="text-xl font-bold text-text">{category.label}</h2>

        <span className="text-sm text-text-muted">
          {intl.formatMessage(messages.fields, { count: fields.length })}
        </span>
      </div>

      <FieldViewer fields={fields} />
    </div>
  );
}

export { CategoryDetail };
export type { CategoryDetailProps };
