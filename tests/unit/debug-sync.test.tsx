import { render, waitFor } from '@tests/mocks/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useProjects } from '@/hooks/useProjects';
import { HomeScreen } from '@/screens/Home/HomeScreen';
import { useProjectStore } from '@/stores/project-store';

vi.mock('@/hooks/useProjects', () => ({
  useProjects: vi.fn(),
}));

vi.mock('@/hooks/useProjectCoverage', () => ({
  useProjectCoverage: vi.fn().mockReturnValue({
    results: [],
    isCalculating: false,
    error: null,
  }),
}));

vi.mock('@/hooks/useArchiveStatus', () => ({
  useArchiveStatus: vi.fn().mockReturnValue({
    servers: [],
    anyError: false,
    anySyncing: false,
  }),
}));

vi.mock('@/hooks/useObservations', () => ({
  useObservations: vi.fn().mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    status: 'success',
  }),
}));

vi.mock('@/hooks/useAlerts', () => ({
  useAlerts: vi.fn().mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    status: 'success',
  }),
}));

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

vi.mock('@/components/shared/auth-img', () => ({
  AuthImg: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
}));

const mockUseProjects = vi.mocked(useProjects);

describe('debug-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useProjectStore.setState({
      selectedProjectId: null,
      selectedServerId: null,
    });
    mockUseProjects.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      status: 'success',
    } as unknown as ReturnType<typeof useProjects>);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('reads store value before first render', async () => {
    // Set store BEFORE render
    useProjectStore.setState({
      selectedProjectId: 'p1',
      selectedServerId: null,
    });

    // Verify store state before render
    expect(useProjectStore.getState().selectedProjectId).toBe('p1');

    mockUseProjects.mockReturnValue({
      data: [
        {
          localId: 'p1',
          name: 'First Project',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
        {
          localId: 'p2',
          name: 'Second Project',
          updatedAt: '2025-06-01T00:00:00.000Z',
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      status: 'success',
    } as unknown as ReturnType<typeof useProjects>);

    render(<HomeScreen />);

    // If Effect 2 works: should show 'First Project' (from store)
    // If only auto-select: should show 'Second Project' (most recent)
    await waitFor(() => {
      // Just check that body has content — see what renders
      expect(document.body.textContent).toContain('Project');
    });

    // Debug: log what's in the document
    console.log('BODY TEXT:', document.body.textContent?.substring(0, 500));
  });
});
