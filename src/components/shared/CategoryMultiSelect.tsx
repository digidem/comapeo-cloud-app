import { useCallback, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

const messages = defineMessages({
  allCategories: {
    id: 'data.filters.categoryAll',
    defaultMessage: 'All categories',
  },
  categoryGroupLabel: {
    id: 'data.filters.categoryGroupLabel',
    defaultMessage: 'Filter by category',
  },
  categoryHiddenSelected: {
    id: 'data.filters.categoryHiddenSelected',
    defaultMessage: '{count} selected',
  },
  showMore: {
    id: 'data.filters.categoryShowMore',
    defaultMessage: '+{count} more',
  },
  showLess: {
    id: 'data.filters.categoryShowLess',
    defaultMessage: 'Show less',
  },
});

export interface CategoryMultiSelectProps {
  categories: string[];
  selected: string[];
  onToggle: (category: string) => void;
  onClear: () => void;
}

const MAX_VISIBLE = 8;

export function CategoryMultiSelect({
  categories,
  selected,
  onToggle,
  onClear,
}: CategoryMultiSelectProps) {
  const intl = useIntl();
  const [expanded, setExpanded] = useState(false);

  const visibleCategories = expanded
    ? categories
    : categories.slice(0, MAX_VISIBLE);
  const remainingCount = categories.length - MAX_VISIBLE;
  const hiddenSelected = !expanded
    ? selected.filter((c) => !visibleCategories.includes(c)).length
    : 0;

  const handleToggle = useCallback(
    (category: string) => {
      onToggle(category);
    },
    [onToggle],
  );

  if (categories.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={intl.formatMessage(messages.categoryGroupLabel)}
      >
        {/* "All" / clear button */}
        <button
          type="button"
          onClick={onClear}
          className={`inline-flex min-h-[44px] items-center rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            selected.length === 0
              ? 'bg-primary/15 text-primary border-primary/30 border'
              : 'bg-surface text-text-muted border-border border'
          }`}
          style={{ touchAction: 'manipulation' }}
          aria-pressed={selected.length === 0}
        >
          {intl.formatMessage(messages.allCategories)}
        </button>

        {/* Category chips */}
        {visibleCategories.map((category) => {
          const isSelected = selected.includes(category);
          return (
            <button
              key={category}
              type="button"
              onClick={() => handleToggle(category)}
              className={`inline-flex min-h-[44px] items-center rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                isSelected
                  ? 'bg-primary/15 text-primary border-primary/30 border'
                  : 'bg-surface text-text-muted border-border border'
              }`}
              style={{ touchAction: 'manipulation' }}
              aria-pressed={isSelected}
            >
              {category}
            </button>
          );
        })}
      </div>

      {/* "+N more" expansion and hidden selected indicator */}
      {remainingCount > 0 && !expanded && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="self-start text-sm text-primary hover:underline min-h-[44px] inline-flex items-center"
            style={{ touchAction: 'manipulation' }}
            aria-expanded={false}
          >
            {intl.formatMessage(messages.showMore, { count: remainingCount })}
          </button>
          {hiddenSelected > 0 && (
            <span className="text-sm text-text-muted">
              {intl.formatMessage(messages.categoryHiddenSelected, {
                count: hiddenSelected,
              })}
            </span>
          )}
        </div>
      )}

      {expanded && categories.length > MAX_VISIBLE && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="self-start text-sm text-primary hover:underline min-h-[44px] inline-flex items-center"
          style={{ touchAction: 'manipulation' }}
          aria-expanded={true}
        >
          {intl.formatMessage(messages.showLess)}
        </button>
      )}
    </div>
  );
}
