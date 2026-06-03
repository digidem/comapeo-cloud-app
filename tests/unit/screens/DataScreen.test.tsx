import { fireEvent, render, screen } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DataScreen } from '@/screens/DataScreen';
import { useViewModeStore } from '@/stores/view-mode-store';

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
let mockCategoryMetadata: {
  categories: unknown[];
  categoryByObservationId: Map<
    string,
    {
      id: string;
      name: string;
      color?: string;
      iconUrl?: string;
      iconDocId?: string;
    }
  >;
  displayNamesByObservationId: Map<string, string>;
} = {
  categories: [],
  categoryByObservationId: new Map(),
  displayNamesByObservationId: new Map(),
};

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

vi.mock('@/hooks/useObservationCategoryMetadata', () => ({
  useObservationCategoryMetadata: vi.fn(() => mockCategoryMetadata),
}));

// Mock AuthImg to avoid needing useAuthenticatedImageUrl in DataScreen tests
vi.mock('@/components/shared/auth-img', () => ({
  AuthImg: ({ src, alt }: { src: string; alt: string }) => (
    <img data-testid="auth-img" src={src} alt={alt} />
  ),
}));

// Mock ExportObservationsButton to avoid real downloads
vi.mock('@/components/shared/ExportObservationsButton', () => ({
  ExportObservationsButton: ({
    disabled,
    observations,
    projectName,
  }: {
    disabled?: boolean;
    observations: unknown[];
    projectName?: string;
  }) => (
    <button
      data-testid="export-observations-button"
      disabled={disabled}
      data-observations-count={observations.length}
      data-project-name={projectName}
    >
      Export
    </button>
  ),
}));

vi.mock('@/components/ui/tabs', () => {
  // Mock Tabs to always render all tab content (Radix hides inactive tabs)
  function TabsMock({
    children,
    value,
  }: {
    children: React.ReactNode;
    defaultValue?: string;
    value?: string;
    onValueChange?: (value: string) => void;
  }) {
    return (
      <div data-testid="tabs" data-value={value}>
        {children}
      </div>
    );
  }
  TabsMock.List = ({
    children,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div>{children}</div>;
  TabsMock.Trigger = ({
    children,
    value,
    onClick,
  }: {
    children: React.ReactNode;
    value: string;
    className?: string;
    onClick?: () => void;
  }) => (
    <button data-testid={`tab-trigger-${value}`} onClick={onClick}>
      {children}
    </button>
  );
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
  ObservationsMap: ({
    categoryByObservationId,
  }: {
    categoryByObservationId?: Map<string, unknown>;
  }) => (
    <div
      data-testid="observations-map"
      data-category-count={categoryByObservationId?.size ?? 0}
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
  mockObservationsQuery = { data: defaultObservations, isPending: false };
  mockAlertsQuery = { data: defaultAlerts, isPending: false };
  mockCategoryMetadata = {
    categories: [],
    categoryByObservationId: new Map(),
    displayNamesByObservationId: new Map(),
  };
  useViewModeStore.setState({ viewMode: 'grid' });
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
      expect(screen.getAllByText('forest').length).toBeGreaterThanOrEqual(1);
    });

    it('renders the matched category icon for observation cards', () => {
      mockObservationsQuery = { data: defaultObservations, isPending: false };
      mockCategoryMetadata = {
        categories: [
          {
            id: 'forest',
            name: 'Forest',
            iconDocId: 'icon-forest',
            iconUrl: '/projects/proj-remote/icon/icon-forest',
          },
        ],
        categoryByObservationId: new Map([
          [
            'obs-1',
            {
              id: 'forest',
              name: 'Forest',
              iconDocId: 'icon-forest',
              iconUrl: '/projects/proj-remote/icon/icon-forest',
            },
          ],
        ]),
        displayNamesByObservationId: new Map([['obs-1', 'Forest']]),
      };

      render(<DataScreen />);

      expect(screen.getByTestId('category-icon')).toBeInTheDocument();
      expect(screen.getByAltText('Forest icon')).toHaveAttribute(
        'src',
        '/projects/proj-remote/icon/icon-forest',
      );
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

    // Regression: commit 81b005e — empty-string tags.category falls back
    it('renders fallback when tags.category is an empty string', () => {
      mockObservationsQuery = {
        data: [
          {
            localId: 'obs-empty-cat',
            projectLocalId: 'proj-1',
            tags: { category: '', notes: 'Empty category' },
            createdAt: '2024-03-14T14:20:00Z',
            updatedAt: '2024-03-14T14:20:00Z',
          },
        ],
        isPending: false,
      };

      render(<DataScreen />);
      expect(screen.getByText('Observation')).toBeInTheDocument();
    });

    it('renders fallback when tags.category is explicitly null', () => {
      mockObservationsQuery = {
        data: [
          {
            localId: 'obs-null-cat',
            projectLocalId: 'proj-1',
            tags: {
              category: null as unknown as string,
              notes: 'Null category',
            },
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
      expect(screen.getAllByText('wildlife').length).toBeGreaterThanOrEqual(1);
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
                  'https://example.com/photo1.jpg,https://example.com/photo2.jpg,https://example.com/photo3.jpg,https://example.com/photo4.jpg',
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

    // ---- Export button ----

    describe('Export button', () => {
      it('renders Export button on observations tab when observations exist', () => {
        mockObservationsQuery = { data: defaultObservations, isPending: false };

        render(<DataScreen />);
        const exportButton = screen.getByTestId('export-observations-button');
        expect(exportButton).toBeInTheDocument();
        expect(exportButton).not.toBeDisabled();
        expect(exportButton).toHaveAttribute('data-observations-count', '2');
        expect(exportButton).toHaveAttribute(
          'data-project-name',
          'Test Project',
        );
      });

      it('disables Export button when no observations', () => {
        mockObservationsQuery = { data: [], isPending: false };

        render(<DataScreen />);
        const exportButton = screen.getByTestId('export-observations-button');
        expect(exportButton).toBeInTheDocument();
        expect(exportButton).toBeDisabled();
        expect(exportButton).toHaveAttribute('data-observations-count', '0');
      });
    });

    // ---- Map/Grid Toggle ----

    describe('map/grid toggle', () => {
      it('shows grid view by default — observations-map absent', () => {
        render(<DataScreen />);
        expect(
          screen.queryByTestId('observations-map'),
        ).not.toBeInTheDocument();
        // Observation card content is present (grid view)
        expect(screen.getAllByText('forest').length).toBeGreaterThanOrEqual(1);
      });

      it('renders the toggle button with accessible label', () => {
        render(<DataScreen />);
        expect(
          screen.getByRole('button', { name: /switch to map view/i }),
        ).toBeInTheDocument();
      });

      it('switches to map view on toggle click', async () => {
        const { userEvent } = await import('@tests/mocks/test-utils');
        const user = userEvent.setup();
        mockCategoryMetadata = {
          categories: [],
          categoryByObservationId: new Map([
            ['obs-1', { id: 'forest', name: 'Forest' }],
          ]),
          displayNamesByObservationId: new Map([['obs-1', 'Forest']]),
        };
        render(<DataScreen />);

        // Initially grid view
        expect(
          screen.queryByTestId('observations-map'),
        ).not.toBeInTheDocument();

        // Click toggle to switch to map
        await user.click(
          screen.getByRole('button', { name: /switch to map view/i }),
        );

        // Map view should be shown
        expect(screen.getByTestId('observations-map')).toBeInTheDocument();
        expect(screen.getByTestId('observations-map')).toHaveAttribute(
          'data-category-count',
          '1',
        );
        // Grid cards should be hidden in map mode — no observation card links
        const obsLinks = screen
          .queryAllByRole('link')
          .filter((el) =>
            el.getAttribute('href')?.includes('/data/observations/'),
          );
        expect(obsLinks).toHaveLength(0);
      });

      it('switches back to grid view on second toggle click', async () => {
        const { userEvent } = await import('@tests/mocks/test-utils');
        const user = userEvent.setup();
        render(<DataScreen />);

        // Toggle to map
        await user.click(
          screen.getByRole('button', { name: /switch to map view/i }),
        );
        expect(screen.getByTestId('observations-map')).toBeInTheDocument();

        // Toggle back to grid
        await user.click(
          screen.getByRole('button', { name: /switch to grid view/i }),
        );
        expect(
          screen.queryByTestId('observations-map'),
        ).not.toBeInTheDocument();
        expect(screen.getAllByText('forest').length).toBeGreaterThanOrEqual(1);
      });
    });

    // ---- Observation filter integration ----

    describe('observation filtering', () => {
      it('renders filter bar when observations exist', () => {
        mockObservationsQuery = { data: defaultObservations, isPending: false };

        render(<DataScreen />);
        expect(screen.getByLabelText('Search')).toBeInTheDocument();
        expect(screen.getByText('2 results')).toBeInTheDocument();
      });

      it('does not render filter bar when observations array is empty', () => {
        mockObservationsQuery = { data: [], isPending: false };

        render(<DataScreen />);
        expect(screen.queryByLabelText('Search')).not.toBeInTheDocument();
        expect(screen.getByText('No observations yet')).toBeInTheDocument();
      });

      it('renders no-results state when search matches nothing', () => {
        mockObservationsQuery = {
          data: [
            {
              localId: 'obs-1',
              projectLocalId: 'proj-1',
              tags: { category: 'forest', notes: 'Deforestation detected' },
              createdAt: '2024-03-15T10:30:00Z',
              updatedAt: '2024-03-15T10:30:00Z',
            },
          ],
          isPending: false,
        };

        render(<DataScreen />);
        const searchInput = screen.getByLabelText('Search');
        fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

        expect(
          screen.getByText('No observations match your filters'),
        ).toBeInTheDocument();
        // "No observations yet" should NOT be shown
        expect(
          screen.queryByText('No observations yet'),
        ).not.toBeInTheDocument();
      });

      it('renders Clear filters button in no-results state', () => {
        mockObservationsQuery = {
          data: [
            {
              localId: 'obs-1',
              projectLocalId: 'proj-1',
              tags: { category: 'forest', notes: 'Deforestation detected' },
              createdAt: '2024-03-15T10:30:00Z',
              updatedAt: '2024-03-15T10:30:00Z',
            },
          ],
          isPending: false,
        };

        render(<DataScreen />);
        const searchInput = screen.getByLabelText('Search');
        fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

        // There are two "Clear filters" — one in filter bar, one in no-results
        const clearButtons = screen.getAllByText('Clear filters');
        expect(clearButtons.length).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
