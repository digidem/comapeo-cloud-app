import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { AlertDetailScreen } from '@/screens/AlertDetailScreen';

let mockAlertId = 'alert-1';
let mockAlertsData: unknown[] = [
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
];
let mockAlertsIsPending = false;

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
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
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
      metadata: { severity: 'high' },
      detectionDateStart: '2026-01-01T00:00:00Z',
      detectionDateEnd: '2026-01-31T00:00:00Z',
      createdAt: '2026-01-15T00:00:00Z',
      updatedAt: '2026-01-15T00:00:00Z',
    },
  ];
  mockAlertsIsPending = false;
}

describe('AlertDetailScreen', () => {
  it('renders alert title', () => {
    resetMocks();
    render(<AlertDetailScreen />);
    expect(screen.getByText('Alert')).toBeInTheDocument();
  });

  it('renders geometry section', () => {
    resetMocks();
    render(<AlertDetailScreen />);
    expect(screen.getByText('Geometry')).toBeInTheDocument();
  });

  it('renders metadata section', () => {
    resetMocks();
    render(<AlertDetailScreen />);
    expect(screen.getByText('Metadata')).toBeInTheDocument();
  });

  it('renders back link', () => {
    resetMocks();
    render(<AlertDetailScreen />);
    expect(screen.getByText('Back to Data')).toBeInTheDocument();
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

  it('renders "No geometry" when alert has no geometry', () => {
    resetMocks();
    mockAlertsData = [
      {
        localId: 'alert-1',
        projectLocalId: 'proj-1',
        geometry: undefined,
        metadata: { severity: 'high' },
        createdAt: '2026-01-15T00:00:00Z',
        updatedAt: '2026-01-15T00:00:00Z',
      },
    ];
    render(<AlertDetailScreen />);
    expect(screen.getByText('No geometry')).toBeInTheDocument();
  });

  it('renders alert without metadata section when metadata is null', () => {
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
    // Metadata card should NOT be rendered
    expect(screen.queryByText('Metadata')).not.toBeInTheDocument();
  });

  it('renders alert without detection dates when optional fields are missing', () => {
    resetMocks();
    mockAlertsData = [
      {
        localId: 'alert-1',
        projectLocalId: 'proj-1',
        geometry: { type: 'Point', coordinates: [0, 0] },
        metadata: { severity: 'high' },
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
});
