import { defineMessages, useIntl } from 'react-intl';

import {
  ObservationListItem,
  type ObservationListItemCategory,
} from '@/components/shared/ObservationListItem';
import { PaginationControls } from '@/components/shared/PaginationControls';
import { Card } from '@/components/ui/card';
import { usePaginatedItems } from '@/hooks/usePaginatedItems';
import type { Attachment } from '@/lib/data-layer';

export interface ObservationActivityItem {
  id: string;
  type: 'record';
  displayName: string;
  createdAt: string;
  timestamp: string;
  category?: ObservationListItemCategory;
  tags?: Record<string, string>;
  attachments?: Attachment[];
}

export interface GenericActivityItem {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  type: 'map' | 'sync';
}

export type ActivityItem = ObservationActivityItem | GenericActivityItem;

interface RecentActivityListProps {
  activities: ActivityItem[];
}

const PAGE_SIZE = 5;

const messages = defineMessages({
  recentTitle: {
    id: 'home.activity.recentTitle',
    defaultMessage: 'Recent Activity',
  },
  empty: {
    id: 'home.activity.empty',
    defaultMessage: 'No recent activity',
  },
});

function GenericActivityIcon({ type }: { type: GenericActivityItem['type'] }) {
  return (
    <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
      {type === 'map' ? (
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
          <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
          <line x1="9" y1="3" x2="9" y2="21" />
          <line x1="15" y1="3" x2="15" y2="21" />
        </svg>
      ) : (
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
          <path d="M21 2v6h-6" />
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
          <path d="M3 22v-6h6" />
          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        </svg>
      )}
    </div>
  );
}

export function RecentActivityList({ activities }: RecentActivityListProps) {
  const intl = useIntl();
  const {
    paginatedItems: visibleActivities,
    totalCount,
    hasMore,
    loadMore,
    showingStart,
    showingEnd,
  } = usePaginatedItems(activities, { pageSize: PAGE_SIZE });

  return (
    <Card className="flex flex-col">
      <Card.Header className="border-b border-border pb-3 pt-4 px-6">
        <h2 className="text-lg font-bold text-text">
          {intl.formatMessage(messages.recentTitle)}
        </h2>
      </Card.Header>
      <div className="flex flex-col">
        {activities.length === 0 ? (
          <div className="p-6 text-sm text-text-muted text-center">
            {intl.formatMessage(messages.empty)}
          </div>
        ) : (
          visibleActivities.map((activity, index) => (
            <div
              key={activity.id}
              data-activity-item
              className={`p-5 ${index !== visibleActivities.length - 1 ? 'border-b border-border' : ''}`}
            >
              {activity.type === 'record' ? (
                <ObservationListItem
                  observationLocalId={activity.id}
                  category={activity.category}
                  displayName={activity.displayName}
                  createdAt={activity.createdAt}
                  dateLabel={activity.timestamp}
                  tags={activity.tags}
                  attachments={activity.attachments}
                />
              ) : (
                <div className="flex items-start gap-4">
                  <GenericActivityIcon type={activity.type} />
                  <div className="flex flex-1 flex-col">
                    <div className="flex items-start sm:items-center justify-between gap-2">
                      <span className="font-semibold text-text">
                        {activity.title}
                      </span>
                      <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
                        {activity.timestamp}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-text-muted">
                      {activity.description}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
      <PaginationControls
        showingStart={showingStart}
        showingEnd={showingEnd}
        totalCount={totalCount}
        hasMore={hasMore}
        onLoadMore={loadMore}
        itemLabel="activities"
      />
    </Card>
  );
}
