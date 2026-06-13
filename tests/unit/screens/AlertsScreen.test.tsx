import { render, screen } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AlertsScreen } from '@/screens/AlertsScreen';

// --- Shared mock factories ---

const defaultProjects = [
  { localId: 'proj-1', name: 'Test Project' },
  { localId: 'proj-2', name: 'Another Project' },
];

const defaultAlerts = [
  {
    localId: 'alert-1',
    projectLocalId: 'proj-1',
    geometry: { type: 'Point', coordinates: [12.34, 56.78] },
    metadata: { severity: 'high', alert_type: 'deforestation' },
    detectionDateStart: '2024-03-14T00:00:00Z',
    detectionDateEnd: '2024-03-15T00:00:00Z',
    createdAt: '2024-03-15T08:00:00Z',
    updatedAt: '2024-03-15T08:00:00Z',
  },
];

let mockSelectedProjectId: string | null = null;
let mockProjectsQuery: {
  data?: typeof defaultProjects;
  isPending: boolean;
} = { data: defaultProjects, isPending: false };
let mockAlertsQuery: {
  data?: typeof defaultAlerts;
  isPending: boolean;
  isError?: boolean;
} = { data: defaultAlerts, isPending: false };

vi.mock('@/components/layout/shell-slot', () => ({
  useShellSlot: vi.fn(),
}));

vi.mock('@/stores/project-store', () => ({
  useProjectStore: vi.fn(
    (selector: (s: { selectedProjectId: string | null }) => string | null) =>
      selector({ selectedProjectId: mockSelectedProjectId }),
  ),
}));

vi.mock('@/hooks/useProjects', () => ({
  useProjects: vi.fn(() => mockProjectsQuery),
}));

vi.mock('@/hooks/useAlerts', () => ({
  useAlerts: vi.fn(() => mockAlertsQuery),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
}));

function resetMocks() {
  mockSelectedProjectId = null;
  mockProjectsQuery = { data: defaultProjects, isPending: false };
  mockAlertsQuery = { data: defaultAlerts, isPending: false };
}

describe('AlertsScreen', () => {
  // ---- No project selected ----

  describe('when no project is selected', () => {
    it('renders loading skeleton when projectsQuery is pending and no selectedProjectId', () => {
      resetMocks();
      mockSelectedProjectId = null;
      mockProjectsQuery = { data: undefined, isPending: true };

      render(<AlertsScreen />);
      const skeletons = document.querySelectorAll(
        '[class*="animate-pulse"], [class*="bg-muted"]',
      );
      expect(skeletons.length).toBeGreaterThanOrEqual(1);
    });

    it('renders "Select a project" empty state with link to Home when projects loaded but no project selected', () => {
      resetMocks();
      mockSelectedProjectId = null;
      mockProjectsQuery = { data: defaultProjects, isPending: false };

      render(<AlertsScreen />);
      expect(
        screen.getByText('Select a project from Home to view alerts'),
      ).toBeInTheDocument();
      expect(screen.getByText('Go to Home')).toBeInTheDocument();
    });
  });

  // ---- Project selected, alerts ----

  describe('when a project is selected', () => {
    beforeEach(() => {
      resetMocks();
      mockSelectedProjectId = 'proj-1';
    });

    it('renders alerts loading skeleton when alertsQuery is pending', () => {
      mockAlertsQuery = { data: undefined, isPending: true };

      render(<AlertsScreen />);
      const skeletons = document.querySelectorAll(
        '[class*="animate-pulse"], [class*="bg-muted"]',
      );
      expect(skeletons.length).toBeGreaterThanOrEqual(1);
    });

    it('renders alerts error state', () => {
      mockAlertsQuery = { data: [], isPending: false, isError: true };

      render(<AlertsScreen />);
      expect(
        screen.getByText('Failed to load alerts. Please try again.'),
      ).toBeInTheDocument();
      expect(screen.queryByText('No alerts yet')).not.toBeInTheDocument();
    });

    it('renders "No alerts yet" when alerts array is empty', () => {
      mockAlertsQuery = { data: [], isPending: false };

      render(<AlertsScreen />);
      expect(screen.getByText('No alerts yet')).toBeInTheDocument();
    });

    it('renders alert cards when alerts exist', () => {
      mockAlertsQuery = { data: defaultAlerts, isPending: false };

      render(<AlertsScreen />);
      // The alert card renders the alert_type badge
      expect(screen.getByText('deforestation')).toBeInTheDocument();
    });

    it('renders the Add Alert link', () => {
      render(<AlertsScreen />);
      expect(screen.getByText('Add Alert')).toBeInTheDocument();
    });

    it('renders Alerts title', () => {
      render(<AlertsScreen />);
      expect(screen.getByText('Alerts')).toBeInTheDocument();
    });

    it('renders alert cards linking to alert detail', () => {
      mockAlertsQuery = { data: defaultAlerts, isPending: false };

      render(<AlertsScreen />);
      // The Link mock renders the raw template path with params
      const link = screen.getByRole('link', { name: /deforestation/i });
      expect(link).toBeInTheDocument();
      // Verify the link points to the alert detail route
      expect(link).toHaveAttribute('href', '/data/alerts/$alertId');
    });
  });
});
