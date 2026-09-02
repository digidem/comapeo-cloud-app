import * as Dialog from '@radix-ui/react-dialog';

import { useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { CategoryFilterSheet } from '@/components/shared/CategoryFilterSheet';
import { ObservationFilterBar } from '@/components/shared/ObservationFilterBar';
import type { ObservationFilterBarProps } from '@/components/shared/ObservationFilterBar';
import { Button } from '@/components/ui/button';
import { CloseIcon } from '@/components/ui/close-icon';
import { SelectPortalProvider } from '@/components/ui/select';

const messages = defineMessages({
  sheetTitle: {
    id: 'data.filterSheetTitle',
    defaultMessage: 'Filters',
  },
  apply: {
    id: 'data.filterSheetApply',
    defaultMessage: 'Show results',
  },
  closeSheet: {
    id: 'data.filterSheetClose',
    defaultMessage: 'Close filters',
  },
  categorySheetTitle: {
    id: 'data.filters.categorySheetTitle',
    defaultMessage: 'Categories',
  },
  categoryAll: {
    id: 'data.filters.categoryAll',
    defaultMessage: 'All categories',
  },
  categorySelected: {
    id: 'data.filters.categoryHiddenSelected',
    defaultMessage: '{count} selected',
  },
});

interface FilterSheetProps extends ObservationFilterBarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCategoriesSelectAll: () => void;
  categoriesLoading?: boolean;
  /**
   * 'bottom' (default): viewport-fixed bottom sheet (mobile).
   * 'right': full-height right-side drawer (desktop map view).
   */
  variant?: 'bottom' | 'right';
}

function FilterSheet({
  open,
  onOpenChange,
  onCategoriesSelectAll,
  categoriesLoading,
  variant = 'bottom',
  ...filterProps
}: FilterSheetProps) {
  const intl = useIntl();
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const isDrawer = variant === 'right';

  function handleOpenChange(next: boolean) {
    if (!next) setCategorySheetOpen(false);
    onOpenChange(next);
  }

  function handleApply() {
    setCategorySheetOpen(false);
    onOpenChange(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
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
          className={
            isDrawer
              ? 'fixed right-0 top-0 bottom-0 z-[51] flex w-[min(380px,90vw)] flex-col bg-surface-card shadow-elevated animate-slide-in-right focus:outline-none'
              : 'fixed bottom-0 left-0 right-0 z-[51] flex max-h-[85vh] flex-col rounded-t-card bg-surface-card shadow-elevated focus:outline-none'
          }
          style={isDrawer ? undefined : { animation: 'slideUp 200ms ease-out' }}
        >
          <Dialog.Title className="sr-only">
            {intl.formatMessage(messages.sheetTitle)}
          </Dialog.Title>

          {/* Drag handle (bottom-sheet affordance) */}
          {!isDrawer && (
            <div className="flex justify-center pt-3 pb-1">
              <div
                aria-hidden="true"
                className="h-1 w-10 rounded-full bg-border"
              />
            </div>
          )}

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
              <CloseIcon size={20} />
            </Dialog.Close>
          </div>

          {/* Portal container for Select dropdowns — renders inside Dialog.Content
              so clicks on options aren't intercepted by the Dialog's DismissableLayer */}
          <div ref={setPortalContainer} />

          {/* Filter controls */}
          <div className="overflow-y-auto p-4">
            <CategoryFilterSheet
              open={categorySheetOpen}
              onOpenChange={setCategorySheetOpen}
              variant={isDrawer ? 'drawer' : 'bottom'}
              categories={filterProps.availableCategories}
              selected={filterProps.filters.categories}
              onToggle={filterProps.onCategoryToggle}
              onSelectAll={onCategoriesSelectAll}
              onDeselectAll={filterProps.onCategoriesClear}
              categoriesLoading={categoriesLoading}
              trigger={
                <button
                  type="button"
                  className="mb-3 flex w-full min-h-[44px] items-center justify-between rounded-btn border border-border bg-surface px-4 py-2 text-left text-sm font-medium text-text hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  style={{ touchAction: 'manipulation' }}
                >
                  <span>{intl.formatMessage(messages.categorySheetTitle)}</span>
                  <span className="text-sm text-text-muted">
                    {filterProps.filters.categories.length === 0
                      ? intl.formatMessage(messages.categoryAll)
                      : intl.formatMessage(messages.categorySelected, {
                          count: filterProps.filters.categories.length,
                        })}
                  </span>
                </button>
              }
            />
            <SelectPortalProvider container={portalContainer}>
              <ObservationFilterBar {...filterProps} hideCategories />
            </SelectPortalProvider>
          </div>

          {/* Apply button */}
          <div className="border-t border-border p-4">
            <Button className="w-full" onClick={handleApply}>
              {intl.formatMessage(messages.apply)}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export { FilterSheet };
export type { FilterSheetProps };
