import { defineMessages, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';

const messages = defineMessages({
  showing: {
    id: 'pagination.showing',
    defaultMessage: 'Showing {start}–{end} of {total} {itemLabel}',
  },
  loadMore: {
    id: 'pagination.loadMore',
    defaultMessage: 'Load more',
  },
});

export interface PaginationControlsProps {
  /** 1-indexed start of currently visible range. */
  showingStart: number;
  /** End of currently visible range. */
  showingEnd: number;
  /** Total number of items. */
  totalCount: number;
  /** Whether there are more items to load. */
  hasMore: boolean;
  /** Called when the user clicks Load More. */
  onLoadMore: () => void;
  /** Label for the items being paginated. Defaults to "observations". */
  itemLabel?: string;
}

export function PaginationControls({
  showingStart,
  showingEnd,
  totalCount,
  hasMore,
  onLoadMore,
  itemLabel = 'observations',
}: PaginationControlsProps) {
  const intl = useIntl();

  if (totalCount === 0) return null;

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <span className="text-sm text-text-muted" role="status">
        {intl.formatMessage(messages.showing, {
          start: showingStart,
          end: showingEnd,
          total: totalCount,
          itemLabel,
        })}
      </span>
      {hasMore && (
        <Button variant="secondary" size="sm" onClick={onLoadMore}>
          {intl.formatMessage(messages.loadMore)}
        </Button>
      )}
    </div>
  );
}
