// `within` is only used by the commented-out import dialog tests below —
// re-add it when re-enabling them (see TODO near the import dialog wiring).
import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useApiFields } from '@/hooks/useApiFields';
import {
  deduplicatePresetVersions,
  useApiPresets,
} from '@/hooks/useApiPresets';
import { CategoriesEditorScreen } from '@/screens/CategoriesEditor';

interface ScreenPreset {
  docId: string;
  name: string;
  tags: Record<string, unknown>;
  fieldRefs: Array<{ docId: string; label?: string }>;
  createdAt: string;
  deleted: boolean;
  versionId?: string;
  originalVersionId?: string;
  color?: string;
  iconRef?: { docId: string };
}

interface ScreenField {
  docId: string;
  type: string;
  key: string;
  label: string;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
  universal: boolean;
  options?: Array<{ label: string; value: string }>;
  placeholder?: string;
}

const defaultPresets: ScreenPreset[] = [
  {
    docId: 'preset-1',
    name: 'Deforestation',
    tags: { type: 'environment' },
    fieldRefs: [{ docId: 'field-1', label: 'Severity' }],
    createdAt: '2025-01-01T00:00:00Z',
    deleted: false,
  },
  {
    docId: 'preset-2',
    name: 'Mining',
    tags: { type: 'environment' },
    fieldRefs: [],
    createdAt: '2025-01-01T00:01:00Z',
    deleted: false,
  },
];

const defaultFields: ScreenField[] = [
  {
    docId: 'field-1',
    type: 'text',
    key: 'severity',
    label: 'Severity',
    deleted: false,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    universal: false,
  },
];

let mockSelectedProjectId: string | null = 'proj-1';
let mockRouteParams: { categoryId?: string } = {};
let mockPresetsQuery: {
  data?: typeof defaultPresets;
  isPending: boolean;
  isError?: boolean;
  refetch?: () => void;
  isEnabled: boolean;
} = { data: defaultPresets, isPending: false, isEnabled: true };

let mockProjectsQuery: {
  data: Array<{
    localId: string;
    name: string;
    sourceId: string;
    remoteId?: string;
  }>;
  isPending: boolean;
  isError?: boolean;
  refetch?: () => void;
} = {
  data: [
    {
      localId: 'proj-1',
      name: 'Test Project',
      sourceId: 'server-1',
      remoteId: 'base32proj1',
    },
  ],
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

vi.mock('@/hooks/useApiPresets', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useApiPresets')>(
    '@/hooks/useApiPresets',
  );
  return {
    ...actual,
    useApiPresets: vi.fn(() => mockPresetsQuery),
  };
});

let mockFieldsQuery: {
  data?: ScreenField[];
  isPending: boolean;
  isError?: boolean;
  refetch?: () => void;
  isEnabled: boolean;
} = { data: defaultFields, isPending: false, isEnabled: true };

vi.mock('@/hooks/useApiFields', () => ({
  useApiFields: vi.fn(() => mockFieldsQuery),
}));

const { mockBaseUrl, mockServers } = vi.hoisted(() => ({
  mockBaseUrl: { current: 'https://archive.example.com' as string | null },
  mockServers: {
    current: [] as Array<{ id: string; baseUrl: string; token: string }>,
  },
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn(
    (
      selector: (s: {
        baseUrl: string | null;
        servers: Array<{ id: string; baseUrl: string; token: string }>;
      }) => unknown,
    ) =>
      selector({
        baseUrl: mockBaseUrl.current,
        servers: mockServers.current,
      }),
  ),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
  useParams: () => mockRouteParams,
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
  mockRouteParams = {};
  mockBaseUrl.current = 'https://archive.example.com';
  mockServers.current = [];
  mockPresetsQuery = {
    data: defaultPresets,
    isPending: false,
    isEnabled: true,
  };
  mockProjectsQuery = {
    data: [
      {
        localId: 'proj-1',
        name: 'Test Project',
        sourceId: 'server-1',
        remoteId: 'base32proj1',
      },
    ],
    isPending: false,
  };
  mockFieldsQuery = { data: defaultFields, isPending: false, isEnabled: true };
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
      data: [
        {
          localId: 'proj-2',
          name: 'Other',
          sourceId: 'server-2',
          remoteId: 'base32other',
        },
      ],
      isPending: false,
    };
    render(<CategoriesEditorScreen />);
    expect(screen.getByText('No categories found')).toBeInTheDocument();
  });

  // --- presets loading / error ---

  it('renders loading skeleton while presets load', () => {
    mockPresetsQuery = { data: undefined, isPending: true, isEnabled: true };

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
      isEnabled: true,
    };

    render(<CategoriesEditorScreen />);
    expect(
      screen.getByText('Failed to load categories. Please try again.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('renders empty state when no categories exist', () => {
    mockPresetsQuery = { data: [], isPending: false, isEnabled: true };

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
    expect(vi.mocked(useApiPresets)).toHaveBeenCalledWith('base32proj1', null);
  });

  it('calls useApiFields with project remoteId when project has one', () => {
    render(<CategoriesEditorScreen />);
    expect(vi.mocked(useApiFields)).toHaveBeenCalledWith('base32proj1', null);
  });

  it('renders category cards when presets are loaded via remoteId', () => {
    render(<CategoriesEditorScreen />);
    expect(screen.getByText('Deforestation')).toBeInTheDocument();
    expect(screen.getByText('Mining')).toBeInTheDocument();
  });

  it('resolves the surviving deduplicated preset docId in the detail route', () => {
    mockRouteParams = { categoryId: 'category-v2' };
    mockFieldsQuery = {
      data: [
        {
          docId: 'field-1',
          type: 'text',
          key: 'severity',
          label: 'Severity',
          deleted: false,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
          universal: false,
        },
      ],
      isPending: false,
      isEnabled: true,
    };
    mockPresetsQuery = {
      data: deduplicatePresetVersions([
        {
          docId: 'category-v1',
          originalVersionId: 'category-original',
          versionId: 'category-original/1',
          createdAt: '2025-01-01T00:00:00.000Z',
          deleted: false,
          name: 'Forest',
          tags: { type: 'environment' },
          fieldRefs: [{ docId: 'field-1' }],
        },
        {
          docId: 'category-v2',
          originalVersionId: 'category-original',
          versionId: 'category-original/2',
          createdAt: '2025-01-01T00:05:00.000Z',
          deleted: false,
          name: 'Forest updated',
          tags: { type: 'environment' },
          fieldRefs: [{ docId: 'field-1' }],
        },
      ]),
      isPending: false,
      isError: false,
      isEnabled: true,
    };

    render(<CategoriesEditorScreen />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Forest updated' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Severity')).toBeInTheDocument();
    expect(screen.queryByText('Select a category')).not.toBeInTheDocument();
  });

  it('shows "Field unavailable" and no raw docId for unresolved field refs', () => {
    // Category references a field absent from the fields list
    mockRouteParams = { categoryId: 'category-orphan' };
    mockPresetsQuery = {
      data: [
        {
          docId: 'category-orphan',
          name: 'Orphan Category',
          tags: { type: 'environment' },
          fieldRefs: [{ docId: 'field-missing' }],
          createdAt: '2025-01-01T00:00:00Z',
          deleted: false,
        },
      ],
      isPending: false,
      isError: false,
      isEnabled: true,
    };
    // Fields query resolves successfully but does NOT contain field-missing
    mockFieldsQuery = {
      data: defaultFields,
      isPending: false,
      isEnabled: true,
    };

    render(<CategoriesEditorScreen />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Orphan Category' }),
    ).toBeInTheDocument();
    // Unresolved ref renders the placeholder, NOT the raw docId
    expect(screen.getByText('Field unavailable')).toBeInTheDocument();
    expect(screen.queryByText('field-missing')).not.toBeInTheDocument();
  });

  it('renders no fields (held) while fields query is still pending', () => {
    mockRouteParams = { categoryId: 'preset-1' };
    mockPresetsQuery = {
      data: defaultPresets,
      isPending: false,
      isError: false,
      isEnabled: true,
    };
    // Fields still loading — resolution should hold, not flash placeholders
    mockFieldsQuery = { data: undefined, isPending: true, isEnabled: true };

    render(<CategoriesEditorScreen />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Deforestation' }),
    ).toBeInTheDocument();
    // The category has field-1 in fieldRefs; while fields pending it must
    // NOT show "Field unavailable" (that would be a false error flash)
    expect(screen.queryByText('Field unavailable')).not.toBeInTheDocument();
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
    mockProjectsQuery = {
      data: [
        { localId: 'proj-1', name: 'Local Project', sourceId: 'server-1' },
      ],
      isPending: false,
    };
    render(<CategoriesEditorScreen />);
    expect(screen.getByText('No categories found')).toBeInTheDocument();
    // Verify the hook was called with null — no wasted API call
    expect(vi.mocked(useApiPresets)).toHaveBeenCalledWith(null, null);
    expect(vi.mocked(useApiFields)).toHaveBeenCalledWith(null, null);
  });

  it('shows no-server message when archive server is not configured', () => {
    mockBaseUrl.current = null;
    mockPresetsQuery = { data: undefined, isPending: true, isEnabled: false };
    render(<CategoriesEditorScreen />);
    expect(
      screen.getByText('Connect to an archive server to view categories'),
    ).toBeInTheDocument();
    // Should NOT show skeleton (presets query is disabled, isPending stays true)
    const skeletons = document.querySelectorAll(
      '[class*="animate-pulse"], [class*="bg-muted"]',
    );
    expect(skeletons.length).toBe(0);
  });

  it('shows empty-state message when no categories exist', () => {
    mockPresetsQuery = { data: [], isPending: false, isEnabled: true };
    render(<CategoriesEditorScreen />);
    expect(screen.getByText('No categories found')).toBeInTheDocument();
  });

  it('shows no-results message when search filters everything out', async () => {
    render(<CategoriesEditorScreen />);
    expect(screen.getByText('Deforestation')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText('Search categories...');
    await userEvent.type(searchInput, 'zzz_nonexistent');

    expect(
      screen.getByText('No categories match your search'),
    ).toBeInTheDocument();
  });

  // --- fields query error state ---

  it('shows field labels warning banner when fields query fails', () => {
    const refetch = vi.fn();
    mockFieldsQuery = {
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
      isEnabled: true,
    };
    render(<CategoriesEditorScreen />);
    expect(screen.getByText('Field labels unavailable')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('calls fieldsQuery.refetch when retry button is clicked', () => {
    const refetch = vi.fn();
    mockFieldsQuery = {
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
      isEnabled: true,
    };
    render(<CategoriesEditorScreen />);
    screen.getByText('Retry').click();
    expect(refetch).toHaveBeenCalled();
  });

  it('categories still render when fields query fails', () => {
    mockFieldsQuery = {
      data: undefined,
      isPending: false,
      isError: true,
      refetch: vi.fn(),
      isEnabled: true,
    };
    render(<CategoriesEditorScreen />);
    expect(screen.getByText('Deforestation')).toBeInTheDocument();
    expect(screen.getByText('Mining')).toBeInTheDocument();
  });

  it('shows latest/all toggle when presets span time clusters', () => {
    mockPresetsQuery = {
      data: [
        {
          docId: 'new-preset',
          name: 'Deforestation',
          tags: { natural: 'yes' },
          fieldRefs: [],
          createdAt: '2025-06-15T12:00:00Z',
          deleted: false,
        },
        {
          docId: 'old-preset',
          name: 'Mining',
          tags: { natural: 'no' },
          fieldRefs: [],
          createdAt: '2024-01-01T00:00:00Z',
          deleted: false,
        },
      ],
      isPending: false,
      isError: false,
      isEnabled: true,
    };
    render(<CategoriesEditorScreen />);
    expect(screen.getByText('Latest')).toBeInTheDocument();
    expect(screen.getByText('All')).toBeInTheDocument();
  });

  it('toggle switches between latest and all views', async () => {
    mockPresetsQuery = {
      data: [
        {
          docId: 'new-1',
          name: 'Recent Category',
          tags: {},
          fieldRefs: [],
          createdAt: '2025-06-15T12:00:00Z',
          deleted: false,
        },
        {
          docId: 'old-1',
          name: 'Old Category',
          tags: {},
          fieldRefs: [],
          createdAt: '2024-01-01T00:00:00Z',
          deleted: false,
        },
      ],
      isPending: false,
      isError: false,
      isEnabled: true,
    };
    render(<CategoriesEditorScreen />);

    // Initially shows only latest cluster
    expect(screen.getByText('Recent Category')).toBeInTheDocument();
    expect(screen.queryByText('Old Category')).not.toBeInTheDocument();

    // Click "All" to show everything
    await userEvent.click(screen.getByText('All'));
    expect(screen.getByText('Recent Category')).toBeInTheDocument();
    expect(screen.getByText('Old Category')).toBeInTheDocument();

    // Click "Latest" to go back
    await userEvent.click(screen.getByText('Latest'));
    expect(screen.getByText('Recent Category')).toBeInTheDocument();
    expect(screen.queryByText('Old Category')).not.toBeInTheDocument();
  });

  it('does not show toggle when all presets are in one cluster', () => {
    // All presets have similar timestamps — single cluster
    mockPresetsQuery = {
      data: [
        {
          docId: 'p1',
          name: 'Deforestation',
          tags: { natural: 'yes' },
          fieldRefs: [],
          createdAt: '2025-06-15T12:00:00Z',
          deleted: false,
        },
        {
          docId: 'p2',
          name: 'Mining',
          tags: { natural: 'no' },
          fieldRefs: [],
          createdAt: '2025-06-15T12:30:00Z',
          deleted: false,
        },
      ],
      isPending: false,
      isError: false,
      isEnabled: true,
    };
    render(<CategoriesEditorScreen />);
    expect(screen.queryByText('Latest')).not.toBeInTheDocument();
    expect(screen.queryByText('All')).not.toBeInTheDocument();
  });

  // --- server routing via sourceId ---

  it('calls useApiPresets with owning server config when project sourceId matches a server', () => {
    // Set up servers including one that matches the project's sourceId
    mockServers.current = [
      {
        id: 'server-1',
        baseUrl: 'https://test-server.com',
        token: 'test-token',
      },
    ];
    // Project has sourceId === 'server-1' (default mock)
    render(<CategoriesEditorScreen />);
    expect(vi.mocked(useApiPresets)).toHaveBeenCalledWith('base32proj1', {
      baseUrl: 'https://test-server.com',
      token: 'test-token',
    });
  });

  it('calls useApiFields with owning server config when project sourceId matches a server', () => {
    mockServers.current = [
      {
        id: 'server-1',
        baseUrl: 'https://test-server.com',
        token: 'test-token',
      },
    ];
    render(<CategoriesEditorScreen />);
    expect(vi.mocked(useApiFields)).toHaveBeenCalledWith('base32proj1', {
      baseUrl: 'https://test-server.com',
      token: 'test-token',
    });
  });

  it('calls useApiPresets with null serverConfig when project sourceId does not match any server', () => {
    mockServers.current = [
      {
        id: 'server-other',
        baseUrl: 'https://other-server.com',
        token: 'other-token',
      },
    ];
    // Default project sourceId is 'server-1', which does NOT match 'server-other'
    render(<CategoriesEditorScreen />);
    expect(vi.mocked(useApiPresets)).toHaveBeenCalledWith('base32proj1', null);
  });

  it('calls useApiFields with null serverConfig when project sourceId does not match any server', () => {
    mockServers.current = [
      {
        id: 'server-other',
        baseUrl: 'https://other-server.com',
        token: 'other-token',
      },
    ];
    render(<CategoriesEditorScreen />);
    expect(vi.mocked(useApiFields)).toHaveBeenCalledWith('base32proj1', null);
  });

  // --- hidden banner (latest/all toggle) ---

  it('shows hidden banner with singular form when 1 older category is hidden', () => {
    // Cluster 1 (newest): preset within the last day
    // Cluster 2 (older): preset from >60 min before cluster 1 — exactly 1 preset
    mockPresetsQuery = {
      data: [
        {
          docId: 'new-1',
          name: 'Recent Category',
          tags: {},
          fieldRefs: [],
          createdAt: '2025-06-15T12:00:00Z',
          deleted: false,
        },
        {
          docId: 'old-1',
          name: 'Old Category',
          tags: {},
          fieldRefs: [],
          createdAt: '2025-06-15T10:00:00Z',
          deleted: false,
        },
      ],
      isPending: false,
      isError: false,
      isEnabled: true,
    };
    render(<CategoriesEditorScreen />);

    // The banner should appear and use singular form (1 hidden)
    expect(screen.getByText(/1 older category hidden/)).toBeInTheDocument();
    // Should also show the prefix text
    expect(
      screen.getByText(/Showing the latest category set/),
    ).toBeInTheDocument();
  });

  it('shows hidden banner with plural form when 2+ older categories are hidden', () => {
    // Cluster 1 (newest): 1 preset at 12:00
    // Cluster 2 (older): 2 presets from >60 min earlier — 2 hidden
    mockPresetsQuery = {
      data: [
        {
          docId: 'new-1',
          name: 'Recent Category',
          tags: {},
          fieldRefs: [],
          createdAt: '2025-06-15T12:00:00Z',
          deleted: false,
        },
        {
          docId: 'old-1',
          name: 'Older Category A',
          tags: {},
          fieldRefs: [],
          createdAt: '2025-06-15T10:00:00Z',
          deleted: false,
        },
        {
          docId: 'old-2',
          name: 'Older Category B',
          tags: {},
          fieldRefs: [],
          createdAt: '2025-06-15T09:00:00Z',
          deleted: false,
        },
      ],
      isPending: false,
      isError: false,
      isEnabled: true,
    };
    render(<CategoriesEditorScreen />);

    // The banner should appear and use plural form (2 hidden)
    expect(screen.getByText(/2 older categories hidden/)).toBeInTheDocument();
    // Should also show the prefix text
    expect(
      screen.getByText(/Showing the latest category set/),
    ).toBeInTheDocument();
  });

  // TODO: Re-enable when import functionality is fully implemented (see issue)
  // --- import dialog wiring ---
  //
  // it('renders the Import Category Set button in the toolbar', () => {
  //   render(<CategoriesEditorScreen />);
  //   expect(
  //     screen.getByRole('button', { name: 'Import Category Set' }),
  //   ).toBeInTheDocument();
  // });
  //
  // it('opens the import dialog when the Import button is clicked', async () => {
  //   const user = userEvent.setup();
  //   render(<CategoriesEditorScreen />);
  //
  //   // Dialog is closed initially — its title is not in the document
  //   expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  //
  //   await user.click(
  //     screen.getByRole('button', { name: 'Import Category Set' }),
  //   );
  //
  //   const dialog = await screen.findByRole('dialog');
  //   expect(dialog).toBeInTheDocument();
  //   // The dialog's file-upload label confirms the import UI is rendered
  //   expect(
  //     within(dialog).getByText('Choose .comapeocat file'),
  //   ).toBeInTheDocument();
  // });
});
