import { defineMessages, useIntl } from 'react-intl';

import { Card } from '@/components/ui/card';

interface ActivityItem {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  type: 'record' | 'map' | 'sync';
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
});

export function RecentActivityList({ activities }: RecentActivityListProps) {
  const intl = useIntl();

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
          activities.map((activity, index) => (
            <div
              key={activity.id}
              className={`flex items-start gap-4 p-5 ${index !== activities.length - 1 ? 'border-b border-border' : ''}`}
            >
              <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
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
                <div className="flex items-center justify-between gap-2">
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
          ))
        )}
      </div>
    </Card>
  );
}
