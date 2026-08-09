import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import { RecentActivityList } from '@/screens/Home/RecentActivityList';

const PAGE_SIZE = 5;

const category = {
  id: 'forest',
  name: 'Forest',
  color: '#228B22',
  iconDocId: undefined,
  iconUrl: undefined,
};

const mockActivities = [
  {
    id: 'obs-1',
    type: 'record' as const,
    displayName: 'Forest observation',
    createdAt: '2026-08-09T10:00:00.000Z',
    timestamp: '2 hours ago',
    category,
    tags: { audioCount: '1' },
  },
  {
    id: 'alert-1',
    title: 'New Alert',
    description: 'Satellite alert received',
    timestamp: '5 hours ago',
    type: 'sync' as const,
  },
];

function makeActivities(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `activity-${i}`,
    title: `Activity ${i}`,
    description: `Description ${i}`,
    timestamp: `${i} hours ago`,
    type: 'sync' as const,
  }));
}

describe('RecentActivityList', () => {
  it('renders empty state when activities array is empty', () => {
    render(<RecentActivityList activities={[]} />);
    expect(screen.getByText('No recent activity')).toBeVisible();
  });

  it('renders observation activities with the shared canonical layout', () => {
    render(<RecentActivityList activities={mockActivities} />);

    const item = screen
      .getByText('Forest observation')
      .closest('[data-activity-item]');

    expect(item).toBeInTheDocument();
    expect(
      item?.querySelector('[data-observation-list-item]'),
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Forest' })).toBeVisible();
    expect(screen.getByText('2 hours ago')).toBeVisible();
    expect(screen.getByTestId('audio-icon')).toBeVisible();
  });

  it('does not render the legacy observation icon or metadata rows', () => {
    render(<RecentActivityList activities={mockActivities} />);

    const item = screen
      .getByText('Forest observation')
      .closest('[data-activity-item]');

    expect(item?.querySelector('polyline')).not.toBeInTheDocument();
    expect(screen.queryByText('1 audio')).not.toBeInTheDocument();
  });

  it('preserves alert rows with title, description, timestamp, and sync icon', () => {
    render(<RecentActivityList activities={mockActivities} />);

    expect(screen.getByText('New Alert')).toBeVisible();
    expect(screen.getByText('Satellite alert received')).toBeVisible();
    expect(screen.getByText('5 hours ago')).toBeVisible();

    const alert = screen.getByText('New Alert').closest('[data-activity-item]');
    expect(alert?.querySelectorAll('svg path').length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it('applies border between items but not on the last item', () => {
    const { container } = render(
      <RecentActivityList activities={mockActivities} />,
    );

    // eslint-disable-next-line testing-library/no-container
    const items = container.querySelectorAll('[data-activity-item]');
    expect(items).toHaveLength(2);
    expect(items[0]!.className).toContain('border-b');
    expect(items[1]!.className).not.toContain('border-b');
  });

  it('renders "Recent Activity" heading via i18n', () => {
    render(<RecentActivityList activities={[]} />);
    expect(
      screen.getByRole('heading', { name: 'Recent Activity' }),
    ).toBeVisible();
  });

  it('renders only first PAGE_SIZE items by default when given more', () => {
    const activities = makeActivities(8);
    render(<RecentActivityList activities={activities} />);

    for (let i = 0; i < PAGE_SIZE; i++) {
      expect(screen.getByText(`Activity ${i}`)).toBeVisible();
    }
    expect(screen.queryByText('Activity 5')).not.toBeInTheDocument();
    expect(screen.queryByText('Activity 6')).not.toBeInTheDocument();
    expect(screen.queryByText('Activity 7')).not.toBeInTheDocument();
  });

  it('"Load more" button appears when there are more items', () => {
    render(<RecentActivityList activities={makeActivities(8)} />);
    expect(
      screen.getByRole('button', { name: /load more/i }),
    ).toBeInTheDocument();
  });

  it('clicking "Load more" loads the next page', async () => {
    const user = userEvent.setup();
    render(<RecentActivityList activities={makeActivities(8)} />);

    await user.click(screen.getByRole('button', { name: /load more/i }));

    for (let i = 0; i < 8; i++) {
      expect(screen.getByText(`Activity ${i}`)).toBeVisible();
    }
    expect(
      screen.queryByRole('button', { name: /load more/i }),
    ).not.toBeInTheDocument();
  });

  it('does not show "Load more" when all items fit on one page', () => {
    render(<RecentActivityList activities={mockActivities} />);
    expect(
      screen.queryByRole('button', { name: /load more/i }),
    ).not.toBeInTheDocument();
  });

  it('shows pagination info text', () => {
    render(<RecentActivityList activities={makeActivities(8)} />);
    expect(screen.getByText(/Showing/)).toBeInTheDocument();
    expect(screen.getByText(/1–5/)).toBeInTheDocument();
    expect(screen.getByText(/8/)).toBeInTheDocument();
  });
});
