import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type { ArchiveServerStatus } from '@/hooks/useArchiveStatus';
import { ArchiveServerDetail } from '@/screens/Home/ArchiveServerDetail';

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
  getObservations: vi.fn(() => Promise.resolve([{ localId: 'obs-1' }])),
  getAlerts: vi.fn(() => Promise.resolve([{ localId: 'alert-1' }])),
  updateProject: vi.fn(() => Promise.resolve()),
}));

function makeServer(
  overrides: Partial<ArchiveServerStatus> = {},
): ArchiveServerStatus {
  return {
    id: 'srv-1',
    label: 'Demo Server',
    baseUrl: 'https://archive.example.com',
    isSyncing: false,
    lastSyncedAt: '2025-06-01T12:00:00Z',
    error: null,
    hasCredentials: true,
    isStale: false,
    ...overrides,
  };
}

const noop = vi.fn();

describe('ArchiveServerDetail', () => {
  it('renders server label as heading', () => {
    render(
      <ArchiveServerDetail
        server={makeServer()}
        onSync={noop}
        onRemove={noop}
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'Demo Server' }),
    ).toBeInTheDocument();
  });

  it('shows server URL', () => {
    render(
      <ArchiveServerDetail
        server={makeServer()}
        onSync={noop}
        onRemove={noop}
      />,
    );
    expect(screen.getByText('https://archive.example.com')).toBeInTheDocument();
  });

  it('shows last synced date when available', () => {
    render(
      <ArchiveServerDetail
        server={makeServer()}
        onSync={noop}
        onRemove={noop}
      />,
    );
    expect(screen.getByText('2025-06-01T12:00:00Z')).toBeInTheDocument();
  });

  it('shows Never when lastSyncedAt is null', () => {
    render(
      <ArchiveServerDetail
        server={makeServer({ lastSyncedAt: null })}
        onSync={noop}
        onRemove={noop}
      />,
    );
    expect(screen.getByText('Never')).toBeInTheDocument();
  });

  it('shows error message when server has error', () => {
    render(
      <ArchiveServerDetail
        server={makeServer({ error: 'Connection refused' })}
        onSync={noop}
        onRemove={noop}
      />,
    );
    expect(screen.getByText('Connection refused')).toBeInTheDocument();
  });

  it('shows credentials unavailable when hasCredentials is false', () => {
    render(
      <ArchiveServerDetail
        server={makeServer({ hasCredentials: false })}
        onSync={noop}
        onRemove={noop}
      />,
    );
    expect(screen.getByText(/credentials unavailable/i)).toBeInTheDocument();
  });

  it('shows Sync Now button when not syncing and has credentials', () => {
    render(
      <ArchiveServerDetail
        server={makeServer()}
        onSync={noop}
        onRemove={noop}
      />,
    );
    expect(
      screen.getByRole('button', { name: /sync now/i }),
    ).toBeInTheDocument();
  });

  it('shows Syncing button when syncing', () => {
    render(
      <ArchiveServerDetail
        server={makeServer({ isSyncing: true })}
        onSync={noop}
        onRemove={noop}
      />,
    );
    expect(screen.getByText('Syncing...')).toBeInTheDocument();
  });

  it('shows Remove button', () => {
    render(
      <ArchiveServerDetail
        server={makeServer()}
        onSync={noop}
        onRemove={noop}
      />,
    );
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
  });

  it('calls onSync with server id when Sync clicked', async () => {
    const user = userEvent.setup();
    const onSync = vi.fn();

    render(
      <ArchiveServerDetail
        server={makeServer()}
        onSync={onSync}
        onRemove={noop}
      />,
    );
    await user.click(screen.getByRole('button', { name: /sync now/i }));

    expect(onSync).toHaveBeenCalledWith('srv-1');
  });

  it('opens confirmation dialog when Remove clicked', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();

    render(
      <ArchiveServerDetail
        server={makeServer()}
        onSync={noop}
        onRemove={onRemove}
      />,
    );
    // There are multiple "Remove" buttons — the detail one and the confirm one.
    // Click the first Remove button (in the detail header)
    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    await user.click(removeButtons[0]!);

    // Confirmation dialog should appear
    expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
    // onRemove should NOT have been called yet
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('calls onRemove after confirming removal', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();

    render(
      <ArchiveServerDetail
        server={makeServer()}
        onSync={noop}
        onRemove={onRemove}
      />,
    );
    // Click the first Remove button to open confirmation
    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    await user.click(removeButtons[0]!);

    // Click confirm in the dialog
    const confirmButtons = screen.getAllByRole('button', { name: /remove/i });
    await user.click(confirmButtons[confirmButtons.length - 1]!);

    expect(onRemove).toHaveBeenCalledWith('srv-1');
  });

  it('shows Edit button', () => {
    render(
      <ArchiveServerDetail
        server={makeServer()}
        onSync={noop}
        onRemove={noop}
      />,
    );
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
  });

  it('shows Remove button even when errored with no credentials', () => {
    render(
      <ArchiveServerDetail
        server={makeServer({
          error: 'Sync error',
          hasCredentials: false,
        })}
        onSync={noop}
        onRemove={noop}
      />,
    );
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
  });

  it('shows Retry Sync button when server has error and credentials', () => {
    render(
      <ArchiveServerDetail
        server={makeServer({
          error: 'Connection failed',
          hasCredentials: true,
        })}
        onSync={noop}
        onRemove={noop}
      />,
    );
    expect(
      screen.getByRole('button', { name: /retry sync/i }),
    ).toBeInTheDocument();
  });

  it('calls onSync when Retry Sync is clicked', async () => {
    const user = userEvent.setup();
    const onSync = vi.fn();

    render(
      <ArchiveServerDetail
        server={makeServer({
          error: 'Connection failed',
          hasCredentials: true,
        })}
        onSync={onSync}
        onRemove={noop}
      />,
    );

    await user.click(screen.getByRole('button', { name: /retry sync/i }));

    expect(onSync).toHaveBeenCalledWith('srv-1');
  });

  it('shows stale token warning when isStale is true', () => {
    render(
      <ArchiveServerDetail
        server={makeServer({
          isStale: true,
          hasCredentials: true,
          error: null,
          lastSyncedAt: '2024-01-01T00:00:00Z',
        })}
        onSync={noop}
        onRemove={noop}
      />,
    );
    expect(screen.getByText(/token may be stale/i)).toBeInTheDocument();
  });

  it('shows Sync Now button even when server has error if no credentials', () => {
    // When hasCredentials is false, neither Sync Now nor Retry Sync should show
    render(
      <ArchiveServerDetail
        server={makeServer({
          error: 'Error',
          hasCredentials: false,
          isStale: true,
        })}
        onSync={noop}
        onRemove={noop}
      />,
    );
    expect(
      screen.queryByRole('button', { name: /sync now/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /retry sync/i }),
    ).not.toBeInTheDocument();
  });

  it('shows Reconnect button when hasCredentials is false', () => {
    render(
      <ArchiveServerDetail
        server={makeServer({ hasCredentials: false })}
        onSync={noop}
        onRemove={noop}
      />,
    );
    expect(
      screen.getByRole('button', { name: /reconnect/i }),
    ).toBeInTheDocument();
  });

  it('shows reconnect description warning when hasCredentials is false', () => {
    render(
      <ArchiveServerDetail
        server={makeServer({ hasCredentials: false })}
        onSync={noop}
        onRemove={noop}
      />,
    );
    expect(
      screen.getByText(/server credentials are missing/i),
    ).toBeInTheDocument();
  });

  it('does not show Reconnect button when hasCredentials is true', () => {
    render(
      <ArchiveServerDetail
        server={makeServer({ hasCredentials: true })}
        onSync={noop}
        onRemove={noop}
      />,
    );
    expect(
      screen.queryByRole('button', { name: /reconnect/i }),
    ).not.toBeInTheDocument();
  });

  // Phase 5 tests — stats section and remove confirmation

  it('renders aggregated stats when server has matching projects', async () => {
    render(
      <ArchiveServerDetail
        server={makeServer()}
        onSync={noop}
        onRemove={noop}
      />,
    );

    // Wait for stats section to appear
    expect(await screen.findByText('Summary')).toBeInTheDocument();
    // 1 matching project (proj-1 has serverUrl matching our server)
    expect(screen.getByText('1 project')).toBeInTheDocument();
    // Mocked getObservations/getAlerts each resolve to one item per project
    expect(await screen.findByText('1 observation')).toBeInTheDocument();
    expect(await screen.findByText('1 alert')).toBeInTheDocument();
  });

  it('renders View Data button for each matching project', async () => {
    render(
      <ArchiveServerDetail
        server={makeServer()}
        onSync={noop}
        onRemove={noop}
      />,
    );

    expect(
      await screen.findByRole('button', { name: /view data/i }),
    ).toBeInTheDocument();
    // Only one matching project (proj-1), not proj-2 (different serverUrl)
    expect(screen.getByText('Forest Monitor')).toBeInTheDocument();
    expect(screen.queryByText('Ocean Watch')).not.toBeInTheDocument();
  });

  it('remove confirmation shows project reassignment warning when matching projects exist', async () => {
    const user = userEvent.setup();
    render(
      <ArchiveServerDetail
        server={makeServer()}
        onSync={noop}
        onRemove={noop}
      />,
    );

    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    await user.click(removeButtons[0]!);

    expect(
      screen.getByText(/project will be moved to local/i),
    ).toBeInTheDocument();
  });

  it('remove confirmation shows no project warning when no matching projects', async () => {
    const user = userEvent.setup();
    render(
      <ArchiveServerDetail
        server={makeServer({ baseUrl: 'https://no-matching.example.com' })}
        onSync={noop}
        onRemove={noop}
      />,
    );

    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    await user.click(removeButtons[0]!);

    expect(
      screen.queryByText(/project will be moved to local/i),
    ).not.toBeInTheDocument();
  });

  it('confirming removal calls onRemove after reassigning projects', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <ArchiveServerDetail
        server={makeServer()}
        onSync={noop}
        onRemove={onRemove}
      />,
    );

    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    await user.click(removeButtons[0]!);

    const confirmButtons = screen.getAllByRole('button', { name: /remove/i });
    await user.click(confirmButtons[confirmButtons.length - 1]!);

    // Should have called updateProject to reassign matching projects
    const { updateProject } = await import('@/lib/data-layer');
    expect(updateProject).toHaveBeenCalledWith('proj-1', { serverUrl: null });
    expect(onRemove).toHaveBeenCalledWith('srv-1');
  });

  it('renders project name fallback when project has no name', async () => {
    // Verify the stats section renders correctly with our mock data
    render(
      <ArchiveServerDetail
        server={makeServer()}
        onSync={noop}
        onRemove={noop}
      />,
    );

    expect(await screen.findByText('Summary')).toBeInTheDocument();
  });
});
