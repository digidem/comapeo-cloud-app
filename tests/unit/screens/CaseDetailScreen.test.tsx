import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Case, CaseActivity, CaseReportState } from '@/lib/data-layer';
import { CaseDetailScreen } from '@/screens/CaseDetailScreen';

let mockCaseId = 'case-1';
let mockCaseData: Case | null = {
  localId: 'case-1',
  projectLocalId: 'proj-1',
  title: 'Investigation Alpha',
  caseType: 'illegal_mining',
  status: 'active',
  createdAt: '2024-03-15T10:30:00Z',
  updatedAt: '2024-03-15T14:00:00Z',
  revision: 2,
  createdBy: 'local',
  deleted: false,
};
let mockCaseIsPending = false;
let mockCaseIsError = false;
let mockCaseActivityData: CaseActivity[] = [];
let mockCaseActivityIsPending = false;
let mockReportStatesData: CaseReportState[] = [];
let mockSelectedProjectId: string | null = 'proj-1';

const mockUpdateCaseMutate = vi.fn();

vi.mock('@/hooks/useUpdateCase', () => ({
  useUpdateCase: vi.fn(() => ({
    mutate: mockUpdateCaseMutate,
    isPending: false,
    isError: false,
  })),
}));

vi.mock('@/components/layout/shell-slot', () => ({
  useShellSlot: vi.fn(),
}));

vi.mock('@/stores/project-store', () => ({
  useProjectStore: vi.fn(
    (selector: (s: { selectedProjectId: string | null }) => string | null) =>
      selector({ selectedProjectId: mockSelectedProjectId }),
  ),
}));

vi.mock('@/hooks/useCase', () => ({
  useCase: vi.fn(() => ({
    data: mockCaseData,
    isPending: mockCaseIsPending,
    isError: mockCaseIsError,
  })),
}));

vi.mock('@/hooks/useProjects', () => ({
  useProjects: vi.fn(() => ({
    data: [{ localId: 'proj-1', name: 'Test Project' }],
    isPending: false,
  })),
}));

vi.mock('@/hooks/useCaseActivity', () => ({
  useCaseActivity: vi.fn(() => ({
    data: mockCaseActivityData,
    isPending: mockCaseActivityIsPending,
  })),
}));

vi.mock('@/hooks/useCaseReportStates', () => ({
  useCaseReportStates: vi.fn(() => ({
    data: mockReportStatesData,
    isPending: false,
  })),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    className,
  }: {
    children: React.ReactNode;
    to: string;
    className?: string;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  useParams: () => ({ caseId: mockCaseId }),
}));

vi.mock('react-map-gl/maplibre', () => ({
  Marker: () => null,
  AttributionControl: () => null,
}));

vi.mock('@/components/shared/MapContainer', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-map">{children}</div>
  ),
}));

function resetMocks() {
  mockCaseId = 'case-1';
  mockCaseData = {
    localId: 'case-1',
    projectLocalId: 'proj-1',
    title: 'Investigation Alpha',
    caseType: 'illegal_mining',
    status: 'active',
    createdAt: '2024-03-15T10:30:00Z',
    updatedAt: '2024-03-15T14:00:00Z',
    revision: 2,
    createdBy: 'local',
    deleted: false,
  };
  mockCaseIsPending = false;
  mockCaseIsError = false;
  mockCaseActivityData = [
    {
      localId: 'activity-1',
      caseLocalId: 'case-1',
      projectLocalId: 'proj-1',
      event: 'created',
      status: 'draft',
      createdAt: '2024-03-15T10:30:00Z',
    },
    {
      localId: 'activity-2',
      caseLocalId: 'case-1',
      projectLocalId: 'proj-1',
      event: 'status_changed',
      status: 'active',
      createdAt: '2024-03-15T14:00:00Z',
    },
  ];
  mockCaseActivityIsPending = false;
  mockReportStatesData = [
    {
      localId: 'state-1',
      caseLocalId: 'case-1',
      projectLocalId: 'proj-1',
      agency: 'FUNAI',
      status: 'complete',
      revision: 1,
      createdAt: '2024-03-15T10:30:00Z',
      updatedAt: '2024-03-15T14:00:00Z',
    },
    {
      localId: 'state-2',
      caseLocalId: 'case-1',
      projectLocalId: 'proj-1',
      agency: 'IBAMA',
      status: 'incomplete',
      revision: 1,
      createdAt: '2024-03-15T10:30:00Z',
      updatedAt: '2024-03-15T14:00:00Z',
    },
    {
      localId: 'state-3',
      caseLocalId: 'case-1',
      projectLocalId: 'proj-1',
      agency: 'MPF',
      status: 'incomplete',
      revision: 1,
      createdAt: '2024-03-15T10:30:00Z',
      updatedAt: '2024-03-15T14:00:00Z',
    },
    {
      localId: 'state-4',
      caseLocalId: 'case-1',
      projectLocalId: 'proj-1',
      agency: 'PF',
      status: 'incomplete',
      revision: 1,
      createdAt: '2024-03-15T10:30:00Z',
      updatedAt: '2024-03-15T14:00:00Z',
    },
  ];
  mockSelectedProjectId = 'proj-1';
  mockUpdateCaseMutate.mockReset();
}

describe('CaseDetailScreen', () => {
  describe('loading state', () => {
    it('renders skeleton when case is loading', () => {
      resetMocks();
      mockCaseIsPending = true;
      render(<CaseDetailScreen />);
      const skeletons = screen.getAllByTestId('skeleton');
      expect(skeletons.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('error state', () => {
    it('renders error state when case query errors', () => {
      resetMocks();
      mockCaseIsError = true;
      render(<CaseDetailScreen />);
      expect(screen.getByText('Failed to load case')).toBeInTheDocument();
    });
  });

  describe('missing / invalid case', () => {
    it('renders "Case not found" when case resolves to null', () => {
      resetMocks();
      mockCaseData = null;
      render(<CaseDetailScreen />);
      expect(screen.getByText('Case not found')).toBeInTheDocument();
    });

    it('renders "Case not found" for cross-project case (useCase returns null)', () => {
      resetMocks();
      mockCaseData = null;
      mockSelectedProjectId = 'proj-2';
      render(<CaseDetailScreen />);
      expect(screen.getByText('Case not found')).toBeInTheDocument();
    });
  });

  describe('overview tab', () => {
    beforeEach(() => {
      resetMocks();
    });

    it('renders Overview tab as active by default', () => {
      render(<CaseDetailScreen />);
      const overviewTab = screen.getByRole('tab', { name: 'Overview' });
      expect(overviewTab).toHaveAttribute('data-state', 'active');
    });

    it('renders back arrow link to /cases', () => {
      render(<CaseDetailScreen />);
      const link = screen.getByRole('link', { name: 'Cases' });
      expect(link).toHaveAttribute('href', '/cases');
      expect(link).toHaveClass('min-h-[44px]');
    });

    it('renders case title as h1', () => {
      render(<CaseDetailScreen />);
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'Investigation Alpha',
        }),
      ).toBeInTheDocument();
    });

    it('renders primary type badge', () => {
      render(<CaseDetailScreen />);
      expect(screen.getByText('Illegal mining')).toBeInTheDocument();
    });

    it('renders status badge', () => {
      render(<CaseDetailScreen />);
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('renders created date', () => {
      render(<CaseDetailScreen />);
      expect(
        screen.getByText('Created', { selector: 'span' }),
      ).toBeInTheDocument();
    });

    it('renders updated date', () => {
      render(<CaseDetailScreen />);
      expect(
        screen.getByText('Last updated', { selector: 'span' }),
      ).toBeInTheDocument();
    });

    it('renders revision number', () => {
      render(<CaseDetailScreen />);
      expect(screen.getByText('Revision 2')).toBeInTheDocument();
    });

    it('renders incident date / date-range summary section', () => {
      render(<CaseDetailScreen />);
      expect(screen.getByText('Incident Date')).toBeInTheDocument();
    });

    it('renders location / territory summary section', () => {
      render(<CaseDetailScreen />);
      expect(screen.getByText('Location & Territory')).toBeInTheDocument();
    });

    it('renders people / community / context fields section', () => {
      render(<CaseDetailScreen />);
      expect(screen.getByText('People & Community')).toBeInTheDocument();
    });

    it('renders urgency fields section', () => {
      render(<CaseDetailScreen />);
      expect(screen.getByText('Urgency')).toBeInTheDocument();
    });

    it('renders lifecycle controls', () => {
      render(<CaseDetailScreen />);
      expect(
        screen.getByRole('button', { name: 'Change Status' }),
      ).toBeInTheDocument();
    });

    it('transitions status to the next lifecycle state on button click', async () => {
      const user = userEvent.setup();
      render(<CaseDetailScreen />);
      await user.click(screen.getByRole('button', { name: 'Change Status' }));
      expect(mockUpdateCaseMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          projectLocalId: 'proj-1',
          localId: 'case-1',
          updates: expect.objectContaining({
            status: expect.stringMatching(/draft|active|closed/),
          }),
        }),
      );
    });

    it('cycles draft to active on status change click', async () => {
      mockCaseData!.status = 'draft';
      const user = userEvent.setup();
      render(<CaseDetailScreen />);
      await user.click(screen.getByRole('button', { name: 'Change Status' }));
      expect(mockUpdateCaseMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          projectLocalId: 'proj-1',
          localId: 'case-1',
          updates: expect.objectContaining({ status: 'active' }),
        }),
      );
    });

    it('cycles active to closed on status change click', async () => {
      mockCaseData!.status = 'active';
      const user = userEvent.setup();
      render(<CaseDetailScreen />);
      await user.click(screen.getByRole('button', { name: 'Change Status' }));
      expect(mockUpdateCaseMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          projectLocalId: 'proj-1',
          localId: 'case-1',
          updates: expect.objectContaining({ status: 'closed' }),
        }),
      );
    });

    it('cycles closed to draft on status change click (reopen)', async () => {
      mockCaseData!.status = 'closed';
      const user = userEvent.setup();
      render(<CaseDetailScreen />);
      await user.click(screen.getByRole('button', { name: 'Change Status' }));
      expect(mockUpdateCaseMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          projectLocalId: 'proj-1',
          localId: 'case-1',
          updates: expect.objectContaining({ status: 'draft' }),
        }),
      );
    });
  });

  describe('activity tab', () => {
    beforeEach(() => {
      resetMocks();
    });

    it('renders Activity tab', () => {
      render(<CaseDetailScreen />);
      expect(screen.getByRole('tab', { name: 'Activity' })).toBeInTheDocument();
    });

    it('renders metadata-only activity events without case factual content', async () => {
      const user = userEvent.setup();
      render(<CaseDetailScreen />);
      // Click the Activity tab
      await user.click(screen.getByRole('tab', { name: 'Activity' }));
      // Activity events are rendered via react-intl labels (not raw keys)
      expect(screen.getByText('Created')).toBeInTheDocument();
      expect(screen.getByText('Status Changed')).toBeInTheDocument();
    });
  });

  describe('report state tab', () => {
    beforeEach(() => {
      resetMocks();
    });

    it('renders Report State tab', () => {
      render(<CaseDetailScreen />);
      expect(
        screen.getByRole('tab', { name: 'Report State' }),
      ).toBeInTheDocument();
    });

    it('renders all four agency statuses independently', async () => {
      const user = userEvent.setup();
      render(<CaseDetailScreen />);
      // Click the Report State tab
      await user.click(screen.getByRole('tab', { name: 'Report State' }));
      // All four agencies should be present
      expect(screen.getByText('FUNAI')).toBeInTheDocument();
      expect(screen.getByText('IBAMA')).toBeInTheDocument();
      expect(screen.getByText('MPF')).toBeInTheDocument();
      expect(screen.getByText('PF')).toBeInTheDocument();
      // FUNAI is complete, others are incomplete
      expect(screen.getByText('Complete')).toBeInTheDocument();
      expect(screen.getAllByText('Incomplete').length).toBeGreaterThanOrEqual(
        3,
      );
    });

    it('shows "Pending" for agencies without a report state row', async () => {
      const user = userEvent.setup();
      resetMocks();
      mockReportStatesData = [
        {
          localId: 'state-1',
          caseLocalId: 'case-1',
          projectLocalId: 'proj-1',
          agency: 'FUNAI',
          status: 'complete',
          revision: 1,
          createdAt: '2024-03-15T10:30:00Z',
          updatedAt: '2024-03-15T14:00:00Z',
        },
      ];
      render(<CaseDetailScreen />);
      await user.click(screen.getByRole('tab', { name: 'Report State' }));
      expect(screen.getAllByText('Pending').length).toBeGreaterThanOrEqual(3);
    });
  });
});
