import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import { RecentActivityList } from '@/screens/Home/RecentActivityList';

const mockActivities = [
  {
    id: 'activity-1',
    title: 'New Observation',
    description: 'Forest deforestation detected',
    timestamp: '2 hours ago',
    type: 'record' as const,
  },
  {
    id: 'activity-2',
    title: 'Map Updated',
    description: 'Territory boundary updated',
    timestamp: '5 hours ago',
    type: 'map' as const,
  },
  {
    id: 'activity-3',
    title: 'Data Synced',
    description: 'All data synchronized with server',
    timestamp: '1 day ago',
    type: 'sync' as const,
  },
];

describe('RecentActivityList', () => {
  it('renders empty state when activities array is empty', () => {
    render(<RecentActivityList activities={[]} />);
    expect(screen.getByText('No recent activity')).toBeVisible();
  });

  it('renders activity items with correct titles and descriptions', () => {
    render(<RecentActivityList activities={mockActivities} />);

    for (const activity of mockActivities) {
      expect(screen.getByText(activity.title)).toBeVisible();
      expect(screen.getByText(activity.description)).toBeVisible();
    }
  });

  it('renders correct SVG icon for record type', () => {
    render(
      <RecentActivityList
        activities={[
          {
            id: 'rec',
            title: 'Record',
            description: 'desc',
            timestamp: 'now',
            type: 'record',
          },
        ]}
      />,
    );
    // record SVG contains a <polyline> element
    const container = screen.getByText('Record').closest('.flex.items-start');
    expect(container?.querySelector('polyline')).toBeInTheDocument();
  });

  it('renders correct SVG icon for map type', () => {
    render(
      <RecentActivityList
        activities={[
          {
            id: 'map',
            title: 'Map',
            description: 'desc',
            timestamp: 'now',
            type: 'map',
          },
        ]}
      />,
    );
    // map SVG contains a <polygon> element
    const container = screen.getByText('Map').closest('.flex.items-start');
    expect(container?.querySelector('polygon')).toBeInTheDocument();
  });

  it('renders correct SVG icon for sync type', () => {
    render(
      <RecentActivityList
        activities={[
          {
            id: 'sync',
            title: 'Sync',
            description: 'desc',
            timestamp: 'now',
            type: 'sync',
          },
        ]}
      />,
    );
    // sync SVG does NOT contain polyline or polygon, but has multiple <path> elements
    const container = screen.getByText('Sync').closest('.flex.items-start');
    const paths = container?.querySelectorAll('svg path');
    expect(paths?.length).toBeGreaterThanOrEqual(2);
  });

  it('renders timestamps for each activity', () => {
    render(<RecentActivityList activities={mockActivities} />);

    expect(screen.getByText('2 hours ago')).toBeVisible();
    expect(screen.getByText('5 hours ago')).toBeVisible();
    expect(screen.getByText('1 day ago')).toBeVisible();
  });

  it('applies border between items but not on last item', () => {
    const { container } = render(
      <RecentActivityList activities={mockActivities} />,
    );

    // eslint-disable-next-line testing-library/no-container
    const items = container.querySelectorAll('.flex.items-start');
    expect(items).toHaveLength(3);

    // First item should have border-b
    expect(items[0]!.className).toContain('border-b');
    // Second item should have border-b
    expect(items[1]!.className).toContain('border-b');
    // Last item should NOT have border-b
    expect(items[2]!.className).not.toContain('border-b');
  });

  it('renders "Recent Activity" heading via i18n', () => {
    render(<RecentActivityList activities={[]} />);
    expect(
      screen.getByRole('heading', { name: 'Recent Activity' }),
    ).toBeVisible();
  });
});
