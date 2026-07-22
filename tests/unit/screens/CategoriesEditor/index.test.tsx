import { render, screen } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useApiPresets } from '@/hooks/useApiPresets';
import { useProjects } from '@/hooks/useProjects';
import { CategoriesEditorScreen } from '@/screens/CategoriesEditor';

const defaultPresets: Array<{
  docId: string;
  name: string;
  tags: Record<string, unknown>;
  fieldRefs: Array<{ docId: string; label?: string }>;
}> = [
  {
    docId: 'preset-1',
    name: 'Deforestation',
    tags: { type: 'environment' },
    fieldRefs: [{ docId: 'field-1', label: 'Severity' }],
  },
  {
    docId: 'preset-2',
    name: 'Mining',
    tags: { type: 'environment' },
    fieldRefs: [],
  },
];

let mockSelectedProjectId: string | null = 'proj-1';
let mockPresetsQuery: {
  data?: typeof defaultPresets;
  isPending: boolean;
  isError?: boolean;
  refetch?: () => void;
} = { data: defaultPresets, isPending: false };

let mockProjectsQuery: {
  data: Array<{ localId: string; name: string; remoteId?: string }>;
  isPending: boolean;
  isError?: boolean;
  refetch?: () => void;
} = {
  data: [{ localId: 'proj-1', name: 'Test Project', remoteId: 'base32proj1' }],
  isPending: false,
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

vi.mock('@/hooks/useApiPresets', () => ({
  useApiPresets: vi.fn(() => mockPresetsQuery),
}));

vi.mock('@/hooks/useFields', () => ({
  useFields: vi.fn(() => ({
    data: [],
    isPending: false,
  })),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

function resetMocks() {
  mockSelectedProjectId = 'proj-1';
  mockPresetsQuery = { data: defaultPresets, isPending: false };
  mockProjectsQuery = {
    data: [
      { localId: 'proj-1', name: 'Test Project', remoteId: 'base32proj1' },
    ],
    isPending: false,
  };
  vi.clearAllMocks();
}

describe('CategoriesEditorScreen', () => {
  beforeEach(() => {
    resetMocks();
  });

  // --- project loading / error guard states (HIGH-1 fix) ---

  it('renders projects loading skeleton while projects query is pending', () => {
    mockProjectsQuery = {
      data: [],
      isPending: true,
    };
    render(<CategoriesEditorScreen />);
    const skeletons = document.querySelectorAll(
      '[class*="animate-pulse"], [class*="bg-muted"]',
    );
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
    // Should NOT show the select-project prompt
    expect(
      screen.queryByText('Select a project to view categories'),
    ).not.toBeInTheDocument();
  });

  it('renders projects error with retry when projects query fails', () => {
    const refetch = vi.fn();
    mockProjectsQuery = {
      data: [],
      isPending: false,
      isError: true,
      refetch,
    };
    render(<CategoriesEditorScreen />);
    expect(
      screen.getByText('Failed to load categories. Please try again.'),
    ).toBeInTheDocument();
    screen.getByText('Retry').click();
    expect(refetch).toHaveBeenCalled();
  });

  it('shows empty state when selected project not found in loaded list', () => {
    mockSelectedProjectId = 'proj-1';
    mockProjectsQuery = {
      data: [{ localId: 'proj-2', name: 'Other', remoteId: 'base32other' }],
      isPending: false,
    };
    render(<CategoriesEditorScreen />);
    expect(screen.getByText('No categories found')).toBeInTheDocument();
  });

  // --- presets loading / error ---

  it('renders loading skeleton while presets load', () => {
    mockPresetsQuery = { data: undefined, isPending: true };

    render(<CategoriesEditorScreen />);
    const skeletons = document.querySelectorAll(
      '[class*="animate-pulse"], [class*="bg-muted"]',
    );
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders error state with retry button when presets fetch fails', () => {
    mockPresetsQuery = {
      data: undefined,
      isPending: false,
      isError: true,
      refetch: vi.fn(),
    };

    render(<CategoriesEditorScreen />);
    expect(
      screen.getByText('Failed to load categories. Please try again.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('renders empty state when no categories exist', () => {
    mockPresetsQuery = { data: [], isPending: false };

    render(<CategoriesEditorScreen />);
    expect(screen.getByText('No categories found')).toBeInTheDocument();
  });

  it('renders search input', () => {
    render(<CategoriesEditorScreen />);
    expect(
      screen.getByPlaceholderText('Search categories...'),
    ).toBeInTheDocument();
  });

  // --- core remoteId flow (HIGH-2 fix) ---

  it('calls useApiPresets with project remoteId when project has one', () => {
    render(<CategoriesEditorScreen />);
    expect(vi.mocked(useApiPresets)).toHaveBeenCalledWith('base32proj1');
  });

  it('renders category cards when presets are loaded via remoteId', () => {
    render(<CategoriesEditorScreen />);
    expect(screen.getByText('Deforestation')).toBeInTheDocument();
    expect(screen.getByText('Mining')).toBeInTheDocument();
  });

  it('shows no-project prompt when no project is selected', () => {
    mockSelectedProjectId = null;
    render(<CategoriesEditorScreen />);
    expect(
      screen.getByText('Select a project to view categories'),
    ).toBeInTheDocument();
  });

  it('shows empty state for local project without remoteId and passes null to useApiPresets', () => {
    mockSelectedProjectId = 'proj-1';
    vi.mocked(useProjects).mockReturnValue({
      data: [{ localId: 'proj-1', name: 'Local Project' }],
      isPending: false,
    } as ReturnType<typeof useProjects>);
    render(<CategoriesEditorScreen />);
    expect(screen.getByText('No categories found')).toBeInTheDocument();
    // Verify the hook was called with null — no wasted API call
    expect(vi.mocked(useApiPresets)).toHaveBeenCalledWith(null);
  });

  it('shows no-results message when search filters everything out', () => {
    mockPresetsQuery = { data: [], isPending: false };
    render(<CategoriesEditorScreen />);
    expect(screen.getByText('No categories found')).toBeInTheDocument();
  });
});
