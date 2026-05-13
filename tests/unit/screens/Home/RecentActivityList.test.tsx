import { render, screen, userEvent } from '@tests/mocks/test-utils';
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

function makeActivities(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `activity-${i}`,
    title: `Activity ${i}`,
    description: `Description ${i}`,
    timestamp: `${i} hours ago`,
    type: 'record' as const,
  }));
}

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
    const container = screen
      .getByText('Record')
      .closest('[data-activity-item]');
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
    const container = screen.getByText('Map').closest('[data-activity-item]');
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
    const container = screen.getByText('Sync').closest('[data-activity-item]');
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
    const items = container.querySelectorAll('[data-activity-item]');
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

  // ---- Load More tests ----

  it('renders only first 3 items by default when given more than 3', () => {
    const activities = makeActivities(5);
    render(<RecentActivityList activities={activities} />);

    expect(screen.getByText('Activity 0')).toBeVisible();
    expect(screen.getByText('Activity 1')).toBeVisible();
    expect(screen.getByText('Activity 2')).toBeVisible();
    expect(screen.queryByText('Activity 3')).not.toBeInTheDocument();
    expect(screen.queryByText('Activity 4')).not.toBeInTheDocument();
  });

  it('"Load More" button appears when there are more than 3 items', () => {
    const activities = makeActivities(5);
    render(<RecentActivityList activities={activities} />);

    expect(screen.getByTestId('load-more-btn')).toBeVisible();
  });

  it('"Load More" button shows remaining count', () => {
    const activities = makeActivities(5);
    render(<RecentActivityList activities={activities} />);

    expect(screen.getByText('Load More (2 more)')).toBeVisible();
  });

  it('clicking "Load More" reveals all items', async () => {
    const user = userEvent.setup();
    const activities = makeActivities(5);
    render(<RecentActivityList activities={activities} />);

    await user.click(screen.getByTestId('load-more-btn'));

    expect(screen.getByText('Activity 3')).toBeVisible();
    expect(screen.getByText('Activity 4')).toBeVisible();
    expect(screen.queryByTestId('load-more-btn')).not.toBeInTheDocument();
  });

  it('no "Load More" button when there are 3 or fewer items', () => {
    render(<RecentActivityList activities={mockActivities} />);
    expect(screen.queryByTestId('load-more-btn')).not.toBeInTheDocument();
  });

  // ---- Observation metadata tests ----

  it('renders category badge when present on record item', () => {
    render(
      <RecentActivityList
        activities={[
          {
            id: 'obs-1',
            title: 'Observation',
            description: 'desc',
            timestamp: 'now',
            type: 'record',
            category: 'forest',
          },
        ]}
      />,
    );
    expect(screen.getByText('forest')).toBeVisible();
  });

  it('renders photo count when present on record item', () => {
    render(
      <RecentActivityList
        activities={[
          {
            id: 'obs-1',
            title: 'Observation',
            description: 'desc',
            timestamp: 'now',
            type: 'record',
            photoCount: 3,
          },
        ]}
      />,
    );
    expect(screen.getByText('3 photos')).toBeVisible();
  });

  it('renders audio count when present on record item', () => {
    render(
      <RecentActivityList
        activities={[
          {
            id: 'obs-1',
            title: 'Observation',
            description: 'desc',
            timestamp: 'now',
            type: 'record',
            audioCount: 1,
          },
        ]}
      />,
    );
    expect(screen.getByText('1 audio')).toBeVisible();
  });

  it('renders details text when present on record item', () => {
    render(
      <RecentActivityList
        activities={[
          {
            id: 'obs-1',
            title: 'Observation',
            description: 'desc',
            timestamp: 'now',
            type: 'record',
            details: 'Some notes about the observation',
          },
        ]}
      />,
    );
    expect(screen.getByText('Some notes about the observation')).toBeVisible();
  });

  it('does not render metadata row for non-record items', () => {
    render(
      <RecentActivityList
        activities={[
          {
            id: 'sync-1',
            title: 'Sync',
            description: 'desc',
            timestamp: 'now',
            type: 'sync',
            category: 'forest',
            photoCount: 2,
          },
        ]}
      />,
    );
    expect(screen.queryByText('forest')).not.toBeInTheDocument();
    expect(screen.queryByText('2 photos')).not.toBeInTheDocument();
  });

  it('does not render metadata row when no metadata fields are set', () => {
    render(
      <RecentActivityList
        activities={[
          {
            id: 'obs-1',
            title: 'Observation',
            description: 'desc',
            timestamp: 'now',
            type: 'record',
          },
        ]}
      />,
    );
    // Should not have any photo/audio/category text since no metadata is set
    expect(screen.queryByText(/photos/)).not.toBeInTheDocument();
    expect(screen.queryByText(/audio/)).not.toBeInTheDocument();
  });
});
