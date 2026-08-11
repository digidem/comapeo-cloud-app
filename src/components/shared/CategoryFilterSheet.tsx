import * as Dialog from '@radix-ui/react-dialog';

import { type ReactNode, useMemo } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';

const messages = defineMessages({
  sheetTitle: {
    id: 'data.filters.categorySheetTitle',
    defaultMessage: 'Categories',
  },
  closeSheet: {
    id: 'data.filters.categorySheetClose',
    defaultMessage: 'Close categories',
  },
  selectAll: {
    id: 'data.filters.categorySelectAll',
    defaultMessage: 'Select all',
  },
  deselectAll: {
    id: 'data.filters.categoryDeselectAll',
    defaultMessage: 'Deselect all',
  },
  empty: {
    id: 'data.filters.categorySheetEmpty',
    defaultMessage: 'No categories available',
  },
  loading: {
    id: 'data.filters.categorySheetLoading',
    defaultMessage: 'Loading categories…',
  },
});

export interface CategoryFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: string[];
  categoriesLoading?: boolean;
  selected: string[];
  onToggle: (category: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  trigger?: ReactNode;
}

function CategoryFilterSheet({
  open,
  onOpenChange,
  categories,
  categoriesLoading = false,
  selected,
  onToggle,
  onSelectAll,
  onDeselectAll,
  trigger,
}: CategoryFilterSheetProps) {
  const intl = useIntl();
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const allSelected =
    categories.length > 0 &&
    categories.every((category) => selectedSet.has(category));

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : null}
      {/* Dialog.Overlay + Dialog.Content are rendered inline (without
          Dialog.Portal) so that sheet content renders in the normal React
          tree. This keeps the scrollable list within the owning component's
          container and is required for the bottom-sheet use case where the
          sheet is nested inside another Dialog.Content (FilterSheet). */}
      <Dialog.Overlay
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 50,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          animation: 'fadeIn 150ms ease-out',
        }}
      />
      <Dialog.Content
        aria-describedby={undefined}
        className="fixed bottom-0 left-0 right-0 z-[51] flex max-h-[85vh] flex-col rounded-t-card bg-surface-card shadow-elevated focus:outline-none"
        style={{
          animation: 'slideUp 200ms ease-out',
        }}
      >
        <Dialog.Title className="sr-only">
          {intl.formatMessage(messages.sheetTitle)}
        </Dialog.Title>

        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div aria-hidden="true" className="h-1 w-10 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/20 px-5 py-3">
          <span className="text-sm font-semibold text-text">
            {intl.formatMessage(messages.sheetTitle)}
          </span>
          <Dialog.Close
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-text-muted hover:text-text hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={intl.formatMessage(messages.closeSheet)}
            style={{ touchAction: 'manipulation' }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 15 15"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M11.78 4.03C12.01 3.81 12.01 3.44 11.78 3.22C11.56 2.99 11.19 2.99 10.97 3.22L7.5 6.69L4.03 3.22C3.81 2.99 3.44 2.99 3.22 3.22C2.99 3.44 2.99 3.81 3.22 4.03L6.69 7.5L3.22 10.97C2.99 11.19 2.99 11.56 3.22 11.78C3.44 12.01 3.81 12.01 4.03 11.78L7.5 8.31L10.97 11.78C11.19 12.01 11.56 12.01 11.78 11.78C12.01 11.56 12.01 11.19 11.78 10.97L8.31 7.5L11.78 4.03Z"
                fill="currentColor"
                fillRule="evenodd"
                clipRule="evenodd"
              />
            </svg>
          </Dialog.Close>
        </div>

        {/* Select all / Deselect all */}
        <div className="flex gap-2 px-4 py-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={allSelected || categories.length === 0}
            onClick={onSelectAll}
            className="flex-1"
          >
            {intl.formatMessage(messages.selectAll)}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={selected.length === 0}
            onClick={onDeselectAll}
            className="flex-1"
          >
            {intl.formatMessage(messages.deselectAll)}
          </Button>
        </div>

        {/* Category list (scrollable) */}
        <div className="overflow-y-auto p-4">
          {categories.length === 0 ? (
            <span className="block text-sm text-text-muted">
              {intl.formatMessage(
                categoriesLoading ? messages.loading : messages.empty,
              )}
            </span>
          ) : (
            <ul
              className="flex flex-col"
              role="group"
              aria-label={intl.formatMessage(messages.sheetTitle)}
            >
              {categories.map((category) => {
                const isSelected = selectedSet.has(category);
                return (
                  <li key={category}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isSelected}
                      onClick={() => onToggle(category)}
                      className="flex w-full min-h-[44px] items-center gap-3 rounded-btn px-4 py-2 text-left text-sm font-medium text-text hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      style={{ touchAction: 'manipulation' }}
                    >
                      {isSelected && (
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          aria-hidden="true"
                          className="shrink-0 text-primary"
                        >
                          <path
                            d="M5 12.5l5 5 9-9"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                      <span>{category}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}

export { CategoryFilterSheet };
