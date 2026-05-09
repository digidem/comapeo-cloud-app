import {
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
} from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactNode } from 'react';

import {
  ShellSlotProvider,
  useShellOverrides,
} from '@/components/layout/shell-slot';
import { useArchiveStatus } from '@/hooks/useArchiveStatus';
import { useProjectCoverage } from '@/hooks/useProjectCoverage';
import { useProjects } from '@/hooks/useProjects';
import type { CalculationResult } from '@/lib/area-calculator/types';
import { HomeScreen } from '@/screens/Home/HomeScreen';

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
  mockUseProjects.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    status: 'success',
  } as unknown as ReturnType<typeof useProjects>);

  mockUseProjectCoverage.mockReturnValue(defaultCoverageState);
  mockUseArchiveStatus.mockReturnValue(defaultArchiveStatus);
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

    const newProjectBtn = await screen.findByRole('button', {
      name: 'Create new project from project list',
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

  it('wires Home topbar workspace, mode, and topbar new project action', async () => {
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

    renderWithShell(<HomeScreen />);

    // Auto-selects the project, so workspace shows project name
    await waitFor(() => {
      expect(screen.getByTestId('shell-workspace')).toHaveTextContent(
        'My Project',
      );
    });
    expect(screen.getByTestId('shell-mode')).toHaveTextContent('Home');

    await user.click(
      screen.getByRole('button', {
        name: 'Create new project from topbar',
      }),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
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

  it('uses the selected unit for both summary and method cards', async () => {
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
    expect(values.length).toBeGreaterThanOrEqual(2);
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

    expect(screen.getByText('Preset')).toBeInTheDocument();
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
});
