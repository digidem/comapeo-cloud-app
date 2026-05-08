import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useArchiveStatus } from '@/hooks/useArchiveStatus';
import { useProjectCoverage } from '@/hooks/useProjectCoverage';
import { useProjects } from '@/hooks/useProjects';
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

beforeEach(() => {
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
    expect(screen.getByText('No projects yet')).toBeDefined();
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

  it('opens create dialog when "+ New Project" is clicked', async () => {
    const user = userEvent.setup();

    render(<HomeScreen />);

    const newProjectBtn = screen.getByRole('button', { name: '+ New Project' });
    await user.click(newProjectBtn);

    // Dialog title should appear
    expect(screen.getByText('New Project')).toBeDefined();
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
