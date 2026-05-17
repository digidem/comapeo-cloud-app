import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { CreateAlertScreen } from '@/screens/CreateAlertScreen';

vi.mock('@/components/layout/shell-slot', () => ({
  useShellSlot: vi.fn(),
}));

vi.mock('@/hooks/useCreateAlert', () => ({
  useCreateAlert: vi.fn().mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@/stores/project-store', () => ({
  useProjectStore: vi.fn().mockReturnValue('proj-1'),
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
  useNavigate: () => () => {},
}));

describe('CreateAlertScreen', () => {
  it('renders create alert title', () => {
    render(<CreateAlertScreen />);
    expect(screen.getByText('Create Alert')).toBeInTheDocument();
  });

  it('renders geometry textarea', () => {
    render(<CreateAlertScreen />);
    expect(screen.getByText('Geometry (GeoJSON)')).toBeInTheDocument();
  });

  it('renders submit button', () => {
    render(<CreateAlertScreen />);
    expect(screen.getByText('Create')).toBeInTheDocument();
  });

  it('renders cancel button', () => {
    render(<CreateAlertScreen />);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('renders detection date fields', () => {
    render(<CreateAlertScreen />);
    expect(screen.getByText('Detection Date Start')).toBeInTheDocument();
    expect(screen.getByText('Detection Date End')).toBeInTheDocument();
  });
});
