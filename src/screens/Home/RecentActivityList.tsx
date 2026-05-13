import { useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { Card } from '@/components/ui/card';

interface ActivityItem {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  type: 'record' | 'map' | 'sync';
  // Optional fields for observation enrichment
  category?: string;
  photoCount?: number;
  audioCount?: number;
  details?: string;
}

interface RecentActivityListProps {
  activities: ActivityItem[];
}

const messages = defineMessages({
  recentTitle: {
    id: 'home.activity.recentTitle',
    defaultMessage: 'Recent Activity',
  },
  empty: {
    id: 'home.activity.empty',
    defaultMessage: 'No recent activity',
  },
  loadMore: {
    id: 'home.activity.loadMore',
    defaultMessage: 'Load More',
  },
  loadMoreCount: {
    id: 'home.activity.loadMoreCount',
    defaultMessage: 'Load More ({count} more)',
  },
  photos: {
    id: 'home.activity.photos',
    defaultMessage: '{count, plural, one {# photo} other {# photos}}',
  },
  audios: {
    id: 'home.activity.audios',
    defaultMessage: '{count, plural, one {# audio} other {# audios}}',
  },
});

export function RecentActivityList({ activities }: RecentActivityListProps) {
  const intl = useIntl();
  const [visibleCount, setVisibleCount] = useState(3);
  const visibleActivities = activities.slice(0, visibleCount);
  const hasMore = activities.length > visibleCount;
  const remaining = activities.length - visibleCount;

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
              className={`flex items-start gap-4 p-5 ${index !== visibleActivities.length - 1 ? 'border-b border-border' : ''}`}
            >
              <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                {activity.type === 'record' && (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                )}
                {activity.type === 'map' && (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                    <line x1="15" y1="3" x2="15" y2="21" />
                  </svg>
                )}
                {activity.type === 'sync' && (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 2v6h-6" />
                    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                    <path d="M3 22v-6h6" />
                    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                  </svg>
                )}
              </div>
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
                {/* Observation metadata row */}
                {activity.type === 'record' &&
                  (activity.category ||
                    activity.photoCount ||
                    activity.audioCount ||
                    activity.details) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                      {activity.category && (
                        <span className="inline-flex items-center rounded-full bg-primary-soft px-2 py-0.5 text-primary">
                          {activity.category}
                        </span>
                      )}
                      {typeof activity.photoCount === 'number' &&
                        activity.photoCount !== 0 && (
                          <span>
                            {intl.formatMessage(messages.photos, {
                              count: activity.photoCount,
                            })}
                          </span>
                        )}
                      {typeof activity.audioCount === 'number' &&
                        activity.audioCount !== 0 && (
                          <span>
                            {intl.formatMessage(messages.audios, {
                              count: activity.audioCount,
                            })}
                          </span>
                        )}
                      {activity.details && (
                        <span className="truncate max-w-[200px]">
                          {activity.details}
                        </span>
                      )}
                    </div>
                  )}
              </div>
            </div>
          ))
        )}
      </div>
      {/* Load More button */}
      {hasMore && (
        <div className="flex justify-center border-t border-border p-3">
          <button
            type="button"
            data-testid="load-more-btn"
            className="text-sm font-medium text-primary hover:text-primary-dark"
            onClick={() => setVisibleCount(activities.length)}
          >
            {remaining > 0
              ? intl.formatMessage(messages.loadMoreCount, {
                  count: remaining,
                })
              : intl.formatMessage(messages.loadMore)}
          </button>
        </div>
      )}
    </Card>
  );
}
