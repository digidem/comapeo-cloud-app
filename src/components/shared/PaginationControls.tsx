import { defineMessages, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';

const messages = defineMessages({
  showing: {
    id: 'pagination.showing',
    defaultMessage: 'Showing {start}–{end} of {total} observations',
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
  /** Total number of observations. */
  totalCount: number;
  /** Whether there are more observations to load. */
  hasMore: boolean;
  /** Called when the user clicks Load More. */
  onLoadMore: () => void;
}

export function PaginationControls({
  showingStart,
  showingEnd,
  totalCount,
  hasMore,
  onLoadMore,
}: PaginationControlsProps) {
  const intl = useIntl();

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <span className="text-sm text-text-muted">
        {intl.formatMessage(messages.showing, {
          start: showingStart,
          end: showingEnd,
          total: totalCount,
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
