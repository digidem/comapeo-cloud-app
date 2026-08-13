import userEvent from '@testing-library/user-event';
import { render, screen } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Alert } from '@/lib/data-layer';
import { AlertsScreen } from '@/screens/AlertsScreen';
import { useAlertViewModeStore } from '@/stores/alert-view-mode-store';
import { useViewModeStore } from '@/stores/view-mode-store';

// --- Shared mock factories ---

const defaultProjects = [
  { localId: 'proj-1', name: 'Test Project' },
  { localId: 'proj-2', name: 'Another Project' },
];

const defaultAlerts: Alert[] = [
  {
    localId: 'alert-1',
    projectLocalId: 'proj-1',
    sourceType: 'local',
    sourceId: 'source-1',
    geometry: { type: 'Point', coordinates: [12.34, 56.78] },
    metadata: { severity: 'high', alert_type: 'deforestation' },
    detectionDateStart: '2024-03-14T00:00:00Z',
    detectionDateEnd: '2024-03-15T00:00:00Z',
    createdAt: '2024-03-15T08:00:00Z',
    updatedAt: '2024-03-15T08:00:00Z',
    dirtyLocal: false,
    deleted: false,
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

vi.mock('@/components/shared/AlertsMap', () => ({
  AlertsMap: ({
    alerts,
    showEmptyState,
  }: {
    alerts: Alert[];
    showEmptyState: boolean;
  }) => (
    <div
      data-testid="alerts-map"
      data-alert-count={alerts.length}
      data-show-empty-state={String(showEmptyState)}
    />
  ),
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
  useAlertViewModeStore.setState({ viewMode: 'map' });
  useViewModeStore.setState({ viewMode: 'map' });
}

describe('AlertsScreen', () => {
  // ---- No project selected ----

  describe('when no project is selected', () => {
    it('renders loading skeleton when projectsQuery is pending and no selectedProjectId', () => {
      resetMocks();
      mockSelectedProjectId = null;
      mockProjectsQuery = { data: undefined, isPending: true };

      render(<AlertsScreen />);
      const skeletons = screen.getAllByTestId('skeleton');
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
      const skeletons = screen.getAllByTestId('skeleton');
      expect(skeletons.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByRole('status')).toHaveTextContent('Loading...');
    });

    it('renders alerts error state', () => {
      mockAlertsQuery = { data: [], isPending: false, isError: true };

      render(<AlertsScreen />);
      expect(
        screen.getByText('Failed to load alerts. Please try again.'),
      ).toBeInTheDocument();
      expect(screen.queryByText('No alerts yet')).not.toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('renders "No alerts yet" when alerts array is empty', () => {
      mockAlertsQuery = { data: [], isPending: false };

      render(<AlertsScreen />);
      expect(screen.getByText('No alerts yet')).toBeInTheDocument();
    });

    it('defaults to map view and preserves the Add Alert link', () => {
      render(<AlertsScreen />);

      expect(screen.getByTestId('alerts-map')).toHaveAttribute(
        'data-alert-count',
        '1',
      );
      expect(
        screen.getByRole('button', { name: 'Switch to grid view' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Add Alert' })).toHaveAttribute(
        'href',
        '/alerts/new',
      );
    });

    it('switches to the existing grid without changing Data view preference', async () => {
      const user = userEvent.setup();
      render(<AlertsScreen />);

      await user.click(
        screen.getByRole('button', { name: 'Switch to grid view' }),
      );

      expect(screen.queryByTestId('alerts-map')).not.toBeInTheDocument();
      expect(screen.getByText('deforestation')).toBeInTheDocument();
      expect(useAlertViewModeStore.getState().viewMode).toBe('grid');
      expect(useViewModeStore.getState().viewMode).toBe('map');
      expect(
        screen.getByRole('button', { name: 'Switch to map view' }),
      ).toBeInTheDocument();
    });

    it('uses a map-owned no-location state for alerts without valid geometry', () => {
      mockAlertsQuery = {
        data: [{ ...defaultAlerts[0]!, geometry: undefined }],
        isPending: false,
      };

      render(<AlertsScreen />);

      expect(screen.getByTestId('alerts-map')).toHaveAttribute(
        'data-show-empty-state',
        'true',
      );
      expect(screen.queryByText('No alerts yet')).not.toBeInTheDocument();
    });

    it('renders alert cards when alerts exist', () => {
      useAlertViewModeStore.setState({ viewMode: 'grid' });
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
      useAlertViewModeStore.setState({ viewMode: 'grid' });
      mockAlertsQuery = { data: defaultAlerts, isPending: false };

      render(<AlertsScreen />);
      // The Link mock renders the raw template path with params
      const link = screen.getByRole('link', { name: /deforestation/i });
      expect(link).toBeInTheDocument();
      // Verify the link points to the alert detail route
      expect(link).toHaveAttribute('href', '/alerts/$alertId');
    });
  });
});
