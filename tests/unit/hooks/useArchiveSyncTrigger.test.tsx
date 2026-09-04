import {
  createQueryWrapper,
  renderHook,
  screen,
  userEvent,
} from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act } from 'react';

import { useArchiveSyncTrigger } from '@/hooks/useArchiveSyncTrigger';
import type { SyncResult } from '@/lib/sync';
import type { RemoteArchiveServer } from '@/stores/auth-store';
import { useAuthStore } from '@/stores/auth-store';
import { useProjectStore } from '@/stores/project-store';

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

const SERVER_ID = 'server-1';
const SERVER_NAME = 'North Archive';

function credentialedServer(
  overrides: Partial<RemoteArchiveServer> = {},
): RemoteArchiveServer {
  return {
    id: SERVER_ID,
    label: SERVER_NAME,
    baseUrl: 'https://archive.example.com',
    token: 'token-1',
    status: 'idle',
    ...overrides,
  };
}

function readyResult(serverId = SERVER_ID): SyncResult {
  return {
    success: true,
    status: 'ready',
    serverId,
    projects: [],
    warnings: [],
  };
}

function visibleToasts(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('li[role="status"]'),
  );
}

async function runSync(serverId = SERVER_ID) {
  const { result } = renderHook(() => useArchiveSyncTrigger(), {
    wrapper: createQueryWrapper(),
  });
  await act(async () => {
    await result.current(serverId);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSyncRemoteArchive.mockResolvedValue(readyResult());
  useAuthStore.setState({
    servers: [credentialedServer()],
    activeServerId: SERVER_ID,
    token: 'token-1',
    baseUrl: 'https://archive.example.com',
  });
  useProjectStore.setState({ selectedServerId: null });
});

describe('useArchiveSyncTrigger — trigger', () => {
  it('resolves the server by id and issues exactly one call with its credentials', async () => {
    await runSync();

    expect(mockSyncRemoteArchive).toHaveBeenCalledOnce();
    expect(mockSyncRemoteArchive).toHaveBeenCalledWith(SERVER_ID, {
      baseUrl: 'https://archive.example.com',
      token: 'token-1',
    });
  });

  it('issues zero calls while the server is already syncing', async () => {
    useAuthStore.setState({
      servers: [credentialedServer({ status: 'syncing' })],
    });

    await runSync();

    expect(mockSyncRemoteArchive).not.toHaveBeenCalled();
  });

  it('issues zero calls when the server has no token', async () => {
    useAuthStore.setState({ servers: [credentialedServer({ token: null })] });

    await runSync();

    expect(mockSyncRemoteArchive).not.toHaveBeenCalled();
  });

  it('issues zero calls for an unknown server id', async () => {
    await runSync('missing-server');

    expect(mockSyncRemoteArchive).not.toHaveBeenCalled();
  });

  it('does not throw when the sync call rejects', async () => {
    mockSyncRemoteArchive.mockRejectedValue(new Error('Network down'));

    await expect(runSync()).resolves.toBeUndefined();
  });
});

describe('useArchiveSyncTrigger — outcome mapping', () => {
  it('shows a success toast naming the archive when status is ready', async () => {
    await runSync();

    expect(screen.getByText('Archive synced')).toBeInTheDocument();
    expect(screen.getByText(SERVER_NAME)).toBeInTheDocument();
    expect(visibleToasts()[0]!.className).toContain('bg-success-soft');
    // No recovery affordance on success.
    expect(
      screen.queryByRole('button', { name: 'Reconnect' }),
    ).not.toBeInTheDocument();
  });

  it('routes a partial outcome to an info toast, not the error toast', async () => {
    mockSyncRemoteArchive.mockResolvedValue({
      ...readyResult(),
      success: false,
      status: 'partial',
      errorCode: 'partial',
    });

    await runSync();

    expect(
      screen.getByText(`Some data synced for ${SERVER_NAME}`),
    ).toBeInTheDocument();
    expect(visibleToasts()[0]!.className).toContain('bg-info-soft');
    expect(
      screen.queryByText(`Couldn't sync ${SERVER_NAME}`),
    ).not.toBeInTheDocument();
  });

  it('routes an errorCode-only partial to info even when status is error', async () => {
    mockSyncRemoteArchive.mockResolvedValue({
      ...readyResult(),
      success: false,
      status: 'error',
      errorCode: 'partial',
    });

    await runSync();

    expect(
      screen.getByText(`Some data synced for ${SERVER_NAME}`),
    ).toBeInTheDocument();
    expect(visibleToasts()[0]!.className).toContain('bg-info-soft');
  });

  it('shows an error toast with a Reconnect action on authorization failure', async () => {
    mockSyncRemoteArchive.mockResolvedValue({
      ...readyResult(),
      success: false,
      status: 'error',
      errorCode: 'authorization',
    });

    await runSync();

    expect(
      screen.getByText(
        `Session expired — reconnect ${SERVER_NAME} to continue`,
      ),
    ).toBeInTheDocument();
    expect(visibleToasts()[0]!.className).toContain('bg-error-soft');

    const reconnect = screen.getByRole('button', { name: 'Reconnect' });
    expect(reconnect.className).toContain('min-h-[44px]');
    expect(reconnect).toHaveAttribute('aria-label', 'Reconnect');

    await userEvent.click(reconnect);
    expect(useProjectStore.getState().selectedServerId).toBe(SERVER_ID);
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/' });
  });

  it('shows an error toast with a Reconnect action when credentials are required', async () => {
    mockSyncRemoteArchive.mockResolvedValue({
      ...readyResult(),
      success: false,
      status: 'error',
      errorCode: 'credentials-required',
    });

    await runSync();

    expect(
      screen.getByText(`Token missing — reconnect ${SERVER_NAME}`),
    ).toBeInTheDocument();
    expect(visibleToasts()[0]!.className).toContain('bg-error-soft');
    expect(
      screen.getByRole('button', { name: 'Reconnect' }),
    ).toBeInTheDocument();
  });

  it('shows a connection error toast without an action', async () => {
    mockSyncRemoteArchive.mockResolvedValue({
      ...readyResult(),
      success: false,
      status: 'error',
      errorCode: 'connection',
    });

    await runSync();

    expect(
      screen.getByText(`Couldn't reach ${SERVER_NAME} — check your connection`),
    ).toBeInTheDocument();
    expect(visibleToasts()[0]!.className).toContain('bg-error-soft');
    expect(
      screen.queryByRole('button', { name: 'Reconnect' }),
    ).not.toBeInTheDocument();
  });

  it('shows an info toast with an Open Settings action on storage cleanup', async () => {
    mockSyncRemoteArchive.mockResolvedValue({
      ...readyResult(),
      success: false,
      status: 'error',
      errorCode: 'storage-cleanup-required',
    });

    await runSync();

    expect(
      screen.getByText(
        `Sync paused: storage cleanup needed for ${SERVER_NAME}`,
      ),
    ).toBeInTheDocument();
    expect(visibleToasts()[0]!.className).toContain('bg-info-soft');

    await userEvent.click(
      screen.getByRole('button', { name: 'Open Settings' }),
    );
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings' });
  });

  it('shows an info toast without an action on worker transition', async () => {
    mockSyncRemoteArchive.mockResolvedValue({
      ...readyResult(),
      success: false,
      status: 'error',
      errorCode: 'worker-transition-required',
    });

    await runSync();

    expect(
      screen.getByText(
        'Sync paused: app update in progress — try again shortly',
      ),
    ).toBeInTheDocument();
    expect(visibleToasts()[0]!.className).toContain('bg-info-soft');
    expect(
      screen.queryByRole('button', { name: 'Open Settings' }),
    ).not.toBeInTheDocument();
  });

  it('falls back to the generic error toast when the call rejects', async () => {
    mockSyncRemoteArchive.mockRejectedValue(new Error('Network down'));

    await runSync();

    expect(
      screen.getByText(`Couldn't sync ${SERVER_NAME}`),
    ).toBeInTheDocument();
    expect(visibleToasts()[0]!.className).toContain('bg-error-soft');
    expect(
      screen.queryByRole('button', { name: 'Reconnect' }),
    ).not.toBeInTheDocument();
  });

  it('falls back to the generic error toast for an unmapped failure shape', async () => {
    mockSyncRemoteArchive.mockResolvedValue({
      ...readyResult(),
      success: false,
      status: 'error',
    });

    await runSync();

    expect(
      screen.getByText(`Couldn't sync ${SERVER_NAME}`),
    ).toBeInTheDocument();
    expect(visibleToasts()[0]!.className).toContain('bg-error-soft');
  });

  it('shows exactly one toast per trigger', async () => {
    await runSync();

    expect(visibleToasts()).toHaveLength(1);
  });
});
