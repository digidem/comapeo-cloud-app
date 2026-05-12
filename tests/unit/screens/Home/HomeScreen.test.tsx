import {
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from '@tests/mocks/test-utils';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactNode } from 'react';

import {
  ShellSlotProvider,
  useShellOverrides,
} from '@/components/layout/shell-slot';
import { useAlerts } from '@/hooks/useAlerts';
import { useArchiveStatus } from '@/hooks/useArchiveStatus';
import { useObservations } from '@/hooks/useObservations';
import { useProjectCoverage } from '@/hooks/useProjectCoverage';
import { useProjects } from '@/hooks/useProjects';
import type { CalculationResult } from '@/lib/area-calculator/types';
import { HomeScreen } from '@/screens/Home/HomeScreen';
import { useProjectStore } from '@/stores/project-store';

// Renders HomeScreen inside a ShellSlotProvider + a "shell reader" that exposes
// the slot overrides to the DOM so topbar assertions remain possible.
function ShellReader() {
  const {
    topbarWorkspaceName,
    topbarModeLabel,
    topbarActions,
    secondaryContent,
  } = useShellOverrides();
  return (
    <>
      {topbarWorkspaceName && (
        <div data-testid="shell-workspace">{topbarWorkspaceName}</div>
      )}
      {topbarModeLabel && <div data-testid="shell-mode">{topbarModeLabel}</div>}
      {topbarActions && <div data-testid="shell-actions">{topbarActions}</div>}
      {secondaryContent && (
        <div data-testid="shell-secondary">{secondaryContent}</div>
      )}
    </>
  );
}

function renderWithShell(ui: ReactNode) {
  return render(
    <ShellSlotProvider>
      <ShellReader />
      {ui}
    </ShellSlotProvider>,
  );
}

// Mock TanStack Router Link + Outlet
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
      <a href={to}>{children}</a>
    ),
    Outlet: () => null,
    useRouterState: vi.fn().mockReturnValue({ location: { pathname: '/' } }),
  };
});

// Mock hooks
vi.mock('@/hooks/useProjects', () => ({
  useProjects: vi.fn(),
}));

vi.mock('@/hooks/useProjectCoverage', () => ({
  useProjectCoverage: vi.fn(),
}));

vi.mock('@/hooks/useArchiveStatus', () => ({
  useArchiveStatus: vi.fn(),
}));

vi.mock('@/hooks/useObservations', () => ({
  useObservations: vi.fn(),
}));

vi.mock('@/hooks/useAlerts', () => ({
  useAlerts: vi.fn(),
}));

// Mock data-layer createProject
vi.mock('@/lib/data-layer', () => ({
  createProject: vi.fn().mockResolvedValue({ localId: 'new-project-id' }),
  getProjects: vi.fn().mockResolvedValue([]),
  importGeoJsonPoints: vi.fn().mockResolvedValue({ imported: 1, skipped: 0 }),
  syncRemoteArchive: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock geojson-export
vi.mock('@/lib/geojson-export', () => ({
  exportFeatureCollection: vi.fn(),
}));

// Mock sync
vi.mock('@/lib/sync', () => ({
  syncRemoteArchive: vi.fn().mockResolvedValue({ success: true }),
}));

const mockUseProjects = vi.mocked(useProjects);
const mockUseProjectCoverage = vi.mocked(useProjectCoverage);
const mockUseArchiveStatus = vi.mocked(useArchiveStatus);
const mockUseObservations = vi.mocked(useObservations);
const mockUseAlerts = vi.mocked(useAlerts);

const defaultCoverageState = {
  results: [],
  isCalculating: false,
  error: null,
};

const defaultArchiveStatus = {
  servers: [],
  anyError: false,
  anySyncing: false,
};

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();

  // Mock matchMedia to return desktop mode so AreaMap renders sidebar
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(min-width: 1024px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

function makeResult(methodId: string, areaM2: number) {
  return {
    methodId,
    result: {
      id: methodId,
      label: methodId,
      description: methodId,
      areaM2,
      featureCollection: { type: 'FeatureCollection', features: [] },
      previewFeatureCollection: { type: 'FeatureCollection', features: [] },
      metadata: { pointCount: 3 },
    } satisfies CalculationResult,
  };
}

function selectFile(file: File) {
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  Object.defineProperty(input, 'files', {
    value: [file],
    configurable: true,
  });
  fireEvent.change(input);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useProjectStore.setState({ selectedProjectId: null, selectedServerId: null });
  mockUseProjects.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    status: 'success',
  } as unknown as ReturnType<typeof useProjects>);

  mockUseProjectCoverage.mockReturnValue(defaultCoverageState);
  mockUseArchiveStatus.mockReturnValue(defaultArchiveStatus);
  mockUseObservations.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    status: 'success',
  } as unknown as ReturnType<typeof useObservations>);
  mockUseAlerts.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    status: 'success',
  } as unknown as ReturnType<typeof useAlerts>);
});

describe('HomeScreen', () => {
  it('renders without crashing', () => {
    render(<HomeScreen />);
    // Should render the AppShell with some content
    expect(document.body).toBeDefined();
  });

  it('shows "No projects yet" message when there are no projects', () => {
    mockUseProjects.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      status: 'success',
    } as unknown as ReturnType<typeof useProjects>);

    render(<HomeScreen />);
    expect(screen.getAllByText('No projects yet').length).toBeGreaterThan(0);
  });

  it('shows project list when projects exist', async () => {
    mockUseProjects.mockReturnValue({
      data: [
        {
          localId: 'p1',
          name: 'Alpha Project',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
        {
          localId: 'p2',
          name: 'Beta Project',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      status: 'success',
    } as unknown as ReturnType<typeof useProjects>);

    renderWithShell(<HomeScreen />);
    // Project list is in secondary sidebar — wait for shell slot effect to flush
    await waitFor(() => {
      expect(screen.getAllByText('Alpha Project').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText('Beta Project').length).toBeGreaterThan(0);
  });

  it('shows loading skeletons when projects are loading', async () => {
    mockUseProjects.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      status: 'pending',
    } as unknown as ReturnType<typeof useProjects>);

    renderWithShell(<HomeScreen />);
    await waitFor(() => {
      const skeletons = screen.getAllByTestId('skeleton');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  it('opens create dialog when the secondary new project button is clicked', async () => {
    const user = userEvent.setup();

    renderWithShell(<HomeScreen />);

    // In the empty state, ArchiveBrowser shows a \"Create Project\" button
    const newProjectBtn = await screen.findByRole('button', {
      name: 'Create your first project from project list',
    });
    await user.click(newProjectBtn);

    expect(
      screen.getByRole('heading', { name: 'New Project' }),
    ).toBeInTheDocument();
  });

  it('auto-selects the last updated project when projects exist', async () => {
    mockUseProjects.mockReturnValue({
      data: [
        {
          localId: 'p1',
          name: 'Older Project',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
        {
          localId: 'p2',
          name: 'Newer Project',
          updatedAt: '2025-06-01T00:00:00.000Z',
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      status: 'success',
    } as unknown as ReturnType<typeof useProjects>);

    renderWithShell(<HomeScreen />);

    // Should auto-select the most recently updated project (p2)
    await waitFor(() => {
      expect(screen.getByTestId('shell-workspace')).toHaveTextContent(
        'Newer Project',
      );
    });
    // Should NOT show "No projects yet" since a project is auto-selected
    expect(screen.queryByText('No projects yet')).toBeNull();
  });

  it('wires Home topbar workspace and mode labels', async () => {
    mockUseProjects.mockReturnValue({
      data: [
        {
          localId: 'p1',
          name: 'My Project',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      status: 'success',
    } as unknown as ReturnType<typeof useProjects>);

    renderWithShell(<HomeScreen />);

    // Auto-selects the project, so workspace shows project name
    await waitFor(() => {
      expect(screen.getByTestId('shell-workspace')).toHaveTextContent(
        'My Project',
      );
    });
    expect(screen.getByTestId('shell-mode')).toHaveTextContent('Home');
  });

  it('shows a main empty-state new project CTA', async () => {
    const user = userEvent.setup();

    render(<HomeScreen />);

    await user.click(
      screen.getByRole('button', { name: 'Create your first project' }),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows "No mappable coordinates found" when project is selected but no results', async () => {
    const user = userEvent.setup();
    mockUseProjects.mockReturnValue({
      data: [
        {
          localId: 'p1',
          name: 'My Project',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      status: 'success',
    } as unknown as ReturnType<typeof useProjects>);

    mockUseProjectCoverage.mockReturnValue({
      results: [],
      isCalculating: false,
      error: null,
    });

    renderWithShell(<HomeScreen />);

    // Select the project via the secondary sidebar
    await user.click(await screen.findByRole('button', { name: 'My Project' }));

    expect(screen.getByText('No mappable coordinates found')).toBeDefined();
  });

  it('refreshes coverage immediately after a successful import', async () => {
    const user = userEvent.setup();
    mockUseProjects.mockReturnValue({
      data: [
        {
          localId: 'p1',
          name: 'Import Project',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      status: 'success',
    } as unknown as ReturnType<typeof useProjects>);

    renderWithShell(<HomeScreen />);
    await user.click(
      await screen.findByRole('button', { name: 'Import Project' }),
    );

    selectFile(
      new File(['{"type":"FeatureCollection","features":[]}'], 'data.geojson', {
        type: 'application/geo+json',
      }),
    );

    await waitFor(() => {
      expect(mockUseProjectCoverage).toHaveBeenLastCalledWith(
        'p1',
        expect.any(Object),
        1,
      );
    });
  });

  it('applies selected unit to coverage summary', async () => {
    const user = userEvent.setup();
    mockUseProjects.mockReturnValue({
      data: [
        {
          localId: 'p1',
          name: 'Unit Project',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      status: 'success',
    } as unknown as ReturnType<typeof useProjects>);
    mockUseProjectCoverage.mockReturnValue({
      results: [makeResult('observed', 50000)],
      isCalculating: false,
      error: null,
    });

    renderWithShell(<HomeScreen />);
    await user.click(
      await screen.findByRole('button', { name: 'Unit Project' }),
    );
    await user.click(screen.getByRole('button', { name: 'm²' }));

    const values = screen.getAllByText(/50[.,\s]?000/);
    expect(values.length).toBeGreaterThanOrEqual(1);
  });

  it('shows settings when any method has a result', async () => {
    const user = userEvent.setup();
    mockUseProjects.mockReturnValue({
      data: [
        {
          localId: 'p1',
          name: 'Settings Project',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      status: 'success',
    } as unknown as ReturnType<typeof useProjects>);
    mockUseProjectCoverage.mockReturnValue({
      results: [makeResult('grid', 50000)],
      isCalculating: false,
      error: null,
    });

    renderWithShell(<HomeScreen />);
    await user.click(
      await screen.findByRole('button', { name: 'Settings Project' }),
    );

    expect(screen.getByText('Calculation Preset')).toBeInTheDocument();
  });

  it('keeps calculator method controls in the main settings panel only', async () => {
    const user = userEvent.setup();
    mockUseProjects.mockReturnValue({
      data: [
        {
          localId: 'p1',
          name: 'Controls Project',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      status: 'success',
    } as unknown as ReturnType<typeof useProjects>);
    mockUseProjectCoverage.mockReturnValue({
      results: [makeResult('observed', 50000), makeResult('grid', 75000)],
      isCalculating: false,
      error: null,
    });

    renderWithShell(<HomeScreen />);
    await user.click(
      await screen.findByRole('button', { name: 'Controls Project' }),
    );

    expect(
      screen.queryByRole('button', { name: 'Algorithm Options' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Map Layer')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Export map layer' }),
    ).toBeInTheDocument();
  });

  it('uses monitored area language for the section title', async () => {
    const user = userEvent.setup();
    mockUseProjects.mockReturnValue({
      data: [
        {
          localId: 'p1',
          name: 'Monitored Project',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      status: 'success',
    } as unknown as ReturnType<typeof useProjects>);
    mockUseProjectCoverage.mockReturnValue({
      results: [makeResult('observed', 50000)],
      isCalculating: false,
      error: null,
    });

    renderWithShell(<HomeScreen />);
    await user.click(
      await screen.findByRole('button', { name: 'Monitored Project' }),
    );

    expect(
      screen.getByRole('heading', { name: 'Monitored Area' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Area Calculator' }),
    ).not.toBeInTheDocument();
  });

  it('switches the map layer when a focused calculation preset is selected', async () => {
    const user = userEvent.setup();
    mockUseProjects.mockReturnValue({
      data: [
        {
          localId: 'p1',
          name: 'Preset Project',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      status: 'success',
    } as unknown as ReturnType<typeof useProjects>);
    mockUseProjectCoverage.mockReturnValue({
      results: [makeResult('observed', 50000), makeResult('grid', 75000)],
      isCalculating: false,
      error: null,
    });

    renderWithShell(<HomeScreen />);
    await user.click(
      await screen.findByRole('button', { name: 'Preset Project' }),
    );

    const [mapLayerSelect, presetSelect] = screen.getAllByRole('combobox');
    expect(mapLayerSelect).toHaveTextContent('Observed Footprint');

    await user.click(presetSelect!);
    await user.click(screen.getByRole('option', { name: '5 km Grid' }));

    expect(mapLayerSelect).toHaveTextContent('Occupied Grid');
  });

  it('announces calculation progress in an aria-live region', async () => {
    const user = userEvent.setup();
    mockUseProjects.mockReturnValue({
      data: [
        {
          localId: 'p1',
          name: 'Calc Project',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      status: 'success',
    } as unknown as ReturnType<typeof useProjects>);

    mockUseProjectCoverage.mockReturnValue({
      results: [],
      isCalculating: true,
      error: null,
    });

    renderWithShell(<HomeScreen />);
    await user.click(
      await screen.findByRole('button', { name: 'Calc Project' }),
    );

    expect(screen.getByRole('status')).toHaveTextContent('Calculating');
  });

  it('shows coverage summary when project is selected and calculating', async () => {
    const user = userEvent.setup();
    mockUseProjects.mockReturnValue({
      data: [
        {
          localId: 'p1',
          name: 'Calc Project',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      status: 'success',
    } as unknown as ReturnType<typeof useProjects>);

    mockUseProjectCoverage.mockReturnValue({
      results: [],
      isCalculating: true,
      error: null,
    });

    renderWithShell(<HomeScreen />);
    await user.click(
      await screen.findByRole('button', { name: 'Calc Project' }),
    );

    // CoverageSummary renders when isCalculating=true (shows skeleton for area)
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows loading skeletons when projects are loading', async () => {
    mockUseProjects.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      status: 'pending',
    } as unknown as ReturnType<typeof useProjects>);

    renderWithShell(<HomeScreen />);
    await waitFor(() => {
      const skeletons = screen.getAllByTestId('skeleton');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  // Archive browser sidebar tests

  it('shows "Archives" section header in sidebar', async () => {
    renderWithShell(<HomeScreen />);
    await waitFor(() => {
      expect(screen.getByText('Archives')).toBeInTheDocument();
    });
  });

  it('shows "Add Server" button in sidebar', async () => {
    renderWithShell(<HomeScreen />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Add a new archive server' }),
      ).toBeInTheDocument();
    });
  });

  it('clicking "Add Server" opens the dialog', async () => {
    const user = userEvent.setup();
    renderWithShell(<HomeScreen />);

    await user.click(
      await screen.findByRole('button', { name: 'Add a new archive server' }),
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Add Archive Server' }),
    ).toBeInTheDocument();
  });

  it('shows archive tabs grouped by server when projects exist', async () => {
    mockUseProjects.mockReturnValue({
      data: [
        {
          localId: 'p1',
          name: 'Remote Project',
          serverUrl: 'https://archive.test',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      status: 'success',
    } as unknown as ReturnType<typeof useProjects>);

    mockUseArchiveStatus.mockReturnValue({
      servers: [
        {
          id: 's1',
          label: 'Test Server',
          baseUrl: 'https://archive.test',
          isSyncing: false,
          lastSyncedAt: null,
          error: null,
          hasCredentials: true,
        },
      ],
      anyError: false,
      anySyncing: false,
    });

    renderWithShell(<HomeScreen />);
    await waitFor(() => {
      // The archive tab should show the hostname of the server
      expect(screen.getByText('archive.test')).toBeInTheDocument();
    });
    // The remote project should appear in the project list (secondary section)
    const secondarySection = screen.getByTestId('shell-secondary');
    expect(
      within(secondarySection).getByText('Remote Project'),
    ).toBeInTheDocument();
  });

  it('shows empty state when no projects and no servers', async () => {
    mockUseArchiveStatus.mockReturnValue({
      servers: [],
      anyError: false,
      anySyncing: false,
    });

    renderWithShell(<HomeScreen />);

    await waitFor(() => {
      expect(screen.getByText('Archives')).toBeInTheDocument();
    });
    // Should show the empty welcome message instead of status cards
    expect(screen.getByText('Welcome to CoMapeo Cloud')).toBeInTheDocument();
  });
});
