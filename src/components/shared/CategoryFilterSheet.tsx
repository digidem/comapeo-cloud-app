import * as Dialog from '@radix-ui/react-dialog';

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
});

export interface CategoryFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: string[];
  selected: string[];
  onToggle: (category: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

function CategoryFilterSheet({
  open,
  onOpenChange,
  categories,
  selected,
  onToggle,
  onSelectAll,
  onDeselectAll,
}: CategoryFilterSheetProps) {
  const intl = useIntl();
  const allSelected =
    categories.length > 0 && selected.length === categories.length;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
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
                d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
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
            disabled={allSelected}
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
              {intl.formatMessage(messages.empty)}
            </span>
          ) : (
            <ul className="flex flex-col">
              {categories.map((category) => {
                const isSelected = selected.includes(category);
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
