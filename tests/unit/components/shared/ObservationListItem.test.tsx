import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import { ObservationListItem } from '@/components/shared/ObservationListItem';

const category = {
  id: 'forest',
  name: 'Forest',
  color: '#228B22',
  iconDocId: undefined,
  iconUrl: undefined,
};

describe('ObservationListItem', () => {
  it('renders the canonical observation category, name, date, and media layout', () => {
    render(
      <ObservationListItem
        observationLocalId="obs-1"
        category={category}
        displayName="Forest observation"
        createdAt="2026-08-09T10:00:00.000Z"
        dateLabel="2 hours ago"
        tags={{ audioCount: '1' }}
      />,
    );

    expect(screen.getByRole('img', { name: 'Forest' })).toBeVisible();
    expect(screen.getByText('Forest observation')).toBeVisible();
    expect(screen.getByText('2 hours ago')).toBeVisible();
    expect(screen.getByTestId('audio-icon')).toBeVisible();
  });

  it('uses an absolute locale date by default', () => {
    render(
      <ObservationListItem
        observationLocalId="obs-2"
        displayName="Observation"
        createdAt="2026-08-09T10:00:00.000Z"
      />,
    );

    expect(
      screen.getByText(
        new Date('2026-08-09T10:00:00.000Z').toLocaleDateString(),
      ),
    ).toBeVisible();
  });
});
