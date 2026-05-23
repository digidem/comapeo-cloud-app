import { defineMessages, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type {
  ObservationFilters,
  ObservationSort,
} from '@/lib/observation-filters';

const messages = defineMessages({
  searchLabel: {
    id: 'data.filters.searchLabel',
    defaultMessage: 'Search',
  },
  searchPlaceholder: {
    id: 'data.filters.searchPlaceholder',
    defaultMessage: 'Search by category or notes',
  },
  startDateLabel: {
    id: 'data.filters.startDateLabel',
    defaultMessage: 'From',
  },
  endDateLabel: {
    id: 'data.filters.endDateLabel',
    defaultMessage: 'To',
  },
  categoryLabel: {
    id: 'data.filters.categoryLabel',
    defaultMessage: 'Category',
  },
  categoryAll: {
    id: 'data.filters.categoryAll',
    defaultMessage: 'All categories',
  },
  sortLabel: {
    id: 'data.filters.sortLabel',
    defaultMessage: 'Sort',
  },
  sortNewest: {
    id: 'data.filters.sortNewest',
    defaultMessage: 'Newest first',
  },
  sortOldest: {
    id: 'data.filters.sortOldest',
    defaultMessage: 'Oldest first',
  },
  sortCategory: {
    id: 'data.filters.sortCategory',
    defaultMessage: 'Category (A\u2013Z)',
  },
  clear: {
    id: 'data.filters.clear',
    defaultMessage: 'Clear filters',
  },
  resultCount: {
    id: 'data.filters.resultCount',
    defaultMessage: '{count, plural, one {# result} other {# results}}',
  },
});

export interface ObservationFilterBarProps {
  filters: ObservationFilters;
  availableCategories: string[];
  resultCount: number;
  isFiltering: boolean;
  onSearchChange: (v: string) => void;
  onStartDateChange: (v: string | null) => void;
  onEndDateChange: (v: string | null) => void;
  onCategoryChange: (v: string | null) => void;
  onSortChange: (v: ObservationSort) => void;
  onClear: () => void;
}

const ALL_CATEGORIES_SENTINEL = '__all__';

export function ObservationFilterBar({
  filters,
  availableCategories,
  resultCount,
  isFiltering,
  onSearchChange,
  onStartDateChange,
  onEndDateChange,
  onCategoryChange,
  onSortChange,
  onClear,
}: ObservationFilterBarProps) {
  const intl = useIntl();

  const categoryValue = filters.category ?? ALL_CATEGORIES_SENTINEL;

  function handleCategoryChange(value: string) {
    onCategoryChange(value === ALL_CATEGORIES_SENTINEL ? null : value);
  }

  function handleSortChange(v: string) {
    if (v === 'newest' || v === 'oldest' || v === 'category') {
      onSortChange(v);
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="flex-1 min-w-[180px]">
        <Input
          label={intl.formatMessage(messages.searchLabel)}
          placeholder={intl.formatMessage(messages.searchPlaceholder)}
          value={filters.search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div className="min-w-[140px]">
        <Input
          label={intl.formatMessage(messages.startDateLabel)}
          type="date"
          value={filters.startDate ?? ''}
          onChange={(e) =>
            onStartDateChange(e.target.value === '' ? null : e.target.value)
          }
        />
      </div>

      <div className="min-w-[140px]">
        <Input
          label={intl.formatMessage(messages.endDateLabel)}
          type="date"
          value={filters.endDate ?? ''}
          onChange={(e) =>
            onEndDateChange(e.target.value === '' ? null : e.target.value)
          }
        />
      </div>

      <div className="min-w-[160px]">
        <Select
          value={categoryValue}
          onValueChange={handleCategoryChange}
          placeholder={intl.formatMessage(messages.categoryAll)}
          ariaLabel={intl.formatMessage(messages.categoryLabel)}
        >
          <Select.Item value={ALL_CATEGORIES_SENTINEL}>
            {intl.formatMessage(messages.categoryAll)}
          </Select.Item>
          {availableCategories.map((cat) => (
            <Select.Item key={cat} value={cat}>
              {cat}
            </Select.Item>
          ))}
        </Select>
      </div>

      <div className="min-w-[160px]">
        <Select
          value={filters.sort}
          onValueChange={handleSortChange}
          placeholder={intl.formatMessage(messages.sortLabel)}
          ariaLabel={intl.formatMessage(messages.sortLabel)}
        >
          <Select.Item value="newest">
            {intl.formatMessage(messages.sortNewest)}
          </Select.Item>
          <Select.Item value="oldest">
            {intl.formatMessage(messages.sortOldest)}
          </Select.Item>
          <Select.Item value="category">
            {intl.formatMessage(messages.sortCategory)}
          </Select.Item>
        </Select>
      </div>

      {isFiltering && (
        <div className="flex items-end">
          <Button variant="ghost" size="sm" onClick={onClear}>
            {intl.formatMessage(messages.clear)}
          </Button>
        </div>
      )}

      <div className="flex items-end min-w-[80px]">
        <span className="text-text-muted text-sm pb-2">
          {intl.formatMessage(messages.resultCount, { count: resultCount })}
        </span>
      </div>
    </div>
  );
}
