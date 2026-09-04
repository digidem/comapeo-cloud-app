import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useArchiveStatus } from '@/hooks/useArchiveStatus';
import { useProjects } from '@/hooks/useProjects';
import { ArchiveBrowser } from '@/screens/Home/ArchiveBrowser';
import { useAuthStore } from '@/stores/auth-store';

const { mockNavigate, mockSyncRemoteArchive } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockSyncRemoteArchive: vi.fn(),
}));

vi.mock('@/lib/data-layer', () => ({
  syncRemoteArchive: mockSyncRemoteArchive,
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/hooks/useArchiveStatus', () => ({
  useArchiveStatus: vi.fn(),
}));

vi.mock('@/hooks/useProjects', () => ({
  useProjects: vi.fn(),
}));

const mockUseArchiveStatus = vi.mocked(useArchiveStatus);
const mockUseProjects = vi.mocked(useProjects);

describe('ArchiveBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSyncRemoteArchive.mockResolvedValue({
      success: true,
      status: 'ready',
      serverId: 'server-1',
      projects: [],
      warnings: [],
    });
    useAuthStore.setState({
      servers: [
        {
          id: 'server-1',
          label: 'North Archive',
          baseUrl: 'https://archive.example.com',
          token: 'token',
          status: 'idle',
        },
      ],
    });
    mockUseProjects.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      status: 'success',
    } as unknown as ReturnType<typeof useProjects>);
    mockUseArchiveStatus.mockReturnValue({
      servers: [
        {
          id: 'server-1',
          label: 'North Archive',
          baseUrl: 'https://archive.example.com',
          isSyncing: false,
          lastSyncedAt: null,
          error: null,
          hasCredentials: true,
          isStale: true,
        },
      ],
      anyError: false,
      anySyncing: false,
    });
  });

  it('shows a persistent Create Project action in the non-empty state', async () => {
    const user = userEvent.setup();
    const onCreateNew = vi.fn();

    render(
      <ArchiveBrowser
        selectedProjectId={null}
        onSelect={vi.fn()}
        onCreateNew={onCreateNew}
        onAddServer={vi.fn()}
        onSelectServer={vi.fn()}
      />,
    );

    const createProjectButton = screen.getByRole('button', {
      name: 'Create Project',
    });

    await user.click(createProjectButton);

    expect(onCreateNew).toHaveBeenCalledOnce();
  });

  it('does not render the persistent create action while projects are loading', () => {
    mockUseProjects.mockReturnValue({
      data: [],
      isLoading: true,
      isError: false,
      error: null,
      status: 'pending',
    } as unknown as ReturnType<typeof useProjects>);

    render(
      <ArchiveBrowser
        selectedProjectId={null}
        onSelect={vi.fn()}
        onCreateNew={vi.fn()}
        onAddServer={vi.fn()}
        onSelectServer={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Create Project' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('skeleton')).toHaveStyle({ height: '44px' });
  });

  it('renders exactly one create affordance in the empty state', () => {
    useAuthStore.setState({ servers: [] });
    mockUseArchiveStatus.mockReturnValue({
      servers: [],
      anyError: false,
      anySyncing: false,
    });

    render(
      <ArchiveBrowser
        selectedProjectId={null}
        onSelect={vi.fn()}
        onCreateNew={vi.fn()}
        onAddServer={vi.fn()}
        onSelectServer={vi.fn()}
      />,
    );

    expect(
      screen.getAllByText('Create Project', { selector: 'button' }),
    ).toHaveLength(1);
    expect(
      screen.getByRole('button', {
        name: 'Create your first project from project list',
      }),
    ).toBeInTheDocument();
  });

  it('renders remote archive overflow button with correct aria-label', async () => {
    const user = userEvent.setup();
    const onSelectServer = vi.fn();

    render(
      <ArchiveBrowser
        selectedProjectId={null}
        onSelect={vi.fn()}
        onCreateNew={vi.fn()}
        onAddServer={vi.fn()}
        onSelectServer={onSelectServer}
      />,
    );

    const overflowButton = screen.getByRole('button', {
      name: 'Archive actions',
    });

    expect(overflowButton.tagName).toBe('BUTTON');
    expect(overflowButton).toHaveAttribute('type', 'button');
    expect(overflowButton).toHaveClass('h-10', 'w-10', 'sm:h-8', 'sm:w-8');

    // Clicking the overflow button opens the sheet, not directly calling onSelectServer
    await user.click(overflowButton);
    expect(onSelectServer).not.toHaveBeenCalled();
  });

  it('does not bubble archive toggle clicks to parent navigation handlers', async () => {
    const user = userEvent.setup();
    const onParentClick = vi.fn();

    render(
      <div onClick={onParentClick}>
        <ArchiveBrowser
          selectedProjectId={null}
          onSelect={vi.fn()}
          onCreateNew={vi.fn()}
          onAddServer={vi.fn()}
          onSelectServer={vi.fn()}
        />
      </div>,
    );

    const archiveToggle = screen.getByText('North Archive').closest('button');
    if (archiveToggle === null) {
      throw new Error('Archive toggle button not found');
    }
    await user.click(archiveToggle);

    expect(onParentClick).not.toHaveBeenCalled();
  });

  it('opens overflow sheet and clicking View Details calls onSelectServer', async () => {
    const user = userEvent.setup();
    const onSelectServer = vi.fn();

    render(
      <ArchiveBrowser
        selectedProjectId={null}
        onSelect={vi.fn()}
        onCreateNew={vi.fn()}
        onAddServer={vi.fn()}
        onSelectServer={onSelectServer}
      />,
    );

    // Click the overflow button to open the sheet
    const overflowButton = screen.getByRole('button', {
      name: 'Archive actions',
    });
    await user.click(overflowButton);

    // The sheet should be open — find and click "View Details"
    const viewDetailsButton = screen.getByRole('button', {
      name: 'View Details',
    });
    await user.click(viewDetailsButton);

    expect(onSelectServer).toHaveBeenCalledOnce();
    expect(onSelectServer).toHaveBeenCalledWith('server-1');
  });

  it('bubbles archive settings clicks to parent via overflow sheet', async () => {
    const user = userEvent.setup();
    const onParentClick = vi.fn();

    render(
      <div onClick={onParentClick}>
        <ArchiveBrowser
          selectedProjectId={null}
          onSelect={vi.fn()}
          onCreateNew={vi.fn()}
          onAddServer={vi.fn()}
          onSelectServer={vi.fn()}
        />
      </div>,
    );

    await user.click(screen.getByRole('button', { name: 'Archive actions' }));

    // Clicking "View Details" inside the sheet bubbles up
    await user.click(screen.getByRole('button', { name: 'View Details' }));

    expect(onParentClick).toHaveBeenCalled();
  });

  it('syncs the archive when overflow Sync Now is clicked', async () => {
    const user = userEvent.setup();

    render(
      <ArchiveBrowser
        selectedProjectId={null}
        onSelect={vi.fn()}
        onCreateNew={vi.fn()}
        onAddServer={vi.fn()}
        onSelectServer={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Archive actions' }));
    await user.click(screen.getByRole('button', { name: 'Sync Now' }));

    expect(mockSyncRemoteArchive).toHaveBeenCalledOnce();
    expect(mockSyncRemoteArchive).toHaveBeenCalledWith('server-1', {
      baseUrl: 'https://archive.example.com',
      token: 'token',
    });
  });

  // Regression: commit dd11b75 — selectArchive outside state updater (Strict Mode safety)
  it('calls selectArchive when expanding an archive (not when collapsing)', async () => {
    const user = userEvent.setup();
    const { useArchiveStore } = await import('@/stores/archive-store');
    useArchiveStore.setState({ selectedArchiveId: null });

    render(
      <ArchiveBrowser
        selectedProjectId={null}
        onSelect={vi.fn()}
        onCreateNew={vi.fn()}
        onAddServer={vi.fn()}
        onSelectServer={vi.fn()}
      />,
    );

    const archiveToggle = screen.getByText('North Archive').closest('button');
    if (archiveToggle === null) {
      throw new Error('Archive toggle button not found');
    }
    await user.click(archiveToggle);
    expect(useArchiveStore.getState().selectedArchiveId).toBeNull();

    await user.click(archiveToggle);
    expect(useArchiveStore.getState().selectedArchiveId).toBe(
      'https://archive.example.com',
    );
  });
});
