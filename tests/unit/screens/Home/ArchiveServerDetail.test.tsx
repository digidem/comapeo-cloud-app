import { render, screen, userEvent, waitFor } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArchiveServerStatus } from '@/hooks/useArchiveStatus';
import { ArchiveServerDetail } from '@/screens/Home/ArchiveServerDetail';
import { useProjectStore } from '@/stores/project-store';

const mockNavigate = vi.fn();

function setupUser() {
  return userEvent.setup();
}

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/hooks/useProjects', () => ({
  useProjects: () => ({
    data: [
      {
        localId: 'proj-1',
        name: 'Forest Monitor',
        serverUrl: 'https://archive.example.com',
      },
      {
        localId: 'proj-2',
        name: 'Ocean Watch',
        serverUrl: 'https://other.example.com',
      },
    ],
  }),
}));

vi.mock('@/lib/data-layer', () => ({
  getObservations: vi.fn((projectId: string) =>
    Promise.resolve(projectId === 'proj-1' ? [{ localId: 'obs-1' }] : []),
  ),
  getAlerts: vi.fn((projectId: string) =>
    Promise.resolve(projectId === 'proj-1' ? [{ localId: 'alert-1' }] : []),
  ),
  updateProject: vi.fn(() => Promise.resolve()),
}));

function makeServer(
  overrides: Partial<ArchiveServerStatus> = {},
): ArchiveServerStatus {
  const recentSync = new Date(Date.now() - 4 * 60 * 1000).toISOString();

  return {
    id: 'srv-1',
    label: 'Demo Server',
    baseUrl: 'https://archive.example.com',
    isSyncing: false,
    lastSyncedAt: recentSync,
    error: null,
    hasCredentials: true,
    isStale: false,
    ...overrides,
  };
}

function renderDetail({
  server = makeServer(),
  onSync = vi.fn(),
  onRemove = vi.fn(),
  onBack = vi.fn(),
}: {
  server?: ArchiveServerStatus;
  onSync?: (serverId: string) => void;
  onRemove?: (serverId: string) => void;
  onBack?: () => void;
} = {}) {
  render(
    <ArchiveServerDetail
      server={server}
      onSync={onSync}
      onRemove={onRemove}
      onBack={onBack}
    />,
  );

  return { onSync, onRemove, onBack };
}

describe('ArchiveServerDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
    useProjectStore.setState({
      selectedProjectId: null,
      selectedServerId: null,
    });
  });

  it('renders the archive card with a human-readable sync summary', () => {
    renderDetail();

    expect(
      screen.getByRole('heading', { name: 'Demo Server' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('https://archive.example.com')).not.toHaveLength(
      0,
    );
    expect(screen.getByText('Synced')).toBeInTheDocument();
    expect(
      screen.getByText(/Last sync: (Today|Yesterday), \d{2}:\d{2}/),
    ).toBeInTheDocument();
    expect(screen.getByText('Synced 4 minutes ago')).toBeInTheDocument();
  });

  it('renders Never when the archive has never synced', () => {
    renderDetail({ server: makeServer({ lastSyncedAt: null }) });

    expect(screen.getAllByText('Never')).not.toHaveLength(0);
  });

  it('calls onBack from the top back button', async () => {
    const user = setupUser();
    const { onBack } = renderDetail();

    await user.click(screen.getByRole('button', { name: /back to archives/i }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('copies the archive URL from the inline copy button', async () => {
    const user = setupUser();
    const writeText = vi.fn().mockResolvedValue(undefined);
    navigator.clipboard.writeText = writeText;
    renderDetail();

    await user.click(screen.getByRole('button', { name: /copy url/i }));

    expect(writeText).toHaveBeenCalledWith('https://archive.example.com');
  });

  it('opens overflow actions, closes them on outside click, and copies from the menu', async () => {
    const user = setupUser();
    const writeText = vi.fn().mockResolvedValue(undefined);
    navigator.clipboard.writeText = writeText;
    renderDetail();

    await user.click(screen.getByRole('button', { name: /archive actions/i }));
    expect(
      screen.getByRole('menuitem', { name: /edit archive/i }),
    ).toBeInTheDocument();

    await user.click(document.body);
    expect(
      screen.queryByRole('menuitem', { name: /edit archive/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /archive actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /copy url/i }));

    expect(writeText).toHaveBeenCalledWith('https://archive.example.com');
    expect(
      screen.queryByRole('menuitem', { name: /copy url/i }),
    ).not.toBeInTheDocument();
  });

  it('opens the edit dialog from the overflow menu', async () => {
    const user = setupUser();
    renderDetail();

    await user.click(screen.getByRole('button', { name: /archive actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /edit archive/i }));

    expect(
      screen.getByRole('heading', { name: /edit archive server/i }),
    ).toBeInTheDocument();
  });

  it('shows the correct primary sync action for each server state', () => {
    const { rerender } = render(
      <ArchiveServerDetail
        server={makeServer()}
        onSync={vi.fn()}
        onRemove={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: /sync now/i }),
    ).toBeInTheDocument();

    rerender(
      <ArchiveServerDetail
        server={makeServer({ error: 'Connection failed' })}
        onSync={vi.fn()}
        onRemove={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: /retry sync/i }),
    ).toBeInTheDocument();

    rerender(
      <ArchiveServerDetail
        server={makeServer({ hasCredentials: false })}
        onSync={vi.fn()}
        onRemove={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: /reconnect/i }),
    ).toBeInTheDocument();

    rerender(
      <ArchiveServerDetail
        server={makeServer({ isSyncing: true })}
        onSync={vi.fn()}
        onRemove={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /syncing/i })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('calls onSync with the server id from the primary action', async () => {
    const user = setupUser();
    const onSync = vi.fn();
    renderDetail({ onSync });

    await user.click(screen.getByRole('button', { name: /sync now/i }));

    expect(onSync).toHaveBeenCalledWith('srv-1');
  });

  it('renders compact aggregate stats and per-project row stats', async () => {
    renderDetail();

    expect(screen.getAllByText('Projects')).not.toHaveLength(0);
    expect(screen.getByText('Observations')).toBeInTheDocument();
    expect(screen.getByText('Alerts')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('1')).toHaveLength(3));
    expect(
      await screen.findByText('1 observation · 1 alert'),
    ).toBeInTheDocument();
  });

  it('renders only matching projects as tappable rows and navigates to data', async () => {
    const user = setupUser();
    renderDetail();

    const row = await screen.findByRole('button', { name: /forest monitor/i });
    expect(screen.queryByText('Ocean Watch')).not.toBeInTheDocument();

    await user.click(row);

    expect(useProjectStore.getState().selectedProjectId).toBe('proj-1');
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/data' });
  });

  it('keeps remove de-emphasized in overflow and the advanced danger zone', async () => {
    const user = setupUser();
    renderDetail();

    expect(
      screen.queryByRole('button', { name: /^remove$/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /archive actions/i }));
    expect(
      screen.getByRole('menuitem', { name: /remove archive/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByText('Advanced Settings'));
    expect(screen.getByText('Danger Zone')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /remove archive/i }),
    ).toBeInTheDocument();
  });

  it('shows technical metadata, stale warning, and error details in advanced settings', async () => {
    const user = setupUser();
    const lastSyncedAt = new Date(
      Date.now() - 25 * 60 * 60 * 1000,
    ).toISOString();
    renderDetail({
      server: makeServer({
        error: 'Connection refused',
        isStale: true,
        lastSyncedAt,
      }),
    });

    await user.click(screen.getByText('Advanced Settings'));

    expect(screen.getByText('Full URL')).toBeInTheDocument();
    expect(screen.getByText('Last synced (UTC)')).toBeInTheDocument();
    expect(screen.getByText(lastSyncedAt)).toBeInTheDocument();
    expect(screen.getByText(/token may be stale/i)).toBeInTheDocument();
    expect(screen.getByText('Connection refused')).toBeInTheDocument();
  });

  it('opens confirmation from overflow and warns that projects will move to local', async () => {
    const user = setupUser();
    const onRemove = vi.fn();
    renderDetail({ onRemove });

    await user.click(screen.getByRole('button', { name: /archive actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /remove archive/i }));

    expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
    expect(
      screen.getByText(/project will be moved to local/i),
    ).toBeInTheDocument();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('opens confirmation from the danger zone and removes after reassigning projects', async () => {
    const user = setupUser();
    const onRemove = vi.fn();
    renderDetail({ onRemove });

    await user.click(screen.getByText('Advanced Settings'));
    await user.click(screen.getByRole('button', { name: /remove archive/i }));
    await user.click(screen.getByRole('button', { name: /^remove$/i }));

    const { updateProject } = await import('@/lib/data-layer');
    await waitFor(() => {
      expect(updateProject).toHaveBeenCalledWith('proj-1', {
        serverUrl: null,
      });
      expect(onRemove).toHaveBeenCalledWith('srv-1');
    });
  });

  it('omits the reassignment warning when no projects match the archive', async () => {
    const user = setupUser();
    renderDetail({
      server: makeServer({ baseUrl: 'https://no-match.example.com' }),
    });

    await user.click(screen.getByRole('button', { name: /archive actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /remove archive/i }));

    expect(
      screen.queryByText(/project will be moved to local/i),
    ).not.toBeInTheDocument();
  });
});
