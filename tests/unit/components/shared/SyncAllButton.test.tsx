import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act } from 'react';

import { SyncAllButton } from '@/components/shared/SyncAllButton';
import { syncRemoteArchive } from '@/lib/data-layer';
import type { SyncResult } from '@/lib/sync';
import type { RemoteArchiveServer } from '@/stores/auth-store';
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

const mockSync = vi.mocked(syncRemoteArchive);

function server(
  id: string,
  overrides: Partial<RemoteArchiveServer> = {},
): RemoteArchiveServer {
  return {
    id,
    label: `Archive ${id}`,
    baseUrl: `https://${id}.example.com`,
    token: `token-${id}`,
    status: 'idle',
    ...overrides,
  };
}

function readyResult(serverId: string): SyncResult {
  return {
    success: true,
    status: 'ready',
    serverId,
    projects: [],
    warnings: [],
  };
}

function failedResult(
  serverId: string,
  errorCode?: SyncResult['errorCode'],
): SyncResult {
  return {
    success: false,
    status: errorCode === 'partial' ? 'partial' : 'error',
    serverId,
    projects: [],
    warnings: [],
    ...(errorCode ? { errorCode } : {}),
  };
}

function visibleToasts(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('li[role="status"]'),
  );
}

async function clickSyncAll() {
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'Sync all archives now' }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSync.mockImplementation(async (serverId: string) =>
    readyResult(serverId),
  );
  useAuthStore.setState({
    servers: [server('server-1'), server('server-2')],
    activeServerId: 'server-1',
    token: 'token-server-1',
    baseUrl: 'https://server-1.example.com',
  });
});

describe('SyncAllButton', () => {
  it('renders an icon, a label, and an accessible name', () => {
    render(<SyncAllButton />);

    const button = screen.getByRole('button', {
      name: 'Sync all archives now',
    });
    expect(button).toHaveTextContent('Sync all');
    expect(button.querySelector('svg')).toBeInTheDocument();
  });

  it('is enabled, not busy, and pointer-affordant when idle', () => {
    render(<SyncAllButton />);

    const button = screen.getByRole('button', {
      name: 'Sync all archives now',
    });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute('aria-busy', 'false');
    expect(button.className).toContain('cursor-pointer');
  });

  it('keeps the 44px touch target at every viewport', () => {
    render(<SyncAllButton />);

    const button = screen.getByRole('button', {
      name: 'Sync all archives now',
    });
    expect(button.className).toContain('min-h-[44px]');
    expect(button.className).not.toContain('sm:min-h-8');
  });

  it('issues exactly one call per eligible server', async () => {
    render(<SyncAllButton />);

    await clickSyncAll();

    expect(mockSync).toHaveBeenCalledTimes(2);
    expect(mockSync).toHaveBeenCalledWith('server-1', {
      baseUrl: 'https://server-1.example.com',
      token: 'token-server-1',
    });
    await screen.findByText('All archives synced');
  });

  it('skips servers that are not syncable', async () => {
    useAuthStore.setState({
      servers: [
        server('server-1'),
        server('no-token', { token: null }),
        server('cancelled', { onboardingStatus: 'cancelled' }),
      ],
    });
    render(<SyncAllButton />);

    await clickSyncAll();

    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockSync).toHaveBeenCalledWith('server-1', expect.anything());
    await screen.findByText('All archives synced');
  });

  it('disables and marks busy while a sync is in flight', async () => {
    let resolveAll!: (value: SyncResult) => void;
    mockSync.mockReturnValue(
      new Promise<SyncResult>((resolve) => {
        resolveAll = resolve;
      }),
    );
    render(<SyncAllButton />);

    const button = screen.getByRole('button', {
      name: 'Sync all archives now',
    });
    await userEvent.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    await act(async () => {
      resolveAll(readyResult('server-1'));
    });
    await screen.findByText('All archives synced');

    expect(button).toBeEnabled();
    expect(button).toHaveAttribute('aria-busy', 'false');
  });

  it('ignores a second click while a sync is in flight', async () => {
    let resolveAll!: (value: SyncResult) => void;
    mockSync.mockReturnValue(
      new Promise<SyncResult>((resolve) => {
        resolveAll = resolve;
      }),
    );
    render(<SyncAllButton />);

    const button = screen.getByRole('button', {
      name: 'Sync all archives now',
    });
    const first = userEvent.click(button);
    const second = userEvent.click(button);
    await Promise.all([first, second]);

    expect(mockSync).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveAll(readyResult('server-1'));
    });
    await screen.findByText('All archives synced');
    // One user intent, one outcome — never a "0 of 0" follow-up toast.
    expect(visibleToasts()).toHaveLength(1);
  });

  it('does not toast when nothing is eligible', async () => {
    useAuthStore.setState({
      servers: [server('no-token', { token: null })],
    });
    render(<SyncAllButton />);

    const button = screen.getByRole('button', {
      name: 'Sync all archives now',
    });
    expect(button).toBeDisabled();
    await userEvent.click(button);

    expect(mockSync).not.toHaveBeenCalled();
    expect(visibleToasts()).toHaveLength(0);
  });

  it('shows one aggregate success toast when every archive is ready', async () => {
    render(<SyncAllButton />);

    await clickSyncAll();

    await screen.findByText('All archives synced');
    expect(visibleToasts()).toHaveLength(1);
    expect(visibleToasts()[0]!.className).toContain('bg-success-soft');
  });

  it('shows the count summary with a partial outcome as info', async () => {
    mockSync.mockImplementation(async (serverId: string) =>
      serverId === 'server-2'
        ? failedResult(serverId, 'partial')
        : readyResult(serverId),
    );
    render(<SyncAllButton />);

    await clickSyncAll();

    await screen.findByText('Some data synced');
    expect(
      screen.getByText(
        '1 of 2 archives synced. Some resources failed — try again.',
      ),
    ).toBeInTheDocument();
    expect(visibleToasts()[0]!.className).toContain('bg-info-soft');
  });

  it('shows the generic failure toast without a Reconnect action for auth failures', async () => {
    mockSync.mockImplementation(async (serverId: string) =>
      serverId === 'server-2'
        ? failedResult(serverId, 'authorization')
        : readyResult(serverId),
    );
    render(<SyncAllButton />);

    await clickSyncAll();

    await screen.findByText('Sync failed');
    expect(
      screen.getByText(
        '1 of 2 archives synced. Check the archives listed in Home.',
      ),
    ).toBeInTheDocument();
    expect(visibleToasts()[0]!.className).toContain('bg-error-soft');
    // Deliberate downgrade: several archives may have failed, so the aggregate
    // names none and points at Home instead.
    expect(
      screen.queryByRole('button', { name: 'Reconnect' }),
    ).not.toBeInTheDocument();
  });

  it('treats credentials-required as the same aggregate failure tier', async () => {
    mockSync.mockImplementation(async (serverId: string) =>
      serverId === 'server-1'
        ? failedResult(serverId, 'credentials-required')
        : readyResult(serverId),
    );
    render(<SyncAllButton />);

    await clickSyncAll();

    await screen.findByText('Sync failed');
    expect(visibleToasts()[0]!.className).toContain('bg-error-soft');
  });

  it('ranks auth failures above lifecycle info outcomes', async () => {
    mockSync.mockImplementation(async (serverId: string) => {
      if (serverId === 'server-1')
        return failedResult(serverId, 'storage-cleanup-required');
      if (serverId === 'server-2')
        return failedResult(serverId, 'authorization');
      return readyResult(serverId);
    });
    render(<SyncAllButton />);

    await clickSyncAll();

    await screen.findByText('Sync failed');
    expect(visibleToasts()[0]!.className).toContain('bg-error-soft');
    expect(
      screen.queryByText('Sync paused: storage cleanup needed'),
    ).not.toBeInTheDocument();
  });

  it('shows the storage-cleanup aggregate with an Open Settings action', async () => {
    mockSync.mockImplementation(async (serverId: string) =>
      serverId === 'server-2'
        ? failedResult(serverId, 'storage-cleanup-required')
        : readyResult(serverId),
    );
    render(<SyncAllButton />);

    await clickSyncAll();

    await screen.findByText('Sync paused: storage cleanup needed');
    expect(
      screen.getByText(
        '1 of 2 archives synced. Check the archives listed in Home.',
      ),
    ).toBeInTheDocument();
    expect(visibleToasts()[0]!.className).toContain('bg-info-soft');

    await userEvent.click(
      screen.getByRole('button', { name: 'Open Settings' }),
    );
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings' });
  });

  it('shows the worker-transition aggregate as info', async () => {
    mockSync.mockImplementation(async (serverId: string) =>
      serverId === 'server-2'
        ? failedResult(serverId, 'worker-transition-required')
        : readyResult(serverId),
    );
    render(<SyncAllButton />);

    await clickSyncAll();

    await screen.findByText('Sync paused: app update in progress');
    expect(visibleToasts()[0]!.className).toContain('bg-info-soft');
    expect(
      screen.queryByRole('button', { name: 'Open Settings' }),
    ).not.toBeInTheDocument();
  });

  it('reports a generic error for a plain failed server', async () => {
    mockSync.mockImplementation(async (serverId: string) => {
      if (serverId === 'server-2') throw new Error('Network down');
      return readyResult(serverId);
    });
    render(<SyncAllButton />);

    await clickSyncAll();

    await screen.findByText('Sync failed');
    expect(
      screen.getByText(
        '1 of 2 archives synced. Check the archives listed in Home.',
      ),
    ).toBeInTheDocument();
    expect(visibleToasts()[0]!.className).toContain('bg-error-soft');
  });

  it('reports a generic error for a connection-coded failure', async () => {
    useAuthStore.setState({ servers: [server('server-1')] });
    mockSync.mockImplementation(async (serverId: string) =>
      failedResult(serverId, 'connection'),
    );
    render(<SyncAllButton />);

    await clickSyncAll();

    await screen.findByText('Sync failed');
    expect(
      screen.getByText(
        '0 of 1 archives synced. Check the archives listed in Home.',
      ),
    ).toBeInTheDocument();
    expect(visibleToasts()).toHaveLength(1);
    expect(visibleToasts()[0]!.className).toContain('bg-error-soft');
    expect(
      screen.queryByRole('button', { name: 'Open Settings' }),
    ).not.toBeInTheDocument();
  });

  it('never reports success for a failed result flagged ready', async () => {
    useAuthStore.setState({ servers: [server('server-1')] });
    mockSync.mockImplementation(async (serverId: string) => ({
      ...readyResult(serverId),
      success: false,
    }));
    render(<SyncAllButton />);

    await clickSyncAll();

    await screen.findByText('Sync failed');
    expect(screen.queryByText('All archives synced')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        '0 of 1 archives synced. Check the archives listed in Home.',
      ),
    ).toBeInTheDocument();
    expect(visibleToasts()).toHaveLength(1);
    expect(visibleToasts()[0]!.className).toContain('bg-error-soft');
    expect(
      screen.queryByRole('button', { name: 'Open Settings' }),
    ).not.toBeInTheDocument();
  });

  it('survives unmounting mid-sync and remounts enabled', async () => {
    let resolveAll!: (value: SyncResult) => void;
    mockSync.mockReturnValue(
      new Promise<SyncResult>((resolve) => {
        resolveAll = resolve;
      }),
    );
    const { unmount } = render(<SyncAllButton />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Sync all archives now' }),
    );
    expect(() => unmount()).not.toThrow();

    await act(async () => {
      resolveAll(readyResult('server-1'));
    });

    render(<SyncAllButton />);
    const remounted = screen.getByRole('button', {
      name: 'Sync all archives now',
    });
    expect(remounted).toBeEnabled();
    expect(remounted).toHaveAttribute('aria-busy', 'false');
  });
});
