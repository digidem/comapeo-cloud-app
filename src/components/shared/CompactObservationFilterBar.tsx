import { defineMessages, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { CloseIcon } from '@/components/ui/close-icon';
import type { ObservationFilters } from '@/lib/observation-filters';

const messages = defineMessages({
  filterButton: {
    // Reused ID — keep the defaultMessage byte-identical to DataScreen's
    // `data.filterButton` so message extraction stays deduplicated.
    id: 'data.filterButton',
    defaultMessage: 'Filters',
  },
  resultCount: {
    // Reused ID — keep the defaultMessage byte-identical to ObservationFilterBar.
    id: 'data.filters.resultCount',
    defaultMessage: '{count, plural, one {# result} other {# results}}',
  },
  activeFilterCount: {
    id: 'data.filters.activeFilterCount',
    defaultMessage:
      '{count, plural, one {# active filter} other {# active filters}}',
  },
  removeFilter: {
    id: 'data.filters.removeFilter',
    defaultMessage: 'Remove filter: {label}',
  },
  searchChip: {
    id: 'data.filters.searchChip',
    defaultMessage: 'Search: {value}',
  },
  fromDateChip: {
    id: 'data.filters.fromDateChip',
    defaultMessage: 'From: {date}',
  },
  toDateChip: {
    id: 'data.filters.toDateChip',
    defaultMessage: 'To: {date}',
  },
  categoryChip: {
    id: 'data.filters.categoryChip',
    defaultMessage: 'Category: {name}',
  },
  chipRow: {
    id: 'data.filters.chipRow',
    defaultMessage: 'Active filters',
  },
});

export interface CompactObservationFilterBarProps {
  className?: string;
  filters: ObservationFilters;
  resultCount: number;
  isFiltering: boolean;
  /** Active filter dimension count (0-4) for the Filters button badge. */
  activeFilterCount: number;
  onOpenFilters: () => void;
  onSearchClear: () => void;
  onStartDateClear: () => void;
  onEndDateClear: () => void;
  /** Remove a single selected category by name. */
  onCategoryRemove: (category: string) => void;
}

interface FilterChipProps {
  label: string;
  onRemove: () => void;
}

function FilterChip({ label, onRemove }: FilterChipProps) {
  const intl = useIntl();

  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-pill border border-border/15 bg-surface py-0 pr-0 pl-2.5 text-xs font-medium text-text">
      {label}
      <button
        type="button"
        aria-label={intl.formatMessage(messages.removeFilter, { label })}
        onClick={onRemove}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-text-muted hover:bg-surface-hover hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
        style={{ touchAction: 'manipulation' }}
      >
        <CloseIcon size={14} />
      </button>
    </span>
  );
}

/**
 * Compact single-line filter summary for the desktop map view: a Filters
 * button (with an active-filter-dimension badge), one dismissible chip per
 * active filter, and the result count. Presentational only — the parent owns
 * the filter state and the FilterSheet that the button opens.
 */
export function CompactObservationFilterBar({
  className,
  filters,
  resultCount,
  isFiltering,
  activeFilterCount,
  onOpenFilters,
  onSearchClear,
  onStartDateClear,
  onEndDateClear,
  onCategoryRemove,
}: CompactObservationFilterBarProps) {
  const intl = useIntl();

  const showBadge = isFiltering && activeFilterCount > 0;

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <Button
        variant="secondary"
        size="sm"
        onClick={onOpenFilters}
        className="shrink-0 shadow-card"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="mr-1.5"
        >
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        {intl.formatMessage(messages.filterButton)}
        {showBadge && (
          <span
            role="img"
            aria-label={intl.formatMessage(messages.activeFilterCount, {
              count: activeFilterCount,
            })}
            className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white"
          >
            {activeFilterCount}
          </span>
        )}
      </Button>

      {isFiltering && (
        // min-w-0 lets this flex child shrink so horizontal scroll happens
        // here instead of pushing the pinned result count out of view.
        <div
          role="group"
          aria-label={intl.formatMessage(messages.chipRow)}
          tabIndex={0}
          className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto"
        >
          {filters.search !== '' && (
            <FilterChip
              label={intl.formatMessage(messages.searchChip, {
                value: filters.search,
              })}
              onRemove={onSearchClear}
            />
          )}
          {filters.startDate !== null && (
            <FilterChip
              label={intl.formatMessage(messages.fromDateChip, {
                date: filters.startDate,
              })}
              onRemove={onStartDateClear}
            />
          )}
          {filters.endDate !== null && (
            <FilterChip
              label={intl.formatMessage(messages.toDateChip, {
                date: filters.endDate,
              })}
              onRemove={onEndDateClear}
            />
          )}
          {filters.categories.map((category) => (
            <FilterChip
              key={category}
              label={intl.formatMessage(messages.categoryChip, {
                name: category,
              })}
              onRemove={() => onCategoryRemove(category)}
            />
          ))}
        </div>
      )}

      <span className="ml-auto shrink-0 text-sm whitespace-nowrap text-text-muted">
        {intl.formatMessage(messages.resultCount, { count: resultCount })}
      </span>
    </div>
  );
}
