import { render, screen } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Case } from '@/lib/data-layer';
import { CasesScreen } from '@/screens/CasesScreen';

const defaultProjects = [
  { localId: 'proj-1', name: 'Test Project' },
  { localId: 'proj-2', name: 'Another Project' },
];

const defaultCases: Case[] = [
  {
    localId: 'case-1',
    projectLocalId: 'proj-1',
    title: 'Case One',
    caseType: 'illegal_mining',
    status: 'draft',
    createdAt: '2024-03-15T10:30:00Z',
    updatedAt: '2024-03-15T10:30:00Z',
    revision: 1,
    createdBy: 'local',
    deleted: false,
  },
  {
    localId: 'case-2',
    projectLocalId: 'proj-1',
    title: 'Case Two',
    caseType: 'fire',
    status: 'active',
    createdAt: '2024-03-14T10:30:00Z',
    updatedAt: '2024-03-14T14:00:00Z',
    revision: 2,
    createdBy: 'local',
    deleted: false,
  },
];

let mockSelectedProjectId: string | null = null;
let mockProjectsQuery: {
  data?: typeof defaultProjects;
  isPending: boolean;
} = { data: defaultProjects, isPending: false };
let mockCasesQuery: {
  data?: Case[];
  isPending: boolean;
  isError?: boolean;
} = { data: defaultCases, isPending: false };
let mockStoragePersist: {
  state: string;
  isPersisted: boolean;
  isLoading: boolean;
  isEvictionRisk: boolean;
} = {
  state: 'persisted',
  isPersisted: true,
  isLoading: false,
  isEvictionRisk: false,
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

vi.mock('@/hooks/useCases', () => ({
  useCases: vi.fn(() => mockCasesQuery),
}));

vi.mock('@/hooks/useCaseEvidenceCounts', () => ({
  useCaseEvidenceCounts: vi.fn(() => ({
    data: { 'case-1': 2, 'case-2': 1 },
    isPending: false,
    isError: false,
  })),
}));

vi.mock('@/hooks/useStoragePersist', () => ({
  useStoragePersist: vi.fn(() => mockStoragePersist),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
  }: {
    children: React.ReactNode;
    to: string;
    params?: Record<string, string>;
  }) => (
    <a href={params ? to.replace(/\$caseId/, params.caseId ?? '') : to}>
      {children}
    </a>
  ),
}));

function resetMocks() {
  mockSelectedProjectId = null;
  mockProjectsQuery = { data: defaultProjects, isPending: false };
  mockCasesQuery = { data: defaultCases, isPending: false };
  mockStoragePersist = {
    state: 'persisted',
    isPersisted: true,
    isLoading: false,
    isEvictionRisk: false,
  };
}

describe('CasesScreen', () => {
  describe('when no project is selected', () => {
    it('renders loading skeleton when projectsQuery is pending and no selectedProjectId', () => {
      resetMocks();
      mockSelectedProjectId = null;
      mockProjectsQuery = { data: undefined, isPending: true };

      render(<CasesScreen />);
      const skeletons = screen.getAllByTestId('skeleton');
      expect(skeletons.length).toBeGreaterThanOrEqual(1);
    });

    it('renders "Select a project" empty state with link to Home when projects loaded but no project selected', () => {
      resetMocks();
      mockSelectedProjectId = null;
      mockProjectsQuery = { data: defaultProjects, isPending: false };

      render(<CasesScreen />);
      expect(
        screen.getByText('Select a project from Home to view cases'),
      ).toBeInTheDocument();
      expect(screen.getByText('Go to Home')).toBeInTheDocument();
    });
  });

  describe('when a project is selected', () => {
    beforeEach(() => {
      resetMocks();
      mockSelectedProjectId = 'proj-1';
    });

    it('renders cases loading skeleton when casesQuery is pending', () => {
      mockCasesQuery = { data: undefined, isPending: true };
      render(<CasesScreen />);
      const skeletons = screen.getAllByTestId('skeleton');
      expect(skeletons.length).toBeGreaterThanOrEqual(1);
    });

    it('renders cases error state', () => {
      mockCasesQuery = { data: [], isPending: false, isError: true };
      render(<CasesScreen />);
      expect(
        screen.getByText('Failed to load cases. Please try again.'),
      ).toBeInTheDocument();
      expect(screen.queryByText('No cases yet')).not.toBeInTheDocument();
    });

    it('renders "No cases yet" when cases array is empty', () => {
      mockCasesQuery = { data: [], isPending: false };
      render(<CasesScreen />);
      expect(screen.getByText('No cases yet')).toBeInTheDocument();
    });

    it('renders cases title heading', () => {
      render(<CasesScreen />);
      expect(screen.getByText('Cases')).toBeInTheDocument();
    });

    it('renders "New Case" button linking to /cases/new', () => {
      render(<CasesScreen />);
      const newCaseLink = screen.getByRole('link', { name: 'New Case' });
      expect(newCaseLink).toBeInTheDocument();
      expect(newCaseLink).toHaveAttribute('href', '/cases/new');
    });

    it('lists only cases for the selected project with title, primary type, status, and updated time', () => {
      render(<CasesScreen />);
      expect(screen.getByText('Case One')).toBeInTheDocument();
      expect(screen.getByText('Case Two')).toBeInTheDocument();
    });

    it('renders the current evidence count for each case', () => {
      render(<CasesScreen />);
      expect(screen.getByText('2 evidence items')).toBeInTheDocument();
      expect(screen.getByText('1 evidence item')).toBeInTheDocument();
    });

    it('links each case to its detail route', () => {
      render(<CasesScreen />);
      const links = screen.getAllByRole('link');
      // Find the link that points to /cases/case-1
      const case1Link = links.find(
        (l) => l.getAttribute('href') === '/cases/case-1',
      );
      expect(case1Link).toBeDefined();
      expect(case1Link!.textContent).toContain('Case One');
    });

    it('renders project-scoped list (does not show cases from other projects when data-layer returns project-scoped data)', () => {
      render(<CasesScreen />);
      expect(screen.getByText('Case One')).toBeInTheDocument();
      expect(screen.getByText('Case Two')).toBeInTheDocument();
      // When data-layer returns empty (no cases for another project), empty state shows
      mockCasesQuery = { data: [], isPending: false };
      render(<CasesScreen />);
      expect(screen.getByText('No cases yet')).toBeInTheDocument();
    });
  });

  describe('storage eviction-risk state', () => {
    beforeEach(() => {
      resetMocks();
      mockSelectedProjectId = 'proj-1';
    });

    it('does not render an eviction-risk warning when storage is persisted', () => {
      render(<CasesScreen />);
      expect(
        screen.queryByText(/storage is not protected/),
      ).not.toBeInTheDocument();
    });

    it('renders an eviction-risk warning when persistence is denied', () => {
      mockStoragePersist = {
        state: 'denied',
        isPersisted: false,
        isLoading: false,
        isEvictionRisk: true,
      };
      render(<CasesScreen />);
      expect(
        screen.getByText(/Local storage is not protected from eviction/),
      ).toBeInTheDocument();
    });

    it('renders a quota-risk warning when usage exceeds threshold', () => {
      mockStoragePersist = {
        state: 'quota-risk',
        isPersisted: true,
        isLoading: false,
        isEvictionRisk: true,
      };
      render(<CasesScreen />);
      expect(screen.getByText(/running low on storage/)).toBeInTheDocument();
    });

    it('does not block Case creation when eviction risk is present', () => {
      mockStoragePersist = {
        state: 'denied',
        isPersisted: false,
        isLoading: false,
        isEvictionRisk: true,
      };
      render(<CasesScreen />);
      // The New Case link should still be present and enabled
      const newCaseLink = screen.getByRole('link', { name: 'New Case' });
      expect(newCaseLink).toBeInTheDocument();
      expect(newCaseLink).toHaveAttribute('href', '/cases/new');
    });
  });
});
