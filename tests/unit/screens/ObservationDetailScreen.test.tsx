import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { ObservationDetailScreen } from '@/screens/ObservationDetailScreen';

vi.mock('@/components/layout/shell-slot', () => ({
  useShellSlot: vi.fn(),
}));

vi.mock('@/hooks/useObservations', () => ({
  useObservations: vi.fn().mockReturnValue({
    data: [
      {
        localId: 'obs-1',
        projectLocalId: 'proj-1',
        tags: { category: 'Wildlife', notes: 'Eagle sighting' },
        lat: 10.5,
        lon: -85.2,
        createdAt: '2026-01-15T00:00:00Z',
        updatedAt: '2026-01-15T12:00:00Z',
      },
    ],
    isPending: false,
    error: null,
  }),
}));

vi.mock('@/hooks/useProjects', () => ({
  useProjects: vi.fn().mockReturnValue({
    data: [{ localId: 'proj-1', name: 'Test Project' }],
    isPending: false,
  }),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useParams: () => ({ observationId: 'obs-1' }),
}));

describe('ObservationDetailScreen', () => {
  it('renders observation category as title', () => {
    render(<ObservationDetailScreen />);
    expect(screen.getByText('Wildlife')).toBeInTheDocument();
  });

  it('renders location with coordinates', () => {
    render(<ObservationDetailScreen />);
    expect(screen.getByText(/10\.500000.*-85\.200000/)).toBeInTheDocument();
  });

  it('renders tags', () => {
    render(<ObservationDetailScreen />);
    expect(screen.getByText(/category.*Wildlife/)).toBeInTheDocument();
    expect(screen.getByText(/notes.*Eagle sighting/)).toBeInTheDocument();
  });

  it('renders back link', () => {
    render(<ObservationDetailScreen />);
    expect(screen.getByText('Back to Data')).toBeInTheDocument();
  });

  it('renders created date', () => {
    render(<ObservationDetailScreen />);
    expect(screen.getByText(/Created/)).toBeInTheDocument();
  });
});
