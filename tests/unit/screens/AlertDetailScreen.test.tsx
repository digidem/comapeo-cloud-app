import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { AlertDetailScreen } from '@/screens/AlertDetailScreen';

vi.mock('@/components/layout/shell-slot', () => ({
  useShellSlot: vi.fn(),
}));

vi.mock('@/hooks/useAlerts', () => ({
  useAlerts: vi.fn().mockReturnValue({
    data: [
      {
        localId: 'alert-1',
        projectLocalId: 'proj-1',
        geometry: { type: 'Point', coordinates: [102.0, 0.5] },
        metadata: { severity: 'high' },
        detectionDateStart: '2026-01-01T00:00:00Z',
        detectionDateEnd: '2026-01-31T00:00:00Z',
        createdAt: '2026-01-15T00:00:00Z',
        updatedAt: '2026-01-15T00:00:00Z',
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
  useParams: () => ({ alertId: 'alert-1' }),
}));

describe('AlertDetailScreen', () => {
  it('renders alert title', () => {
    render(<AlertDetailScreen />);
    expect(screen.getByText('Alert')).toBeInTheDocument();
  });

  it('renders geometry section', () => {
    render(<AlertDetailScreen />);
    expect(screen.getByText('Geometry')).toBeInTheDocument();
  });

  it('renders metadata section', () => {
    render(<AlertDetailScreen />);
    expect(screen.getByText('Metadata')).toBeInTheDocument();
  });

  it('renders back link', () => {
    render(<AlertDetailScreen />);
    expect(screen.getByText('Back to Data')).toBeInTheDocument();
  });

  it('renders detection period', () => {
    render(<AlertDetailScreen />);
    expect(screen.getByText('Detection Period')).toBeInTheDocument();
  });
});
