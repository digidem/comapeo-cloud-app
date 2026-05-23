import { render, screen } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DataScreen } from '@/screens/DataScreen';

// --- Shared mock factories ---

type ObservationMock = {
  localId: string;
  projectLocalId: string;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  createdAt: string;
  updatedAt: string;
};

const defaultProjects = [
  { localId: 'proj-1', name: 'Test Project' },
  { localId: 'proj-2', name: 'Another Project' },
];

const defaultObservations: ObservationMock[] = [
  {
    localId: 'obs-1',
    projectLocalId: 'proj-1',
    tags: { category: 'forest', notes: 'Deforestation detected' },
    lat: -8.35,
    lon: -55.45,
    createdAt: '2024-03-15T10:30:00Z',
    updatedAt: '2024-03-15T10:30:00Z',
  },
  {
    localId: 'obs-2',
    projectLocalId: 'proj-1',
    tags: { notes: 'No category' },
    createdAt: '2024-03-14T14:20:00Z',
    updatedAt: '2024-03-14T14:20:00Z',
  },
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
  isError?: boolean;
} = { data: defaultProjects, isPending: false };
let mockObservationsQuery: {
  data?: ObservationMock[];
  isPending: boolean;
  isError?: boolean;
} = { data: defaultObservations, isPending: false };
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

vi.mock('@/hooks/useObservations', () => ({
  useObservations: vi.fn(() => mockObservationsQuery),
}));

vi.mock('@/hooks/useAlerts', () => ({
  useAlerts: vi.fn(() => mockAlertsQuery),
}));

// Mock AuthImg to avoid needing useAuthenticatedImageUrl in DataScreen tests
vi.mock('@/components/shared/auth-img', () => ({
  AuthImg: ({ src, alt }: { src: string; alt: string }) => (
    <img data-testid="auth-img" src={src} alt={alt} />
  ),
}));

vi.mock('@/components/ui/tabs', () => {
  // Mock Tabs to always render all tab content (Radix hides inactive tabs)
  function TabsMock({
    children,
  }: {
    children: React.ReactNode;
    defaultValue?: string;
  }) {
    return <div>{children}</div>;
  }
  TabsMock.List = ({
    children,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div>{children}</div>;
  TabsMock.Trigger = ({
    children,
  }: {
    children: React.ReactNode;
    value: string;
    className?: string;
  }) => <button>{children}</button>;
  TabsMock.Content = ({
    children,
  }: {
    children: React.ReactNode;
    value: string;
    className?: string;
  }) => <div>{children}</div>;
  return {
    Tabs: TabsMock,
    TabsList: TabsMock.List,
    TabsTrigger: TabsMock.Trigger,
    TabsContent: TabsMock.Content,
  };
});

vi.mock('@/components/shared/ObservationsMap', () => ({
  ObservationsMap: () => <div data-testid="observations-map" />,
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
  mockObservationsQuery = { data: defaultObservations, isPending: false };
  mockAlertsQuery = { data: defaultAlerts, isPending: false };
}

describe('DataScreen', () => {
  // ---- No project selected ----

  describe('when no project is selected', () => {
    it('renders loading skeleton when projectsQuery is pending and no selectedProjectId', () => {
      resetMocks();
      mockSelectedProjectId = null;
      mockProjectsQuery = { data: undefined, isPending: true };

      render(<DataScreen />);
      const skeletons = document.querySelectorAll(
        '[class*="animate-pulse"], [class*="bg-muted"]',
      );
      expect(skeletons.length).toBeGreaterThanOrEqual(1);
    });

    it('renders "Select a project" empty state with link to Home when projects loaded but no project selected', () => {
      resetMocks();
      mockSelectedProjectId = null;
      mockProjectsQuery = { data: defaultProjects, isPending: false };

      render(<DataScreen />);
      expect(
        screen.getByText('Select a project from Home to view data'),
      ).toBeInTheDocument();
      expect(screen.getByText('Go to Home')).toBeInTheDocument();
    });
  });

  // ---- Project selected, observations ----

  describe('when a project is selected', () => {
    beforeEach(() => {
      resetMocks();
      mockSelectedProjectId = 'proj-1';
    });

    it('renders observations loading state when observationsQuery is pending', () => {
      mockObservationsQuery = { data: undefined, isPending: true };

      render(<DataScreen />);
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('renders observations error state before empty state', () => {
      mockObservationsQuery = { data: [], isPending: false, isError: true };

      render(<DataScreen />);
      expect(
        screen.getByText('Failed to load observations. Please try again.'),
      ).toBeInTheDocument();
      expect(screen.queryByText('No observations yet')).not.toBeInTheDocument();
    });

    it('renders "No observations yet" when observations array is empty', () => {
      mockObservationsQuery = { data: [], isPending: false };

      render(<DataScreen />);
      expect(screen.getByText('No observations yet')).toBeInTheDocument();
    });

    it('renders observation cards with category when observations have tags.category', () => {
      mockObservationsQuery = { data: defaultObservations, isPending: false };

      render(<DataScreen />);
      expect(screen.getByText('forest')).toBeInTheDocument();
    });

    it('renders observation cards with fallback label when tags.category is missing', () => {
      mockObservationsQuery = {
        data: [
          {
            localId: 'obs-no-cat',
            projectLocalId: 'proj-1',
            tags: { notes: 'Something' },
            createdAt: '2024-03-14T14:20:00Z',
            updatedAt: '2024-03-14T14:20:00Z',
          },
        ],
        isPending: false,
      };

      render(<DataScreen />);
      expect(screen.getByText('Observation')).toBeInTheDocument();
    });

    it('renders coordinates when obs.lat and obs.lon are present', () => {
      mockObservationsQuery = {
        data: [
          {
            localId: 'obs-coords',
            projectLocalId: 'proj-1',
            tags: { category: 'water', notes: 'Water quality test' },
            lat: -8.35,
            lon: -55.45,
            createdAt: '2024-03-15T10:30:00Z',
            updatedAt: '2024-03-15T10:30:00Z',
          },
        ],
        isPending: false,
      };

      render(<DataScreen />);
      expect(screen.getByText(/-8\.3500/)).toBeInTheDocument();
      expect(screen.getByText(/-55\.4500/)).toBeInTheDocument();
    });

    it('omits coordinates when obs.lat/obs.lon are undefined', () => {
      mockObservationsQuery = {
        data: [
          {
            localId: 'obs-no-coords',
            projectLocalId: 'proj-1',
            tags: { category: 'wildlife', notes: 'Wildlife sighting' },
            createdAt: '2024-03-13T09:00:00Z',
            updatedAt: '2024-03-13T09:00:00Z',
          },
        ],
        isPending: false,
      };

      render(<DataScreen />);
      expect(screen.getByText('wildlife')).toBeInTheDocument();
      // No coordinate text should be present
      expect(screen.queryByText(/-8\./)).not.toBeInTheDocument();
    });

    // ---- MediaPreview integration ----

    describe('media preview in observation cards', () => {
      it('renders photo thumbnails when observation has photoUrls in tags', () => {
        mockObservationsQuery = {
          data: [
            {
              localId: 'obs-photos',
              projectLocalId: 'proj-1',
              tags: {
                category: 'forest',
                photoUrls:
                  'https://example.com/photo1.jpg,https://example.com/photo2.jpg',
              },
              createdAt: '2024-03-15T10:30:00Z',
              updatedAt: '2024-03-15T10:30:00Z',
            },
          ],
          isPending: false,
        };

        render(<DataScreen />);
        const authImgs = screen.getAllByTestId('auth-img');
        expect(authImgs).toHaveLength(2);
        expect(authImgs[0]).toHaveAttribute(
          'src',
          'https://example.com/photo1.jpg',
        );
        expect(authImgs[1]).toHaveAttribute(
          'src',
          'https://example.com/photo2.jpg',
        );
      });

      it('renders audio icon when observation has audioCount in tags', () => {
        mockObservationsQuery = {
          data: [
            {
              localId: 'obs-audio',
              projectLocalId: 'proj-1',
              tags: { category: 'forest', audioCount: '2' },
              createdAt: '2024-03-15T10:30:00Z',
              updatedAt: '2024-03-15T10:30:00Z',
            },
          ],
          isPending: false,
        };

        render(<DataScreen />);
        expect(screen.getByTestId('audio-icon')).toBeInTheDocument();
      });

      it('renders "+N more" text when total media exceeds visible slots', () => {
        mockObservationsQuery = {
          data: [
            {
              localId: 'obs-many',
              projectLocalId: 'proj-1',
              tags: {
                category: 'forest',
                photoUrls:
                  'https://example.com/photo1.jpg,https://example.com/photo2.jpg,https://example.com/photo3.jpg',
              },
              createdAt: '2024-03-15T10:30:00Z',
              updatedAt: '2024-03-15T10:30:00Z',
            },
          ],
          isPending: false,
        };

        render(<DataScreen />);
        expect(screen.getByText('+1 more')).toBeInTheDocument();
      });

      it('does not render media preview when observation has no media tags', () => {
        mockObservationsQuery = {
          data: [
            {
              localId: 'obs-no-media',
              projectLocalId: 'proj-1',
              tags: { category: 'forest', notes: 'No media' },
              createdAt: '2024-03-15T10:30:00Z',
              updatedAt: '2024-03-15T10:30:00Z',
            },
          ],
          isPending: false,
        };

        render(<DataScreen />);
        expect(screen.queryByTestId('auth-img')).not.toBeInTheDocument();
        expect(screen.queryByTestId('audio-icon')).not.toBeInTheDocument();
        expect(screen.queryByText(/more/)).not.toBeInTheDocument();
      });
    });

    // ---- Alerts tab ----

    it('renders alerts loading state when alertsQuery is pending', () => {
      mockAlertsQuery = { data: undefined, isPending: true };
      mockObservationsQuery = { data: [], isPending: false };

      render(<DataScreen />);
      // Both tabs render content with mocked Tabs; observations is empty, alerts is loading
      const loadingTexts = screen.getAllByText('Loading...');
      expect(loadingTexts.length).toBeGreaterThanOrEqual(1);
    });

    it('renders alerts error state before empty state', () => {
      mockAlertsQuery = { data: [], isPending: false, isError: true };
      mockObservationsQuery = { data: [], isPending: false };

      render(<DataScreen />);
      expect(
        screen.getByText('Failed to load alerts. Please try again.'),
      ).toBeInTheDocument();
      expect(screen.queryByText('No alerts yet')).not.toBeInTheDocument();
    });

    it('renders "No alerts yet" when alerts array is empty', () => {
      mockAlertsQuery = { data: [], isPending: false };
      mockObservationsQuery = { data: [], isPending: false };

      render(<DataScreen />);
      expect(screen.getByText('No alerts yet')).toBeInTheDocument();
    });

    it('renders alert cards when alerts exist', () => {
      mockAlertsQuery = { data: defaultAlerts, isPending: false };
      mockObservationsQuery = { data: [], isPending: false };

      render(<DataScreen />);
      // The alert card renders the alert_type badge
      expect(screen.getByText('deforestation')).toBeInTheDocument();
    });

    it('renders the Add Alert link', () => {
      render(<DataScreen />);
      expect(screen.getByText('Add Alert')).toBeInTheDocument();
    });

    it('renders Data title', () => {
      render(<DataScreen />);
      expect(screen.getByText('Data')).toBeInTheDocument();
    });

    // ---- Map/Grid Toggle ----

    describe('map/grid toggle', () => {
      it('shows grid view by default — observations-map absent', () => {
        render(<DataScreen />);
        expect(
          screen.queryByTestId('observations-map'),
        ).not.toBeInTheDocument();
        // Observation card content is present (grid view)
        expect(screen.getByText('forest')).toBeInTheDocument();
      });

      it('renders the toggle button with accessible label', () => {
        render(<DataScreen />);
        expect(
          screen.getByRole('button', { name: /toggle map and grid view/i }),
        ).toBeInTheDocument();
      });

      it('switches to map view on toggle click', async () => {
        const { userEvent } = await import('@tests/mocks/test-utils');
        const user = userEvent.setup();
        render(<DataScreen />);

        // Initially grid view
        expect(
          screen.queryByTestId('observations-map'),
        ).not.toBeInTheDocument();

        // Click toggle to switch to map
        await user.click(
          screen.getByRole('button', { name: /toggle map and grid view/i }),
        );

        // Map view should be shown
        expect(screen.getByTestId('observations-map')).toBeInTheDocument();
        // Grid cards should be hidden (no 'forest' category text visible)
        expect(screen.queryByText('forest')).not.toBeInTheDocument();
      });

      it('switches back to grid view on second toggle click', async () => {
        const { userEvent } = await import('@tests/mocks/test-utils');
        const user = userEvent.setup();
        render(<DataScreen />);

        // Toggle to map
        await user.click(
          screen.getByRole('button', { name: /toggle map and grid view/i }),
        );
        expect(screen.getByTestId('observations-map')).toBeInTheDocument();

        // Toggle back to grid
        await user.click(
          screen.getByRole('button', { name: /toggle map and grid view/i }),
        );
        expect(
          screen.queryByTestId('observations-map'),
        ).not.toBeInTheDocument();
        expect(screen.getByText('forest')).toBeInTheDocument();
      });
    });
  });
});
