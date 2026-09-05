import type { UserEvent } from '@testing-library/user-event';
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DataScreen } from '@/screens/DataScreen';
import { useViewModeStore } from '@/stores/view-mode-store';

// jsdom ignores media queries, so the desktop/mobile drawer variant is
// controlled through this module-boundary mock instead of a mocked viewport.
const mediaQueryMock = vi.hoisted(() => ({ matches: false }));

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: vi.fn(() => mediaQueryMock.matches),
}));

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

vi.mock('@/hooks/useObservationCategoryMetadata', () => ({
  useObservationCategoryMetadata: vi.fn(() => mockCategoryMetadata),
}));

// Mock AuthImg to avoid needing useAuthenticatedImageUrl in DataScreen tests
vi.mock('@/components/shared/auth-img', () => ({
  AuthImg: ({ src, alt }: { src: string; alt: string }) => (
    <img data-testid="auth-img" src={src} alt={alt} />
  ),
}));

vi.mock('@/components/shared/AddToCaseDialog', () => ({
  AddToCaseDialog: ({
    open,
    sources,
  }: {
    open: boolean;
    sources: Array<{ sourceLocalId: string }>;
  }) => (
    <div
      data-testid="add-to-case-dialog"
      data-open={String(open)}
      data-source-ids={sources.map((source) => source.sourceLocalId).join(',')}
    />
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

vi.mock('@/components/shared/ObservationsMap', () => ({
  ObservationsMap: ({
    categoryByObservationId,
    basemapSwitcherPositionClassName,
    showEmptyState,
  }: {
    categoryByObservationId?: Map<string, unknown>;
    basemapSwitcherPositionClassName?: string;
    showEmptyState?: boolean;
  }) => (
    <div
      data-testid="observations-map"
      data-category-count={categoryByObservationId?.size ?? 0}
      data-basemap-switcher-position={basemapSwitcherPositionClassName}
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
  mockObservationsQuery = { data: defaultObservations, isPending: false };
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
      // eslint-disable-next-line testing-library/no-node-access
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

    it('lets users select multiple observations and add them to a Case', () => {
      mockObservationsQuery = { data: defaultObservations, isPending: false };

      render(<DataScreen />);
      const addButton = screen.getByRole('button', { name: 'Add to case' });
      expect(addButton).toBeDisabled();

      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes).toHaveLength(2);
      fireEvent.click(checkboxes[0]!);
      fireEvent.click(checkboxes[1]!);
      expect(addButton).toBeEnabled();

      fireEvent.click(addButton);
      expect(screen.getByTestId('add-to-case-dialog')).toHaveAttribute(
        'data-open',
        'true',
      );
      expect(screen.getByTestId('add-to-case-dialog')).toHaveAttribute(
        'data-source-ids',
        'obs-1,obs-2',
      );
    });

    it('wraps long observation names instead of truncating', () => {
      mockObservationsQuery = { data: defaultObservations, isPending: false };

      render(<DataScreen />);

      // The observation name span should use word-break classes instead of truncate
      const nameSpans = screen.getAllByText('forest', { selector: 'span' });
      const nameSpan = nameSpans[0];
      expect(nameSpan).toHaveClass('break-words', 'wrap-anywhere');
      expect(nameSpan).not.toHaveClass('truncate');
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

    it('renders observation card with category and date when obs.lat and obs.lon are present', () => {
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
      // Coordinates are no longer shown in the card — only category and date
      expect(screen.getAllByText('water').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText(/-8\.3500/)).not.toBeInTheDocument();
    });

    it('renders observation card without coordinates when obs.lat/obs.lon are undefined', () => {
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

    it('renders Data title', () => {
      render(<DataScreen />);
      expect(screen.getByText('Data')).toBeInTheDocument();
    });

    // ---- Export button ----

    describe('Export button', () => {
      it('renders Export button when observations exist', () => {
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

      it('renders map view by default when viewMode is map', () => {
        useViewModeStore.setState({ viewMode: 'map' });
        mockObservationsQuery = { data: defaultObservations, isPending: false };

        render(<DataScreen />);
        expect(screen.getByTestId('observations-map')).toBeInTheDocument();
      });

      it('shows a loading state over the map while observations are pending', () => {
        useViewModeStore.setState({ viewMode: 'map' });
        mockObservationsQuery = { data: undefined, isPending: true };

        render(<DataScreen />);

        expect(screen.getByTestId('observations-map')).toHaveAttribute(
          'data-show-empty-state',
          'false',
        );
        expect(screen.getByRole('status')).toHaveTextContent('Loading...');
        expect(screen.getByRole('status')).toHaveClass('z-20');
        expect(
          // eslint-disable-next-line testing-library/no-node-access
          screen.getByRole('status').querySelector('.animate-pulse'),
        ).not.toBeNull();
      });

      it('shows an error state over the map when observations fail to load', async () => {
        useViewModeStore.setState({ viewMode: 'map' });
        mockObservationsQuery = {
          data: undefined,
          isPending: false,
          isError: true,
        };

        render(<DataScreen />);

        expect(screen.getByTestId('observations-map')).toHaveAttribute(
          'data-show-empty-state',
          'false',
        );
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Failed to load observations. Please try again.',
        );
        expect(screen.getByRole('alert')).toHaveClass('z-20');

        const gridToggle = screen.getByRole('button', {
          name: /switch to grid view/i,
        });
        // eslint-disable-next-line testing-library/no-node-access
        expect(gridToggle.parentElement).toHaveClass('z-30');

        const { userEvent } = await import('@tests/mocks/test-utils');
        await userEvent.setup().click(gridToggle);
        expect(
          screen.queryByTestId('observations-map'),
        ).not.toBeInTheDocument();
      });

      it('places the layer switcher below the grid toggle and hides map sorting', () => {
        useViewModeStore.setState({ viewMode: 'map' });
        mockObservationsQuery = { data: defaultObservations, isPending: false };

        render(<DataScreen />);

        // Invariant: switcher top (top-[5.75rem] = 92px) must exceed the grid
        // toggle's bottom edge (top-10 = 40px + h-11 = 44px → 84px).
        const gridToggle = screen.getByRole('button', {
          name: /switch to grid view/i,
        });
        // eslint-disable-next-line testing-library/no-node-access
        expect(gridToggle.parentElement).toHaveClass('top-10', 'right-3');
        expect(gridToggle).toHaveClass('h-11');
        expect(screen.getByTestId('observations-map')).toHaveAttribute(
          'data-basemap-switcher-position',
          'top-[5.75rem] right-3',
        );
        expect(
          screen.queryByRole('combobox', { name: 'Sort' }),
        ).not.toBeInTheDocument();
      });

      it('shows grid toggle button in map view and switches to grid on click', async () => {
        const { userEvent } = await import('@tests/mocks/test-utils');
        const user = userEvent.setup();
        useViewModeStore.setState({ viewMode: 'map' });
        mockObservationsQuery = { data: defaultObservations, isPending: false };

        render(<DataScreen />);

        // Grid toggle button should be present in map view
        expect(
          screen.getByRole('button', { name: /switch to grid view/i }),
        ).toBeInTheDocument();

        // Click to switch to grid
        await user.click(
          screen.getByRole('button', { name: /switch to grid view/i }),
        );

        // Grid view should be shown
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

// ---- Map view: compact filter bar + filters drawer ----
//
// jsdom has no layout: `hidden md:block` / `md:hidden` wrappers still render,
// so map-view tests see TWO "Filters" buttons (compact bar in topLeft + the
// mobile button in bottomLeft). Always disambiguate with `within()` slot
// scoping rather than a global getByRole.

function getTopLeftSlot(): HTMLElement {
  // eslint-disable-next-line testing-library/no-node-access
  const slot = document.querySelector('.top-10.left-3.right-\\[4\\.25rem\\]');
  expect(slot).not.toBeNull();
  return slot as HTMLElement;
}

function getBottomLeftSlot(): HTMLElement {
  // eslint-disable-next-line testing-library/no-node-access
  const slot = document.querySelector('.bottom-4.left-4');
  expect(slot).not.toBeNull();
  return slot as HTMLElement;
}

function getCompactFiltersButton() {
  return within(getTopLeftSlot()).getByRole('button', { name: /^Filters/ });
}

// Category metadata that resolves the two default observations to distinct
// category names, so `availableCategories` carries them into the sheet.
function useCategoriesFixture() {
  mockCategoryMetadata = {
    categories: [
      { id: 'forest', name: 'Forest' },
      { id: 'mining', name: 'Mining' },
    ],
    categoryByObservationId: new Map([
      ['obs-1', { id: 'forest', name: 'Forest' }],
      ['obs-2', { id: 'mining', name: 'Mining' }],
    ]),
    displayNamesByObservationId: new Map([
      ['obs-1', 'Forest'],
      ['obs-2', 'Mining'],
    ]),
  };
}

async function applyFilters(
  user: UserEvent,
  filters: { search?: string; categories?: string[] },
) {
  await user.click(getCompactFiltersButton());
  if (filters.search !== undefined) {
    await user.type(screen.getByLabelText('Search'), filters.search);
  }
  if (filters.categories?.length) {
    await user.click(screen.getByRole('button', { name: /Categories/ }));
    for (const category of filters.categories) {
      await user.click(screen.getByRole('checkbox', { name: category }));
    }
  }
  // Radix hides the outer sheet's subtree while the nested category sheet is
  // open, so role queries can't see Apply — query the element directly.
  const outerDialog = screen.getAllByRole('dialog')[0] as HTMLElement;
  fireEvent.click(within(outerDialog).getByText('Show results'));
}

describe('DataScreen map view filters', () => {
  beforeEach(() => {
    resetMocks();
    mockSelectedProjectId = 'proj-1';
    useViewModeStore.setState({ viewMode: 'map' });
    mediaQueryMock.matches = true;
  });

  it('renders the compact filter bar without inline filter inputs on the map line', () => {
    render(<DataScreen />);

    const topLeft = within(getTopLeftSlot());
    expect(
      topLeft.getByRole('button', { name: /^Filters/ }),
    ).toBeInTheDocument();
    expect(topLeft.getByText('2 results')).toBeInTheDocument();
    expect(topLeft.queryByLabelText('Search')).not.toBeInTheDocument();
    expect(topLeft.queryByLabelText('From')).not.toBeInTheDocument();
    expect(topLeft.queryByLabelText('To')).not.toBeInTheDocument();
    expect(
      within(getTopLeftSlot()).queryByText('Filter by category'),
    ).not.toBeInTheDocument();
  });

  it('renders no chips and no badge when nothing is filtered', () => {
    render(<DataScreen />);

    const topLeft = within(getTopLeftSlot());
    expect(
      topLeft.queryByRole('group', { name: 'Active filters' }),
    ).not.toBeInTheDocument();
    expect(topLeft.queryByLabelText(/active filter/)).not.toBeInTheDocument();
  });

  it('opens the right-side drawer when the viewport is ≥ 48rem', async () => {
    const { userEvent } = await import('@tests/mocks/test-utils');
    const user = userEvent.setup();
    render(<DataScreen />);

    await user.click(getCompactFiltersButton());

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('fixed', 'right-0', 'top-0', 'bottom-0');
    expect(dialog).not.toHaveClass('rounded-t-card');
  });

  it('opens the bottom sheet when the viewport is < 48rem', async () => {
    mediaQueryMock.matches = false;
    const { userEvent } = await import('@tests/mocks/test-utils');
    const user = userEvent.setup();
    render(<DataScreen />);

    await user.click(getCompactFiltersButton());

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('fixed', 'bottom-0', 'left-0', 'right-0');
    expect(dialog).toHaveClass('max-h-[85vh]', 'rounded-t-card');
    expect(dialog).not.toHaveClass('top-0');
  });

  it('mounts exactly one filter dialog per render at either viewport', async () => {
    const { userEvent } = await import('@tests/mocks/test-utils');
    const user = userEvent.setup();
    render(<DataScreen />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(getCompactFiltersButton());
    expect(screen.getAllByRole('dialog')).toHaveLength(1);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the drawer on Escape', async () => {
    const { userEvent } = await import('@tests/mocks/test-utils');
    const user = userEvent.setup();
    render(<DataScreen />);

    await user.click(getCompactFiltersButton());
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the drawer on Apply', async () => {
    const { userEvent } = await import('@tests/mocks/test-utils');
    const user = userEvent.setup();
    render(<DataScreen />);

    await user.click(getCompactFiltersButton());
    await user.click(screen.getByRole('button', { name: 'Show results' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the drawer on outside pointer-down', async () => {
    const { userEvent } = await import('@tests/mocks/test-utils');
    const user = userEvent.setup();
    render(<DataScreen />);

    await user.click(getCompactFiltersButton());
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Radix attaches the outside-pointer-down listener on a timeout and marks
    // body pointer-events:none, so dispatch the pointer event directly.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows one chip per active filter dimension and a dimension-count badge', async () => {
    const { userEvent } = await import('@tests/mocks/test-utils');
    const user = userEvent.setup();
    useCategoriesFixture();
    render(<DataScreen />);

    // search (1 dimension) + categories (1 dimension) = 2; extra selected
    // categories surface as their own chips, not as extra badge count.
    await applyFilters(user, {
      search: 'forest',
      categories: ['Forest', 'Mining'],
    });

    const topLeft = within(getTopLeftSlot());
    expect(topLeft.getByText('Search: forest')).toBeInTheDocument();
    expect(topLeft.getByText('Category: Forest')).toBeInTheDocument();
    expect(topLeft.getByText('Category: Mining')).toBeInTheDocument();
    expect(topLeft.getByLabelText('2 active filters')).toHaveTextContent('2');
  });

  it('renders date chips with raw ISO dates and clears them via the setters', async () => {
    const { userEvent } = await import('@tests/mocks/test-utils');
    const user = userEvent.setup();
    render(<DataScreen />);

    await user.click(getCompactFiltersButton());
    await user.type(screen.getByLabelText('From'), '2024-03-01');
    await user.type(screen.getByLabelText('To'), '2024-03-31');
    fireEvent.click(screen.getByRole('button', { name: 'Show results' }));

    const topLeft = within(getTopLeftSlot());
    expect(topLeft.getByText('From: 2024-03-01')).toBeInTheDocument();
    expect(topLeft.getByText('To: 2024-03-31')).toBeInTheDocument();

    await user.click(
      topLeft.getByRole('button', { name: 'Remove filter: From: 2024-03-01' }),
    );
    expect(topLeft.queryByText('From: 2024-03-01')).not.toBeInTheDocument();
    expect(topLeft.getByText('To: 2024-03-31')).toBeInTheDocument();
    // Chip dismissal never opens the sheet
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('removes exactly the selected category when a category chip is dismissed', async () => {
    const { userEvent } = await import('@tests/mocks/test-utils');
    const user = userEvent.setup();
    useCategoriesFixture();
    render(<DataScreen />);

    await applyFilters(user, { categories: ['Forest', 'Mining'] });

    const topLeft = within(getTopLeftSlot());
    await user.click(
      topLeft.getByRole('button', { name: 'Remove filter: Category: Forest' }),
    );

    expect(topLeft.queryByText('Category: Forest')).not.toBeInTheDocument();
    expect(topLeft.getByText('Category: Mining')).toBeInTheDocument();
    // The drawer stays closed after a chip dismissal
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps category selection inside the drawer for the right variant', async () => {
    const { userEvent } = await import('@tests/mocks/test-utils');
    const user = userEvent.setup();
    render(<DataScreen />);

    await user.click(getCompactFiltersButton());
    await user.click(screen.getByRole('button', { name: /Categories/ }));

    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs).toHaveLength(2);
    const categoryContent = dialogs[1] as HTMLElement;
    expect(categoryContent).toHaveClass('absolute', 'inset-0');
    expect(categoryContent).not.toHaveClass('fixed');

    // In-drawer dim layer below the category content (no viewport-fixed layer)
    // eslint-disable-next-line testing-library/no-node-access
    const overlays = (dialogs[0] as HTMLElement).querySelectorAll(
      '[data-category-sheet-overlay]',
    );
    expect(overlays).toHaveLength(1);
    expect((overlays[0] as HTMLElement).style.position).toBe('absolute');
  });

  it('keeps the full filter bar in desktop grid view', () => {
    useViewModeStore.setState({ viewMode: 'grid' });
    mediaQueryMock.matches = true;
    useCategoriesFixture();

    render(<DataScreen />);

    expect(screen.getByLabelText('Search')).toBeInTheDocument();
    expect(screen.getByLabelText('From')).toBeInTheDocument();
    expect(screen.getByLabelText('To')).toBeInTheDocument();
    // Category selection stays inline in grid view (only the map view moved
    // it inside the drawer).
    const categoryGroup = screen.getByRole('group', {
      name: 'Filter by category',
    });
    expect(
      within(categoryGroup).getByRole('button', { name: 'Forest' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('observations-map')).not.toBeInTheDocument();
  });

  it('keeps the mobile map Filters button with its result-count badge and bottom sheet', async () => {
    mediaQueryMock.matches = false;
    const { userEvent } = await import('@tests/mocks/test-utils');
    const user = userEvent.setup();
    render(<DataScreen />);

    // Search 'forest' matches 1 of 2 observations
    await applyFilters(user, { search: 'forest' });

    const bottomLeft = within(getBottomLeftSlot());
    const mobileButton = bottomLeft.getByRole('button', { name: /^Filters/ });
    expect(within(mobileButton).getByText('1')).toBeInTheDocument();

    await user.click(mobileButton);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('max-h-[85vh]', 'rounded-t-card');
    expect(dialog).not.toHaveClass('top-0');
  });
});
