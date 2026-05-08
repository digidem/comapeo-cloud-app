import {
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
} from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useArchiveStatus } from '@/hooks/useArchiveStatus';
import { useProjectCoverage } from '@/hooks/useProjectCoverage';
import { useProjects } from '@/hooks/useProjects';
import type { CalculationResult } from '@/lib/area-calculator/types';
import { HomeScreen } from '@/screens/Home/HomeScreen';

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

  it('shows project list when projects exist', () => {
    mockUseProjects.mockReturnValue({
      data: [
        { localId: 'p1', name: 'Alpha Project' },
        { localId: 'p2', name: 'Beta Project' },
      ],
      isLoading: false,
      isError: false,
      error: null,
      status: 'success',
    } as unknown as ReturnType<typeof useProjects>);

    render(<HomeScreen />);
    expect(screen.getByText('Alpha Project')).toBeDefined();
    expect(screen.getByText('Beta Project')).toBeDefined();
  });

  it('shows loading skeletons when projects are loading', () => {
    mockUseProjects.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      status: 'pending',
    } as unknown as ReturnType<typeof useProjects>);

    render(<HomeScreen />);
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('opens create dialog when the secondary new project button is clicked', async () => {
    const user = userEvent.setup();

    render(<HomeScreen />);

    const newProjectBtn = screen.getByRole('button', {
      name: 'Create new project from project list',
    });
    await user.click(newProjectBtn);

    expect(
      screen.getByRole('heading', { name: 'New Project' }),
    ).toBeInTheDocument();
  });

  it('shows empty main area with "No projects yet" when no project selected', () => {
    mockUseProjects.mockReturnValue({
      data: [{ localId: 'p1', name: 'My Project' }],
      isLoading: false,
      isError: false,
      error: null,
      status: 'success',
    } as unknown as ReturnType<typeof useProjects>);

    render(<HomeScreen />);

    // No project is selected, so coverage section not shown
    expect(screen.queryByText('No mappable coordinates found')).toBeNull();
  });

  it('wires Home topbar workspace, mode, and topbar new project action', async () => {
    const user = userEvent.setup();
    mockUseProjects.mockReturnValue({
      data: [{ localId: 'p1', name: 'My Project' }],
      isLoading: false,
      isError: false,
      error: null,
      status: 'success',
    } as unknown as ReturnType<typeof useProjects>);

    render(<HomeScreen />);

    expect(screen.getByText('Local Mode')).toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'My Project' }));
    expect(screen.getAllByText('My Project').length).toBeGreaterThan(0);

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
      data: [{ localId: 'p1', name: 'My Project' }],
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

    render(<HomeScreen />);

    // Select the project
    await user.click(screen.getByRole('button', { name: 'My Project' }));

    expect(screen.getByText('No mappable coordinates found')).toBeDefined();
  });

  it('refreshes coverage immediately after a successful import', async () => {
    const user = userEvent.setup();
    mockUseProjects.mockReturnValue({
      data: [{ localId: 'p1', name: 'Import Project' }],
      isLoading: false,
      isError: false,
      error: null,
      status: 'success',
    } as unknown as ReturnType<typeof useProjects>);

    render(<HomeScreen />);
    await user.click(screen.getByRole('button', { name: 'Import Project' }));

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
      data: [{ localId: 'p1', name: 'Unit Project' }],
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

    render(<HomeScreen />);
    await user.click(screen.getByRole('button', { name: 'Unit Project' }));
    await user.click(screen.getByRole('button', { name: 'm²' }));

    const values = screen.getAllByText(/50[.,\s]?000/);
    expect(values.length).toBeGreaterThanOrEqual(2);
  });

  it('shows settings when any method has a result', async () => {
    const user = userEvent.setup();
    mockUseProjects.mockReturnValue({
      data: [{ localId: 'p1', name: 'Settings Project' }],
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

    render(<HomeScreen />);
    await user.click(screen.getByRole('button', { name: 'Settings Project' }));

    expect(screen.getByText('Preset')).toBeInTheDocument();
  });

  it('announces calculation progress in an aria-live region', async () => {
    const user = userEvent.setup();
    mockUseProjects.mockReturnValue({
      data: [{ localId: 'p1', name: 'Calc Project' }],
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

    render(<HomeScreen />);
    await user.click(screen.getByRole('button', { name: 'Calc Project' }));

    expect(screen.getByRole('status')).toHaveTextContent('Calculating');
  });

  it('shows coverage summary when project is selected and calculating', async () => {
    const user = userEvent.setup();
    mockUseProjects.mockReturnValue({
      data: [{ localId: 'p1', name: 'Calc Project' }],
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

    render(<HomeScreen />);
    await user.click(screen.getByRole('button', { name: 'Calc Project' }));

    // CoverageSummary renders when isCalculating=true (shows skeleton for area)
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
