import { render, screen, waitFor } from '@tests/mocks/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import React from 'react';

import { ApiError, apiClient, redeemEncryptedInvite } from '@/lib/api-client';
import { resetDb } from '@/lib/db';
import { createRemoteServer, getRemoteServers } from '@/lib/local-repositories';
import { syncRemoteArchive } from '@/lib/sync';
import type { SyncResult } from '@/lib/sync';
import * as syncCoordinator from '@/lib/sync-coordinator';
import { resetSyncCoordinatorForTests } from '@/lib/sync-coordinator';
import { InviteScreen } from '@/screens/InviteScreen';
import { useAuthStore } from '@/stores/auth-store';

// Mock navigate and Link
const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    Link: ({
      children,
      to,
      ...props
    }: {
      children: React.ReactNode;
      to: string;
      [key: string]: unknown;
    }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  };
});

// Mock the low-level sync engine. InviteScreen exercises the real coordinator.
vi.mock('@/lib/sync', () => ({
  syncRemoteArchive: vi.fn((serverId: string) =>
    Promise.resolve({
      success: true,
      status: 'ready',
      serverId,
      projects: [],
      warnings: [],
    }),
  ),
}));

vi.mock('@/lib/query-client', () => ({
  queryClient: { invalidateQueries: vi.fn().mockResolvedValue(undefined) },
}));

// Mock redeemEncryptedInvite — wraps the real implementation so MSW handlers
// still process encrypted/expired codes, but allows per-test overrides for
// network-failure simulation.
vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return {
    ...actual,
    redeemEncryptedInvite: vi.fn(
      (...args: Parameters<typeof actual.redeemEncryptedInvite>) =>
        actual.redeemEncryptedInvite(...args),
    ),
  };
});

function readyResult(serverId = 'test-server-id'): SyncResult {
  return {
    success: true,
    status: 'ready',
    serverId,
    projects: [],
    warnings: [],
  };
}

function failedResult(error: string): SyncResult {
  return {
    success: false,
    status: 'error',
    serverId: 'test-server-id',
    projects: [],
    warnings: [],
    error,
  };
}

function codedFailedResult(
  error: string,
  errorCode: 'authorization' | 'connection',
): SyncResult & { errorCode: typeof errorCode } {
  return {
    ...failedResult(error),
    errorCode,
  };
}

function partialResult(): SyncResult & { errorCode: 'partial' } {
  return {
    success: false,
    status: 'partial',
    serverId: 'test-server-id',
    projects: [],
    warnings: ['Some archive data could not be synced'],
    error: 'Partial sync',
    errorCode: 'partial',
  };
}

function setSearchParams(params: string) {
  const origin = 'http://localhost:5173';
  Object.defineProperty(window, 'location', {
    value: {
      search: params,
      origin,
      href: `${origin}/invite${params}`,
      pathname: '/invite',
      protocol: 'http:',
      host: 'localhost:5173',
      hostname: 'localhost',
      port: '5173',
    },
    writable: true,
  });
}

describe('InviteScreen', () => {
  beforeEach(async () => {
    resetSyncCoordinatorForTests();
    await resetDb();
    await useAuthStore.getState().clearAll();
    vi.mocked(syncRemoteArchive).mockReset().mockResolvedValue(readyResult());
    const actualApiClient =
      await vi.importActual<typeof import('@/lib/api-client')>(
        '@/lib/api-client',
      );
    vi.mocked(redeemEncryptedInvite)
      .mockReset()
      .mockImplementation(
        (...args: Parameters<typeof actualApiClient.redeemEncryptedInvite>) =>
          actualApiClient.redeemEncryptedInvite(...args),
      );
  });

  afterEach(async () => {
    resetSyncCoordinatorForTests();
    vi.clearAllMocks();
    await useAuthStore.getState().clearAll();
  });

  // -----------------------------------------------------------------------
  // Progress UI rendering
  // -----------------------------------------------------------------------
  it('renders all four progress steps', async () => {
    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');
    render(<InviteScreen />);
    // Step labels should be visible
    expect(screen.getByText('Verifying invite...')).toBeInTheDocument();
    expect(screen.getByText('Connecting to server...')).toBeInTheDocument();
    expect(screen.getByText('Syncing data...')).toBeInTheDocument();
    expect(screen.getByText('Preparing dashboard...')).toBeInTheDocument();
  });

  it('shows spinner inside the progress heading', async () => {
    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');
    render(<InviteScreen />);
    // The heading row has a spinner (role="img")
    const heading = screen.getByText('Connecting to archive...');
    const container = heading.closest('div');
    expect(container?.querySelector('[role="img"]')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Success flow
  // -----------------------------------------------------------------------
  it('shows Connected! success state after sync completes', async () => {
    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');
    render(<InviteScreen />);
    await waitFor(() => {
      expect(screen.getByText('Connected!')).toBeInTheDocument();
    });
    expect(screen.getByText('Redirecting...')).toBeInTheDocument();
  });

  it('navigates to home after success delay', async () => {
    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');
    render(<InviteScreen />);
    await waitFor(
      () => {
        expect(mockNavigate).toHaveBeenCalledWith({ to: '/' });
      },
      { timeout: 3000 },
    );
  });

  // -----------------------------------------------------------------------
  // Error state — retry button
  // -----------------------------------------------------------------------
  it('shows Try Again button on error', async () => {
    vi.mocked(syncRemoteArchive).mockResolvedValue(failedResult('Test error'));
    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');
    render(<InviteScreen />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /try again/i }),
      ).toBeInTheDocument();
    });
  });

  it('shows Go to Home link on error', async () => {
    vi.mocked(syncRemoteArchive).mockResolvedValue(failedResult('Test error'));
    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');
    render(<InviteScreen />);
    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: /go to home/i }),
      ).toBeInTheDocument();
    });
  });

  it('Try Again button restarts the connection flow', async () => {
    // First call fails
    vi.mocked(syncRemoteArchive).mockResolvedValue(failedResult('Test error'));
    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');
    render(<InviteScreen />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /try again/i }),
      ).toBeInTheDocument();
    });

    // Click Try Again
    screen.getByRole('button', { name: /try again/i }).click();

    // Should reset to loading state with "Verifying invite..." step active
    await waitFor(() => {
      expect(screen.getByText('Connecting to archive...')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Expired invite
  // -----------------------------------------------------------------------
  it('shows expired message with Try Again and Go Home', async () => {
    setSearchParams('?code=expired');
    render(<InviteScreen />);
    await waitFor(() => {
      expect(
        screen.getByText(
          'This invite has expired. Ask the sender for a new one.',
        ),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', { name: /try again/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /go to home/i }),
    ).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Invalid invite
  // -----------------------------------------------------------------------
  it('shows invalid message immediately for bad URLs', async () => {
    setSearchParams('?hash=abc123');
    render(<InviteScreen />);
    await waitFor(() => {
      expect(
        screen.getByText(
          "Couldn't accept this invite. The URL or code may be invalid.",
        ),
      ).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Cancelled ref cleanup
  // -----------------------------------------------------------------------
  it('does not set state after unmount (cleanup)', async () => {
    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');
    // Use a never-resolving sync to test mid-flight unmount
    vi.mocked(syncRemoteArchive).mockReturnValue(new Promise(() => {}));
    const { unmount } = render(<InviteScreen />);
    // Should show loading
    expect(screen.getByText('Connecting to archive...')).toBeInTheDocument();
    // Unmount before sync resolves
    unmount();
    // No error — the cancelled ref prevented state updates on unmounted component
  });

  // -----------------------------------------------------------------------
  // Regression #182: validation must run BEFORE any server state is persisted
  // -----------------------------------------------------------------------
  it('does not overwrite an existing server when a replacement invite token is rejected (401)', async () => {
    // Seed an already-connected archive that the invite targets.
    useAuthStore.setState({
      servers: [
        {
          id: 'existing-archive',
          label: 'archive.test',
          baseUrl: 'https://archive.test',
          token: 'working-token',
          status: 'connected',
        },
      ],
    });
    const addServerSpy = vi.spyOn(useAuthStore.getState(), 'addServer');
    vi.spyOn(apiClient, 'healthCheck').mockResolvedValueOnce(true);
    vi.spyOn(apiClient, 'getProjects').mockRejectedValueOnce(
      new ApiError(401, 'UNAUTHORIZED', 'Invalid bearer token'),
    );

    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');
    render(<InviteScreen />);

    await waitFor(() => {
      expect(
        screen.getByText('Invalid token or unauthorized'),
      ).toBeInTheDocument();
    });

    // The old working connection must be untouched — addServer never ran.
    expect(addServerSpy).not.toHaveBeenCalled();
    const servers = useAuthStore.getState().servers;
    expect(servers).toHaveLength(1);
    expect(servers[0]!.token).toBe('working-token');
  });

  it('does not create a server record when the invite targets an unreachable server', async () => {
    const addServerSpy = vi.spyOn(useAuthStore.getState(), 'addServer');
    vi.spyOn(apiClient, 'healthCheck').mockResolvedValueOnce(false);

    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');
    render(<InviteScreen />);

    await waitFor(() => {
      expect(
        screen.getByText('Unable to connect. Check your internet connection.'),
      ).toBeInTheDocument();
    });

    expect(addServerSpy).not.toHaveBeenCalled();
    expect(useAuthStore.getState().servers).toHaveLength(0);
  });

  it('shows the network message when pre-persist validation times out', async () => {
    const addServerSpy = vi.spyOn(useAuthStore.getState(), 'addServer');
    vi.spyOn(apiClient, 'healthCheck').mockRejectedValueOnce(
      new Error('Archive validation timed out'),
    );

    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');
    render(<InviteScreen />);

    await waitFor(() => {
      expect(
        screen.getByText('Unable to connect. Check your internet connection.'),
      ).toBeInTheDocument();
    });
    expect(addServerSpy).not.toHaveBeenCalled();
  });

  it('passes a cancellation control into the sync so unmount aborts it', async () => {
    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');
    // Never-settling sync (empty executor — no resolvers used) to test
    // mid-flight unmount; matches the existing cleanup test pattern.
    vi.mocked(syncRemoteArchive).mockReturnValue(
      new Promise<SyncResult>(() => {}),
    );
    const syncArchiveSpy = vi.spyOn(syncCoordinator, 'syncArchive');

    const { unmount } = render(<InviteScreen />);
    await waitFor(() => {
      expect(syncArchiveSpy).toHaveBeenCalled();
    });

    const control = syncArchiveSpy.mock.calls[0]![2];
    expect(control?.isCancelled).toBeTypeOf('function');
    expect(control?.isCancelled?.()).toBe(false);
    expect(control?.deferScopedConsolidation).toBe(true);

    unmount();
    expect(control?.isCancelled?.()).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Regression #182: a cancelled invite must leave no orphan server record
  // -----------------------------------------------------------------------
  it('removes the server record when the screen unmounts mid-addServer', async () => {
    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');

    // Capture the real actions so they can be reinstalled on the live store
    // state in finally. Zustand copies actions forward onto new state objects
    // on set(), so mockRestore() (which targets the object captured at
    // spyOn-time) is not enough to fully restore the store.
    const realAddServer = useAuthStore.getState().addServer;
    const realRemoveServer = useAuthStore.getState().removeServer;
    const removeServerSpy = vi.spyOn(useAuthStore.getState(), 'removeServer');

    // Hold addServer in flight; release it AFTER unmount. On release,
    // persist a realistic server record DIRECTLY into the store (bypassing
    // Dexie so the record exists deterministically, unlike the real
    // implementation) and resolve — the component must notice the cancelled
    // ref and roll the orphaned record back.
    let releaseAddServer!: () => void;
    const addServerSpy = vi
      .spyOn(useAuthStore.getState(), 'addServer')
      .mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            releaseAddServer = () => {
              useAuthStore.setState((s) => ({
                servers: [
                  ...s.servers,
                  {
                    id: 'server-1',
                    label: 'archive.test',
                    baseUrl: 'https://archive.test',
                    token: 'abc123',
                    status: 'idle',
                  },
                ],
              }));
              resolve('server-1');
            };
          }),
      );

    try {
      const { unmount } = render(<InviteScreen />);

      await waitFor(() => {
        expect(addServerSpy).toHaveBeenCalled();
      });

      unmount();
      releaseAddServer();

      // The invite resolved after unmount — the rollback must have removed
      // the orphaned server record. On pre-fix source (no rollback) the
      // record persists, so this fails with length 1.
      await waitFor(() => {
        expect(useAuthStore.getState().servers).toHaveLength(0);
      });

      // Directly proves the rollback branch ran: removeServer was invoked
      // for the record created by the cancelled invite.
      expect(removeServerSpy).toHaveBeenCalledWith('server-1');
    } finally {
      addServerSpy.mockRestore();
      removeServerSpy.mockRestore();
      useAuthStore.setState((s) => ({
        ...s,
        addServer: realAddServer,
        removeServer: realRemoveServer,
      }));
    }
  });

  it('restores an existing connected server when the screen unmounts mid-sync', async () => {
    const snapshot = {
      id: 'existing-archive',
      label: 'archive.test',
      baseUrl: 'https://archive.test',
      token: 'old',
      status: 'connected' as const,
      onboardingStatus: 'ready' as const,
      lastSyncedAt: '2026-08-01T12:00:00.000Z',
      lastSuccessfulSyncAt: '2026-08-01T12:00:00.000Z',
      errorMessage: undefined,
    };
    useAuthStore.setState({ servers: [snapshot] });

    let resolveSync!: (result: SyncResult) => void;
    vi.mocked(syncRemoteArchive).mockReturnValueOnce(
      new Promise<SyncResult>((resolve) => {
        resolveSync = resolve;
      }),
    );

    setSearchParams('?hash=new&url=https%3A%2F%2Farchive.test');
    const { unmount } = render(<InviteScreen />);

    await waitFor(() => {
      expect(useAuthStore.getState().servers[0]!.token).toBe('new');
      expect(syncRemoteArchive).toHaveBeenCalledOnce();
    });

    unmount();
    resolveSync(readyResult(snapshot.id));

    await waitFor(() => {
      expect(useAuthStore.getState().servers[0]).toEqual(snapshot);
    });
  });

  it('restores an existing connected server and shows auth guidance when sync loses authorization', async () => {
    const snapshot = {
      id: 'existing-archive',
      label: 'archive.test',
      baseUrl: 'https://archive.test',
      token: 'old',
      status: 'connected' as const,
      onboardingStatus: 'ready' as const,
      lastSyncedAt: '2026-08-01T12:00:00.000Z',
      lastSuccessfulSyncAt: '2026-08-01T12:00:00.000Z',
      errorMessage: undefined,
    };
    useAuthStore.setState({ servers: [snapshot] });
    vi.mocked(syncRemoteArchive).mockResolvedValueOnce(
      codedFailedResult('Invalid bearer credential', 'authorization'),
    );

    setSearchParams('?hash=new&url=https%3A%2F%2Farchive.test');
    render(<InviteScreen />);

    await waitFor(() => {
      expect(
        screen.getByText('Invalid token or unauthorized'),
      ).toBeInTheDocument();
    });
    expect(useAuthStore.getState().servers[0]).toEqual(snapshot);
  });

  it('passes encrypted project scope into addServer and sync metadata', async () => {
    const { redeemEncryptedInvite } = await import('@/lib/api-client');
    vi.mocked(redeemEncryptedInvite).mockResolvedValueOnce({
      baseUrl: 'https://archive.test',
      token: 'scoped-token',
      accessScope: { type: 'project', projectId: 'project-a' },
    });
    vi.spyOn(apiClient, 'healthCheck').mockResolvedValueOnce(true);
    vi.spyOn(apiClient, 'getProjects').mockResolvedValueOnce({
      data: [{ projectId: 'project-a', name: 'Project A' }],
    });

    setSearchParams('?code=scoped-code');
    render(<InviteScreen />);

    await waitFor(() => {
      const servers = useAuthStore.getState().servers;
      expect(servers).toHaveLength(1);
      expect(servers[0]).toMatchObject({
        token: 'scoped-token',
        accessScope: { type: 'project', projectId: 'project-a' },
      });
      expect(syncRemoteArchive).toHaveBeenCalledWith(
        servers[0]!.id,
        expect.objectContaining({
          baseUrl: 'https://archive.test',
          token: 'scoped-token',
          accessScope: { type: 'project', projectId: 'project-a' },
        }),
      );
    });
  });

  it('short-circuits a project-scoped invite when an archive-wide record already covers the same base URL', async () => {
    const archive = {
      id: 'archive-wide',
      label: 'archive.test',
      baseUrl: 'https://archive.test',
      token: 'archive-token',
      accessScope: { type: 'archive' as const },
      status: 'connected' as const,
    };
    useAuthStore.setState({ servers: [archive] });
    const { redeemEncryptedInvite } = await import('@/lib/api-client');
    vi.mocked(redeemEncryptedInvite).mockResolvedValueOnce({
      baseUrl: 'https://archive.test',
      token: 'scoped-token',
      accessScope: { type: 'project', projectId: 'project-a' },
    });
    const healthSpy = vi.spyOn(apiClient, 'healthCheck');
    const projectsSpy = vi.spyOn(apiClient, 'getProjects');

    setSearchParams('?code=scoped-code');
    render(<InviteScreen />);

    await waitFor(() => {
      expect(screen.getByText('Connected!')).toBeInTheDocument();
    });
    expect(healthSpy).not.toHaveBeenCalled();
    expect(projectsSpy).not.toHaveBeenCalled();
    expect(syncRemoteArchive).not.toHaveBeenCalled();
    expect(useAuthStore.getState().servers).toEqual([archive]);
  });

  it('short-circuits from a persisted archive-wide record before auth-store hydration completes', async () => {
    const archive = await createRemoteServer({
      label: 'archive.test',
      baseUrl: 'https://archive.test',
      token: 'persisted-broad-token',
      accessScope: { type: 'archive' },
      status: 'connected',
    });
    useAuthStore.setState({ servers: [] });
    const { redeemEncryptedInvite } = await import('@/lib/api-client');
    vi.mocked(redeemEncryptedInvite).mockResolvedValueOnce({
      baseUrl: 'https://archive.test',
      token: 'scoped-token',
      accessScope: { type: 'project', projectId: 'project-a' },
    });
    const healthSpy = vi.spyOn(apiClient, 'healthCheck');
    const projectsSpy = vi.spyOn(apiClient, 'getProjects');

    setSearchParams('?code=scoped-code');
    render(<InviteScreen />);

    await waitFor(() => {
      expect(screen.getByText('Connected!')).toBeInTheDocument();
    });
    expect(healthSpy).not.toHaveBeenCalled();
    expect(projectsSpy).not.toHaveBeenCalled();
    expect(syncRemoteArchive).not.toHaveBeenCalled();
    expect(useAuthStore.getState().servers).toHaveLength(0);
    expect(await getRemoteServers()).toEqual([
      expect.objectContaining({
        id: archive.id,
        token: 'persisted-broad-token',
        accessScope: { type: 'archive' },
      }),
    ]);
  });

  it('refreshes the same scoped project record and rolls back token, scope, lifecycle, and sync metadata on failure', async () => {
    const snapshot = {
      id: 'scoped-project-a',
      label: 'archive.test',
      baseUrl: 'https://archive.test',
      token: 'old-scoped-token',
      accessScope: { type: 'project' as const, projectId: 'project-a' },
      status: 'connected' as const,
      onboardingStatus: 'ready' as const,
      errorMessage: 'previous warning',
      lastSyncedAt: '2026-08-01T12:00:00.000Z',
      lastSuccessfulSyncAt: '2026-08-01T12:00:00.000Z',
    };
    useAuthStore.setState({ servers: [snapshot] });
    const { redeemEncryptedInvite } = await import('@/lib/api-client');
    vi.mocked(redeemEncryptedInvite).mockResolvedValueOnce({
      baseUrl: 'https://archive.test',
      token: 'new-scoped-token',
      accessScope: { type: 'project', projectId: 'project-a' },
    });
    vi.spyOn(apiClient, 'healthCheck').mockResolvedValueOnce(true);
    vi.spyOn(apiClient, 'getProjects').mockResolvedValueOnce({
      data: [{ projectId: 'project-a', name: 'Project A' }],
    });
    vi.mocked(syncRemoteArchive).mockImplementationOnce(async (serverId) => {
      expect(serverId).toBe(snapshot.id);
      expect(useAuthStore.getState().servers).toHaveLength(1);
      expect(useAuthStore.getState().servers[0]).toMatchObject({
        token: 'new-scoped-token',
        accessScope: { type: 'project', projectId: 'project-a' },
      });
      return codedFailedResult('Invalid bearer credential', 'authorization');
    });

    setSearchParams('?code=scoped-code');
    render(<InviteScreen />);

    await waitFor(() => {
      expect(
        screen.getByText('Invalid token or unauthorized'),
      ).toBeInTheDocument();
    });
    expect(useAuthStore.getState().servers).toEqual([snapshot]);
  });

  it('allows a different project scope on the same archive to coexist', async () => {
    const projectA = {
      id: 'scoped-project-a',
      label: 'Project A',
      baseUrl: 'https://archive.test',
      token: 'project-a-token',
      accessScope: { type: 'project' as const, projectId: 'project-a' },
      status: 'connected' as const,
    };
    useAuthStore.setState({ servers: [projectA] });
    const { redeemEncryptedInvite } = await import('@/lib/api-client');
    vi.mocked(redeemEncryptedInvite).mockResolvedValueOnce({
      baseUrl: 'https://archive.test',
      token: 'project-b-token',
      accessScope: { type: 'project', projectId: 'project-b' },
    });
    vi.spyOn(apiClient, 'healthCheck').mockResolvedValueOnce(true);
    vi.spyOn(apiClient, 'getProjects').mockResolvedValueOnce({
      data: [{ projectId: 'project-b', name: 'Project B' }],
    });

    setSearchParams('?code=scoped-code');
    render(<InviteScreen />);

    await waitFor(() => {
      const servers = useAuthStore.getState().servers;
      expect(servers).toHaveLength(2);
      expect(servers.map((server) => server.accessScope)).toEqual([
        { type: 'project', projectId: 'project-a' },
        { type: 'project', projectId: 'project-b' },
      ]);
    });
  });

  it('keeps scoped records when an archive-wide upgrade fails before full sync completes', async () => {
    const scoped = {
      id: 'scoped-project-a',
      label: 'Project A',
      baseUrl: 'https://archive.test',
      token: 'project-a-token',
      accessScope: { type: 'project' as const, projectId: 'project-a' },
      status: 'connected' as const,
    };
    useAuthStore.setState({ servers: [scoped] });
    const { redeemEncryptedInvite } = await import('@/lib/api-client');
    vi.mocked(redeemEncryptedInvite).mockResolvedValueOnce({
      baseUrl: 'https://archive.test',
      token: 'archive-token',
    });
    vi.spyOn(apiClient, 'healthCheck').mockResolvedValueOnce(true);
    vi.spyOn(apiClient, 'getProjects').mockResolvedValueOnce({
      data: [{ projectId: 'project-a', name: 'Project A' }],
    });
    vi.mocked(syncRemoteArchive).mockImplementationOnce(async () =>
      partialResult(),
    );

    setSearchParams('?code=archive-code');
    render(<InviteScreen />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Connected, but some archive data could not be synced. Try again.',
        ),
      ).toBeInTheDocument();
    });
    expect(useAuthStore.getState().servers).toEqual([scoped]);
  });

  it('reflects coordinator cleanup after a successful archive-wide full sync', async () => {
    const scopedA = {
      id: 'scoped-project-a',
      label: 'Project A',
      baseUrl: 'https://archive.test',
      token: 'project-a-token',
      accessScope: { type: 'project' as const, projectId: 'project-a' },
      status: 'connected' as const,
    };
    const scopedB = {
      id: 'scoped-project-b',
      label: 'Project B',
      baseUrl: 'https://archive.test',
      token: 'project-b-token',
      accessScope: { type: 'project' as const, projectId: 'project-b' },
      status: 'connected' as const,
    };
    useAuthStore.setState({ servers: [scopedA, scopedB] });
    const { redeemEncryptedInvite } = await import('@/lib/api-client');
    vi.mocked(redeemEncryptedInvite).mockResolvedValueOnce({
      baseUrl: 'https://archive.test',
      token: 'archive-token',
    });
    vi.spyOn(apiClient, 'healthCheck').mockResolvedValueOnce(true);
    vi.spyOn(apiClient, 'getProjects').mockResolvedValueOnce({
      data: [
        { projectId: 'project-a', name: 'Project A' },
        { projectId: 'project-b', name: 'Project B' },
      ],
    });
    vi.mocked(syncRemoteArchive).mockImplementationOnce(async (serverId) =>
      readyResult(serverId),
    );

    setSearchParams('?code=archive-code');
    render(<InviteScreen />);

    await waitFor(() => {
      const servers = useAuthStore.getState().servers;
      expect(servers).toHaveLength(1);
      expect(servers[0]).toMatchObject({
        token: 'archive-token',
        accessScope: { type: 'archive' },
      });
    });
  });

  it('shows a distinct message for partial sync and rolls back the pending server', async () => {
    vi.mocked(syncRemoteArchive).mockResolvedValueOnce(partialResult());

    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');
    render(<InviteScreen />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Connected, but some archive data could not be synced. Try again.',
        ),
      ).toBeInTheDocument();
    });
    expect(useAuthStore.getState().servers).toHaveLength(0);
  });

  it('shows the network message when sync fails with a connection error', async () => {
    vi.mocked(syncRemoteArchive).mockResolvedValueOnce(
      codedFailedResult('Unable to connect', 'connection'),
    );

    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');
    render(<InviteScreen />);

    await waitFor(() => {
      expect(
        screen.getByText('Unable to connect. Check your internet connection.'),
      ).toBeInTheDocument();
    });
    expect(useAuthStore.getState().servers).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Network error message
  // -----------------------------------------------------------------------
  it('shows network error message when fetch fails', async () => {
    // Simulate a network-level failure by mocking redeemEncryptedInvite
    // to throw a TypeError (bypasses MSW which always returns HTTP responses).
    const { redeemEncryptedInvite } = await import('@/lib/api-client');
    vi.mocked(redeemEncryptedInvite).mockRejectedValueOnce(
      new TypeError('Failed to fetch'),
    );
    setSearchParams('?code=network-fail');
    render(<InviteScreen />);
    await waitFor(() => {
      expect(
        screen.getByText('Unable to connect. Check your internet connection.'),
      ).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Legacy tests (preserved)
  // -----------------------------------------------------------------------
  it('calls addServer with parsed URL and hash params', async () => {
    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');

    render(<InviteScreen />);

    await waitFor(() => {
      const servers = useAuthStore.getState().servers;
      expect(servers).toHaveLength(1);
      expect(servers[0]!.baseUrl).toBe('https://archive.test');
      expect(servers[0]!.token).toBe('abc123');
    });
  });

  it('calls syncRemoteArchive after adding the server', async () => {
    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');

    render(<InviteScreen />);

    await waitFor(() => {
      expect(syncRemoteArchive).toHaveBeenCalledOnce();
    });

    // syncRemoteArchive was called with correct params
    const args = vi.mocked(syncRemoteArchive).mock.calls[0]!;
    expect(args[1]).toMatchObject({
      baseUrl: 'https://archive.test',
      token: 'abc123',
    });
  });

  it('shows invalid-invite message when archive URL is missing from a legacy URL', async () => {
    setSearchParams('?hash=abc123');

    render(<InviteScreen />);

    await waitFor(() => {
      expect(
        screen.getByText(
          "Couldn't accept this invite. The URL or code may be invalid.",
        ),
      ).toBeInTheDocument();
    });

    // No server was added
    expect(useAuthStore.getState().servers).toHaveLength(0);
  });

  it('reads the dedicated token param when present', async () => {
    setSearchParams(
      '?hash=fingerprint&url=https%3A%2F%2Farchive.test&token=real-token',
    );

    render(<InviteScreen />);

    await waitFor(() => {
      const servers = useAuthStore.getState().servers;
      expect(servers).toHaveLength(1);
      expect(servers[0]!.token).toBe('real-token');
    });
  });

  it('shows error when syncRemoteArchive returns success: false', async () => {
    vi.mocked(syncRemoteArchive).mockResolvedValue(
      failedResult('unauthorized'),
    );

    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');

    render(<InviteScreen />);

    await waitFor(() => {
      expect(
        screen.getByText('Failed to connect to archive.'),
      ).toBeInTheDocument();
    });

    // Should not have navigated home
    expect(mockNavigate).not.toHaveBeenCalledWith({ to: '/' });
  });

  it('shows invalid-invite message when token is missing from invite URL', async () => {
    setSearchParams('?url=https%3A%2F%2Farchive.test');

    render(<InviteScreen />);

    await waitFor(() => {
      expect(
        screen.getByText(
          "Couldn't accept this invite. The URL or code may be invalid.",
        ),
      ).toBeInTheDocument();
    });

    // No server was added since token is required
    expect(useAuthStore.getState().servers).toHaveLength(0);
  });

  describe('encrypted invites', () => {
    function makeEncryptedCode(url: string, token: string): string {
      const payload = JSON.stringify({ url, token });
      const base64 = btoa(payload)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      return `mock-encrypted-code-${base64}`;
    }

    it('redeems encrypted code and addServer receives decrypted token', async () => {
      const code = makeEncryptedCode('https://archive.test', 'decrypted-token');
      setSearchParams(`?code=${encodeURIComponent(code)}`);

      render(<InviteScreen />);

      await waitFor(() => {
        const servers = useAuthStore.getState().servers;
        expect(servers).toHaveLength(1);
        expect(servers[0]!.baseUrl).toBe('https://archive.test');
        expect(servers[0]!.token).toBe('decrypted-token');
      });

      await waitFor(() => {
        expect(screen.getByText('Connected!')).toBeInTheDocument();
      });
    });

    it('shows expired message and does not add a server when code is expired', async () => {
      setSearchParams('?code=expired');

      render(<InviteScreen />);

      await waitFor(() => {
        expect(
          screen.getByText(
            'This invite has expired. Ask the sender for a new one.',
          ),
        ).toBeInTheDocument();
      });

      expect(useAuthStore.getState().servers).toHaveLength(0);
    });
  });
});

// Legacy deprecation test (isolated)
describe('InviteScreen legacy deprecation warning (isolated)', () => {
  it('logs a deprecation warning when a legacy invite URL is processed', async () => {
    vi.resetModules();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const origin = 'http://localhost:5173';
    const params = '?hash=raw-token&url=https%3A%2F%2Farchive.test';
    Object.defineProperty(window, 'location', {
      value: {
        search: params,
        origin,
        href: `${origin}/invite${params}`,
        pathname: '/invite',
        protocol: 'http:',
        host: 'localhost:5173',
        hostname: 'localhost',
        port: '5173',
      },
      writable: true,
    });

    const { InviteScreen: FreshInviteScreen } =
      await import('@/screens/InviteScreen');
    const { useAuthStore: freshAuthStore } =
      await import('@/stores/auth-store');
    freshAuthStore.getState().clearAll();

    render(<FreshInviteScreen />);

    await waitFor(() => {
      const servers = freshAuthStore.getState().servers;
      expect(servers).toHaveLength(1);
      expect(servers[0]!.token).toBe('raw-token');
    });

    expect(warnSpy).toHaveBeenCalled();
    const messageArgs = warnSpy.mock.calls.map((args) => String(args[0]));
    expect(messageArgs.some((m) => m.includes('deprecated'))).toBe(true);

    warnSpy.mockRestore();
    freshAuthStore.getState().clearAll();
  });
});
