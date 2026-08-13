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
    interactionMode,
    onMapPointSelect,
    draftPoint,
  }: {
    alerts: Alert[];
    showEmptyState: boolean;
    interactionMode?: string;
    onMapPointSelect?: (point: [number, number]) => void;
    draftPoint?: [number, number];
  }) => (
    <div
      data-testid="alerts-map"
      data-alert-count={alerts.length}
      data-show-empty-state={String(showEmptyState)}
      data-interaction-mode={interactionMode}
      data-draft-point={draftPoint?.join(',')}
    >
      <button type="button" onClick={() => onMapPointSelect?.([-51.25, -3.75])}>
        Select inline map point
      </button>
    </div>
  ),
}));

vi.mock('@/components/shared/AlertForm', () => ({
  AlertForm: ({
    geometryPickerProps,
    onCancel,
    onSuccess,
    onGeometryChange,
  }: {
    geometryPickerProps?: {
      showMap?: boolean;
      allowedTypes?: readonly string[];
      externalPoint?: [number, number];
    };
    onCancel: () => void;
    onSuccess?: () => void;
    onGeometryChange?: (geometry: {
      type: 'Point';
      coordinates: [number, number];
    }) => void;
  }) => (
    <div
      data-testid="inline-alert-form"
      data-show-map={String(geometryPickerProps?.showMap)}
      data-allowed-types={geometryPickerProps?.allowedTypes?.join(',')}
      data-external-point={geometryPickerProps?.externalPoint?.join(',')}
    >
      <button type="button" onClick={onCancel}>
        Mock cancel
      </button>
      <button type="button" onClick={onSuccess}>
        Mock success
      </button>
      <button
        type="button"
        onClick={() =>
          onGeometryChange?.({ type: 'Point', coordinates: [-51.25, -3.75] })
        }
      >
        Mock draft geometry
      </button>
    </div>
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

    it('defaults to map view with inline Add Alert creation', () => {
      render(<AlertsScreen />);

      expect(screen.getByTestId('alerts-map')).toHaveAttribute(
        'data-alert-count',
        '1',
      );
      expect(
        screen.getByRole('button', { name: 'Switch to grid view' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Add Alert' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'Add Alert' }),
      ).not.toBeInTheDocument();
    });

    it('opens the canonical alert form in point-only inline mode', async () => {
      const user = userEvent.setup();
      render(<AlertsScreen />);

      await user.click(screen.getByRole('button', { name: 'Add Alert' }));

      expect(
        screen.getByRole('dialog', { name: 'Create Alert' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Close create alert' }),
      ).toBeInTheDocument();
      expect(screen.getByTestId('inline-alert-form')).toHaveAttribute(
        'data-show-map',
        'false',
      );
      expect(screen.getByTestId('inline-alert-form')).toHaveAttribute(
        'data-allowed-types',
        'Point',
      );
      expect(screen.getByTestId('alerts-map')).toHaveAttribute(
        'data-interaction-mode',
        'create-point',
      );
    });

    it('Escape exits inline creation and restores map browsing', async () => {
      const user = userEvent.setup();
      render(<AlertsScreen />);

      await user.click(screen.getByRole('button', { name: 'Add Alert' }));
      await user.keyboard('{Escape}');

      expect(screen.queryByTestId('inline-alert-form')).not.toBeInTheDocument();
      expect(screen.getByTestId('alerts-map')).toHaveAttribute(
        'data-interaction-mode',
        'browse',
      );
    });

    it('lets mobile users hide the sheet to select a map point and restores it afterward', async () => {
      const user = userEvent.setup();
      render(<AlertsScreen />);

      await user.click(screen.getByRole('button', { name: 'Add Alert' }));
      const sheet = screen.getByTestId('inline-alert-sheet');
      expect(sheet).not.toHaveClass('hidden');

      await user.click(screen.getByRole('button', { name: 'Select on map' }));
      expect(sheet).toHaveClass('hidden');
      expect(
        screen.getByText('Tap the map to place the alert point'),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Back to form' }),
      ).toBeInTheDocument();

      await user.click(
        screen.getByRole('button', { name: 'Select inline map point' }),
      );

      expect(sheet).not.toHaveClass('hidden');
      expect(
        screen.getByRole('button', { name: 'Change location on map' }),
      ).toBeInTheDocument();
      expect(screen.getByTestId('inline-alert-form')).toHaveAttribute(
        'data-external-point',
        '-51.25,-3.75',
      );
    });

    it('feeds map point selection into the shared geometry picker and draft map point', async () => {
      const user = userEvent.setup();
      render(<AlertsScreen />);

      await user.click(screen.getByRole('button', { name: 'Add Alert' }));
      await user.click(
        screen.getByRole('button', { name: 'Select inline map point' }),
      );

      expect(screen.getByTestId('inline-alert-form')).toHaveAttribute(
        'data-external-point',
        '-51.25,-3.75',
      );
      await user.click(
        screen.getByRole('button', { name: 'Mock draft geometry' }),
      );
      expect(screen.getByTestId('alerts-map')).toHaveAttribute(
        'data-draft-point',
        '-51.25,-3.75',
      );
    });

    it('cancel exits creation mode and restores normal map interaction', async () => {
      const user = userEvent.setup();
      render(<AlertsScreen />);

      await user.click(screen.getByRole('button', { name: 'Add Alert' }));
      await user.click(
        screen.getByRole('button', { name: 'Select inline map point' }),
      );
      await user.click(
        screen.getByRole('button', { name: 'Mock draft geometry' }),
      );
      await user.click(screen.getByRole('button', { name: 'Mock cancel' }));

      expect(screen.queryByTestId('inline-alert-form')).not.toBeInTheDocument();
      expect(screen.getByTestId('alerts-map')).toHaveAttribute(
        'data-interaction-mode',
        'browse',
      );
      expect(screen.getByTestId('alerts-map')).not.toHaveAttribute(
        'data-draft-point',
      );
    });

    it('successful creation stays on the Alerts map and exits creation mode', async () => {
      const user = userEvent.setup();
      render(<AlertsScreen />);

      await user.click(screen.getByRole('button', { name: 'Add Alert' }));
      await user.click(screen.getByRole('button', { name: 'Mock success' }));

      expect(screen.queryByTestId('inline-alert-form')).not.toBeInTheDocument();
      expect(screen.getByTestId('alerts-map')).toBeInTheDocument();
      expect(screen.getByTestId('alerts-map')).toHaveAttribute(
        'data-interaction-mode',
        'browse',
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

    it('keeps /alerts/new as the grid-view Add Alert path', () => {
      useAlertViewModeStore.setState({ viewMode: 'grid' });
      render(<AlertsScreen />);

      expect(screen.getByRole('link', { name: 'Add Alert' })).toHaveAttribute(
        'href',
        '/alerts/new',
      );
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
