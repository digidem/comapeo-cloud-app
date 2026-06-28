import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { AlertDetailScreen } from '@/screens/AlertDetailScreen';

let mockAlertId = 'alert-1';
let mockAlertsData: unknown[] = [
  {
    localId: 'alert-1',
    projectLocalId: 'proj-1',
    geometry: { type: 'Point', coordinates: [102.0, 0.5] },
    metadata: { severity: 'high', alert_type: 'deforestation' },
    detectionDateStart: '2026-01-01T00:00:00Z',
    detectionDateEnd: '2026-01-31T00:00:00Z',
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
];
let mockAlertsIsPending = false;

vi.mock('@/components/shared/MapContainer', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-map">{children}</div>
  ),
}));

vi.mock('react-map-gl/maplibre', () => ({
  Marker: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-marker">{children}</div>
  ),
}));

vi.mock('@/components/layout/shell-slot', () => ({
  useShellSlot: vi.fn(),
}));

vi.mock('@/hooks/useAlerts', () => ({
  useAlerts: vi.fn(() => ({
    data: mockAlertsData,
    isPending: mockAlertsIsPending,
    error: null,
  })),
}));

vi.mock('@/hooks/useProjects', () => ({
  useProjects: vi.fn(() => ({
    data: [{ localId: 'proj-1', name: 'Test Project' }],
    isPending: false,
  })),
}));

vi.mock('@/stores/project-store', () => ({
  useProjectStore: vi.fn(
    (selector: (s: { selectedProjectId: string | null }) => string | null) =>
      selector({ selectedProjectId: 'proj-1' }),
  ),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    className,
    to,
  }: {
    children: React.ReactNode;
    className?: string;
    to: string;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  useParams: () => ({ alertId: mockAlertId }),
}));

function resetMocks() {
  mockAlertId = 'alert-1';
  mockAlertsData = [
    {
      localId: 'alert-1',
      projectLocalId: 'proj-1',
      geometry: { type: 'Point', coordinates: [102.0, 0.5] },
      metadata: { severity: 'high', alert_type: 'deforestation' },
      detectionDateStart: '2026-01-01T00:00:00Z',
      detectionDateEnd: '2026-01-31T00:00:00Z',
      createdAt: '2026-01-15T00:00:00Z',
      updatedAt: '2026-01-15T00:00:00Z',
    },
  ];
  mockAlertsIsPending = false;
}

describe('AlertDetailScreen', () => {
  it('renders alert title when alert_type is present', () => {
    resetMocks();
    render(<AlertDetailScreen />);
    // alert_type: 'deforestation' appears as the h1 title
    expect(
      screen.getByRole('heading', { level: 1, name: 'deforestation' }),
    ).toBeInTheDocument();
  });

  it('renders severity badge', () => {
    resetMocks();
    render(<AlertDetailScreen />);
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('renders location section with map', () => {
    resetMocks();
    render(<AlertDetailScreen />);
    expect(screen.getByTestId('mock-map')).toBeInTheDocument();
    expect(screen.getByTestId('mock-marker')).toBeInTheDocument();
  });

  it('renders details section', () => {
    resetMocks();
    render(<AlertDetailScreen />);
    expect(screen.getByText('Details')).toBeInTheDocument();
  });

  it('renders coordinates when geometry is a Point', () => {
    resetMocks();
    render(<AlertDetailScreen />);
    expect(screen.getByText(/0\.500000/)).toBeInTheDocument();
    expect(screen.getByText(/102\.000000/)).toBeInTheDocument();
  });

  it('renders arrow back link to alerts', () => {
    resetMocks();
    render(<AlertDetailScreen />);
    const link = screen.getByRole('link', { name: 'Alerts' });
    expect(link).toHaveAttribute('href', '/alerts');
    expect(link).toHaveClass('min-h-[44px]');
    expect(screen.queryByText('Back to Alerts')).not.toBeInTheDocument();
  });

  it('renders detection period', () => {
    resetMocks();
    render(<AlertDetailScreen />);
    expect(screen.getByText('Detection Period')).toBeInTheDocument();
  });

  it('renders "Alert not found" when alert ID does not match any alert', () => {
    resetMocks();
    mockAlertId = 'nonexistent';
    render(<AlertDetailScreen />);
    expect(screen.getByText('Alert not found')).toBeInTheDocument();
  });

  it('renders loading state when useAlerts returns isPending true', () => {
    resetMocks();
    mockAlertsIsPending = true;
    mockAlertsData = [];
    render(<AlertDetailScreen />);
    // Skeleton renders with animate-pulse
    const skeletons = document.querySelectorAll(
      '[class*="animate-pulse"], [class*="bg-muted"]',
    );
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders "No location data" when alert has no geometry', () => {
    resetMocks();
    mockAlertsData = [
      {
        localId: 'alert-1',
        projectLocalId: 'proj-1',
        geometry: undefined,
        metadata: { severity: 'high', alert_type: 'deforestation' },
        createdAt: '2026-01-15T00:00:00Z',
        updatedAt: '2026-01-15T00:00:00Z',
      },
    ];
    render(<AlertDetailScreen />);
    expect(screen.getByText('No location data')).toBeInTheDocument();
  });

  it('renders alert without additional info section when metadata is null', () => {
    resetMocks();
    mockAlertsData = [
      {
        localId: 'alert-1',
        projectLocalId: 'proj-1',
        geometry: { type: 'Point', coordinates: [0, 0] },
        metadata: null,
        createdAt: '2026-01-15T00:00:00Z',
        updatedAt: '2026-01-15T00:00:00Z',
      },
    ];
    render(<AlertDetailScreen />);
    // Additional Info card should NOT be rendered
    expect(screen.queryByText('Additional Info')).not.toBeInTheDocument();
  });

  it('renders alert without detection dates when optional fields are missing', () => {
    resetMocks();
    mockAlertsData = [
      {
        localId: 'alert-1',
        projectLocalId: 'proj-1',
        geometry: { type: 'Point', coordinates: [0, 0] },
        metadata: { severity: 'high', alert_type: 'deforestation' },
        detectionDateStart: undefined,
        detectionDateEnd: undefined,
        createdAt: '2026-01-15T00:00:00Z',
        updatedAt: '2026-01-15T00:00:00Z',
      },
    ];
    render(<AlertDetailScreen />);
    // Detection Period should NOT be rendered
    expect(screen.queryByText('Detection Period')).not.toBeInTheDocument();
  });

  it('renders severity badge for alert', () => {
    resetMocks();
    render(<AlertDetailScreen />);
    const badges = screen.getAllByText('High');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });
});
