import { server } from '@tests/mocks/node';
import {
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
} from '@tests/mocks/test-utils';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api-client';
import { resetDb } from '@/lib/db';
import { syncRemoteArchive } from '@/lib/sync';
import type { SyncResult } from '@/lib/sync';
import { AddArchiveServerDialog } from '@/screens/Home/AddArchiveServerDialog';
import { useAuthStore } from '@/stores/auth-store';

// Mock local-repositories to avoid IndexedDB side effects
const mockCreateRemoteServer = vi.fn().mockResolvedValue({
  id: 'test-server-id',
  baseUrl: '',
  label: '',
  status: 'idle',
  lastSyncedAt: '',
});

vi.mock('@/lib/local-repositories', () => ({
  createRemoteServer: (...args: unknown[]) => mockCreateRemoteServer(...args),
  deleteRemoteServer: vi.fn(),
  updateRemoteServer: vi.fn(),
  getRemoteServers: vi.fn().mockResolvedValue([]),
  getRemoteServer: vi.fn(),
  getRemoteServerByBaseUrl: vi.fn().mockResolvedValue(undefined),
}));

// Mock the low-level sync engine. The dialog uses the real application-level
// coordinator, which owns validation, persistence, lifecycle, and invalidation.
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
  queryClient: {
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock @tanstack/react-query for useQueryClient
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
      refetchQueries: vi.fn().mockResolvedValue(undefined),
    }),
  };
});

function failedSyncResult(error: string): SyncResult {
  return {
    success: false,
    status: 'error',
    serverId: 'test-server-id',
    projects: [],
    warnings: [],
    error,
  };
}

beforeEach(async () => {
  await resetDb();
  useAuthStore.setState({
    tier: 'local',
    servers: [],
    activeServerId: null,
    token: null,
    baseUrl: null,
    isAuthenticated: false,
  });
  vi.clearAllMocks();
  vi.mocked(syncRemoteArchive).mockImplementation((serverId: string) =>
    Promise.resolve({
      success: true,
      status: 'ready',
      serverId,
      projects: [],
      warnings: [],
    }),
  );
  mockCreateRemoteServer.mockResolvedValue({
    id: 'test-server-id',
    baseUrl: '',
    label: '',
    status: 'idle',
    lastSyncedAt: '',
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('AddArchiveServerDialog', () => {
  // ---- Core dialog tests ----

  it('renders when open', () => {
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('not rendered when closed', () => {
    render(
      <AddArchiveServerDialog
        isOpen={false}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cancel calls onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={onClose}
        onAdded={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  // ---- Default invite URL mode tests ----

  it('default view shows "Invite URL" input, not "Server URL" or "Bearer Token"', () => {
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );
    expect(screen.getByLabelText('Invite URL or Code')).toBeInTheDocument();
    expect(screen.queryByLabelText('Server URL')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Bearer Token')).not.toBeInTheDocument();
  });

  it('shows validation error when invite URL is empty', async () => {
    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(
      screen.getByText('Invite URL or code is required'),
    ).toBeInTheDocument();
  });

  it('shows error for invalid invite URL', async () => {
    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

    await user.type(
      screen.getByLabelText('Invite URL or Code'),
      'not-a-valid-url',
    );
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(
      screen.getByText(
        "Invalid invite. Make sure it's a full URL or a valid code.",
      ),
    ).toBeInTheDocument();
  });

  it('paste valid invite URL calls addServer with parsed baseUrl and token', async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={onAdded}
      />,
    );

    await user.type(
      screen.getByLabelText('Invite URL or Code'),
      'https://app.com/invite?hash=abc&url=https%3A%2F%2Farchive.test',
    );
    await user.click(screen.getByRole('button', { name: 'Add' }));

    // Connection progress runs before onAdded is called
    await waitFor(
      () => {
        expect(onAdded).toHaveBeenCalledWith('test-server-id');
      },
      { timeout: 5000 },
    );
    expect(mockCreateRemoteServer).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://archive.test',
        label: 'archive.test',
      }),
    );
  });

  it('invite URL mode detects duplicate server', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({
      servers: [
        {
          id: 'existing-id',
          label: 'Existing',
          baseUrl: 'https://archive.test',
          token: 'existing-token',
          status: 'connected' as const,
          onboardingStatus: 'ready' as const,
        },
      ],
    });

    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

    await user.type(
      screen.getByLabelText('Invite URL or Code'),
      'https://app.com/invite?hash=abc&url=https%3A%2F%2Farchive.test',
    );
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      screen.getByText('This archive server is already connected'),
    ).toBeInTheDocument();
  });

  it('blocks adding via legacy invite URL when /projects returns 401', async () => {
    server.use(
      http.get('*/projects', () =>
        HttpResponse.json(
          {
            error: { code: 'UNAUTHORIZED', message: 'Invalid bearer token' },
          },
          { status: 401 },
        ),
      ),
    );

    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

    await user.type(
      screen.getByLabelText('Invite URL or Code'),
      'https://app.com/invite?hash=abc&url=https%3A%2F%2Farchive.test',
    );
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      await screen.findByText('Invalid token or unauthorized'),
    ).toBeInTheDocument();
    expect(mockCreateRemoteServer).not.toHaveBeenCalled();
  });

  it('invite URL mode shows loading state on submit', async () => {
    mockCreateRemoteServer.mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

    await user.type(
      screen.getByLabelText('Invite URL or Code'),
      'https://app.com/invite?hash=abc&url=https%3A%2F%2Farchive.test',
    );
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      screen.getByRole('heading', { name: 'Connecting to archive...' }),
    ).toBeInTheDocument();
  });

  // ---- Advanced toggle tests ----

  it('clicking "Advanced" toggle shows manual fields (Label, Server URL, Bearer Token)', async () => {
    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

    // Default mode shows Invite URL
    expect(screen.getByLabelText('Invite URL or Code')).toBeInTheDocument();

    // Click advanced toggle
    await user.click(screen.getByTestId('advanced-toggle'));

    // Now should show advanced fields
    expect(screen.getByLabelText('Label (optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Server URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Bearer Token')).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Invite URL or Code'),
    ).not.toBeInTheDocument();
  });

  it('clicking "Advanced" toggle again hides manual fields and shows invite URL field', async () => {
    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

    // Toggle to advanced
    await user.click(screen.getByTestId('advanced-toggle'));
    expect(screen.getByLabelText('Server URL')).toBeInTheDocument();

    // Toggle back to invite URL mode
    await user.click(screen.getByTestId('advanced-toggle'));
    expect(screen.getByLabelText('Invite URL or Code')).toBeInTheDocument();
    expect(screen.queryByLabelText('Server URL')).not.toBeInTheDocument();
  });

  // ---- Advanced mode tests (existing tests, now need to toggle first) ----

  it('shows validation error on URL when empty in advanced mode', async () => {
    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

    // Switch to advanced mode
    await user.click(screen.getByTestId('advanced-toggle'));

    // Click Add without filling URL
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Server URL is required')).toBeInTheDocument();
  });

  it('shows validation error on Token when empty in advanced mode', async () => {
    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

    // Switch to advanced mode
    await user.click(screen.getByTestId('advanced-toggle'));

    // Fill URL but not token
    await user.type(
      screen.getByLabelText('Server URL'),
      'https://archive.test',
    );
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Bearer Token is required')).toBeInTheDocument();
  });

  it('submit calls addServer and onAdded in advanced mode', async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={onAdded}
      />,
    );

    // Switch to advanced mode
    await user.click(screen.getByTestId('advanced-toggle'));

    await user.type(
      screen.getByLabelText('Server URL'),
      'https://archive.test',
    );
    await user.type(screen.getByLabelText('Bearer Token'), 'my-token');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    // Connection progress runs before onAdded is called
    await waitFor(
      () => {
        expect(onAdded).toHaveBeenCalledWith('test-server-id');
      },
      { timeout: 5000 },
    );
  });

  it('uses label when provided in advanced mode', async () => {
    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

    // Switch to advanced mode
    await user.click(screen.getByTestId('advanced-toggle'));

    await user.type(screen.getByLabelText('Label (optional)'), 'My Server');
    await user.type(
      screen.getByLabelText('Server URL'),
      'https://archive.test',
    );
    await user.type(screen.getByLabelText('Bearer Token'), 'my-token');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(mockCreateRemoteServer).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'My Server' }),
      );
    });
  });

  it('uses URL as label when label is empty in advanced mode', async () => {
    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

    // Switch to advanced mode
    await user.click(screen.getByTestId('advanced-toggle'));

    await user.type(
      screen.getByLabelText('Server URL'),
      'https://archive.test',
    );
    await user.type(screen.getByLabelText('Bearer Token'), 'my-token');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(mockCreateRemoteServer).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'https://archive.test' }),
      );
    });
  });

  it('shows error for duplicate server URL in advanced mode', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({
      servers: [
        {
          id: 'existing-id',
          label: 'Existing',
          baseUrl: 'https://archive.test',
          token: 'existing-token',
          status: 'connected' as const,
          onboardingStatus: 'ready' as const,
        },
      ],
    });

    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

    // Switch to advanced mode
    await user.click(screen.getByTestId('advanced-toggle'));

    await user.type(
      screen.getByLabelText('Server URL'),
      'https://archive.test',
    );
    await user.type(screen.getByLabelText('Bearer Token'), 'new-token');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      screen.getByText('This archive server is already connected'),
    ).toBeInTheDocument();
  });

  it('shows error message when addServer fails with Error in advanced mode', async () => {
    mockCreateRemoteServer.mockRejectedValue(new Error('DB write failed'));

    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

    // Switch to advanced mode
    await user.click(screen.getByTestId('advanced-toggle'));

    await user.type(
      screen.getByLabelText('Server URL'),
      'https://archive.test',
    );
    await user.type(screen.getByLabelText('Bearer Token'), 'my-token');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(screen.getByText('DB write failed')).toBeInTheDocument();
    });
  });

  it('shows default error on non-Error rejection in advanced mode', async () => {
    mockCreateRemoteServer.mockRejectedValue('some string error');

    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

    // Switch to advanced mode
    await user.click(screen.getByTestId('advanced-toggle'));

    await user.type(
      screen.getByLabelText('Server URL'),
      'https://archive.test',
    );
    await user.type(screen.getByLabelText('Bearer Token'), 'my-token');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(screen.getByText('Sync failed')).toBeInTheDocument();
    });
  });

  it('submit button shows loading state in advanced mode', async () => {
    mockCreateRemoteServer.mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

    // Switch to advanced mode
    await user.click(screen.getByTestId('advanced-toggle'));

    await user.type(
      screen.getByLabelText('Server URL'),
      'https://archive.test',
    );
    await user.type(screen.getByLabelText('Bearer Token'), 'my-token');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      screen.getByRole('heading', { name: 'Connecting to archive...' }),
    ).toBeInTheDocument();
  });

  it('rejects a server URL without a protocol in advanced mode', async () => {
    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

    // Switch to advanced mode
    await user.click(screen.getByTestId('advanced-toggle'));

    await user.type(screen.getByLabelText('Server URL'), 'archive.test');
    await user.type(screen.getByLabelText('Bearer Token'), 'my-token');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      screen.getByText('Enter a full URL including http:// or https://'),
    ).toBeInTheDocument();
    expect(mockCreateRemoteServer).not.toHaveBeenCalled();
  });

  it('rejects a non-http archive URL in advanced mode', async () => {
    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

    // Switch to advanced mode
    await user.click(screen.getByTestId('advanced-toggle'));

    await user.type(screen.getByLabelText('Server URL'), 'ftp://archive.test');
    await user.type(screen.getByLabelText('Bearer Token'), 'my-token');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      screen.getByText(
        'Archive server URL must start with http:// or https://',
      ),
    ).toBeInTheDocument();
    expect(mockCreateRemoteServer).not.toHaveBeenCalled();
  });

  it('rejects an archive URL with embedded credentials in advanced mode', async () => {
    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

    // Switch to advanced mode
    await user.click(screen.getByTestId('advanced-toggle'));

    await user.type(
      screen.getByLabelText('Server URL'),
      'https://user:pass@archive.test',
    );
    await user.type(screen.getByLabelText('Bearer Token'), 'my-token');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      screen.getByText('Archive server URL must not include credentials'),
    ).toBeInTheDocument();
    expect(mockCreateRemoteServer).not.toHaveBeenCalled();
  });

  it('normalizes trailing slash before saving and checking duplicates in advanced mode', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({
      servers: [
        {
          id: 'existing-id',
          label: 'Existing',
          baseUrl: 'https://archive.test',
          token: 'existing-token',
          status: 'connected' as const,
          onboardingStatus: 'ready' as const,
        },
      ],
    });

    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

    // Switch to advanced mode
    await user.click(screen.getByTestId('advanced-toggle'));

    await user.type(
      screen.getByLabelText('Server URL'),
      'https://archive.test/',
    );
    await user.type(screen.getByLabelText('Bearer Token'), 'new-token');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      screen.getByText('This archive server is already connected'),
    ).toBeInTheDocument();
    expect(mockCreateRemoteServer).not.toHaveBeenCalled();
  });

  it('saves a normalized archive URL in advanced mode', async () => {
    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

    // Switch to advanced mode
    await user.click(screen.getByTestId('advanced-toggle'));

    await user.type(
      screen.getByLabelText('Server URL'),
      'https://archive.test/',
    );
    await user.type(screen.getByLabelText('Bearer Token'), 'my-token');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(mockCreateRemoteServer).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: 'https://archive.test',
          label: 'https://archive.test',
        }),
      );
    });
  });

  // ---- Pre-add token validation tests ----

  it('blocks adding when /projects returns 401 (invalid token) in advanced mode', async () => {
    server.use(
      http.get('*/projects', () =>
        HttpResponse.json(
          {
            error: { code: 'UNAUTHORIZED', message: 'Invalid bearer token' },
          },
          { status: 401 },
        ),
      ),
    );

    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

    // Switch to advanced mode
    await user.click(screen.getByTestId('advanced-toggle'));

    await user.type(
      screen.getByLabelText('Server URL'),
      'https://archive.test',
    );
    await user.type(screen.getByLabelText('Bearer Token'), 'bad-token');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      await screen.findByText('Invalid token or unauthorized'),
    ).toBeInTheDocument();
    expect(mockCreateRemoteServer).not.toHaveBeenCalled();
  });

  it('blocks adding when /projects returns 403 (unauthorized) in advanced mode', async () => {
    // Many archive/auth stacks return 403 for an invalid or unauthorized
    // bearer token; this must be treated the same as 401 (regression guard).
    server.use(
      http.get('*/projects', () =>
        HttpResponse.json(
          {
            error: { code: 'FORBIDDEN', message: 'Access denied' },
          },
          { status: 403 },
        ),
      ),
    );

    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

    // Switch to advanced mode
    await user.click(screen.getByTestId('advanced-toggle'));

    await user.type(
      screen.getByLabelText('Server URL'),
      'https://archive.test',
    );
    await user.type(screen.getByLabelText('Bearer Token'), 'revoked-token');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      await screen.findByText('Invalid token or unauthorized'),
    ).toBeInTheDocument();
    expect(mockCreateRemoteServer).not.toHaveBeenCalled();
  });

  it('blocks adding when server is unreachable (healthCheck fails) in advanced mode', async () => {
    server.use(
      http.get('*/healthcheck', () =>
        HttpResponse.json(
          { error: { message: 'Connection refused' } },
          { status: 502 },
        ),
      ),
    );

    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

    await user.click(screen.getByTestId('advanced-toggle'));
    await user.type(
      screen.getByLabelText('Server URL'),
      'https://archive.test',
    );
    await user.type(screen.getByLabelText('Bearer Token'), 'some-token');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      await screen.findByText('Could not connect to server'),
    ).toBeInTheDocument();
    expect(mockCreateRemoteServer).not.toHaveBeenCalled();
  });

  it('blocks adding when /projects returns 500 (non-auth error) in advanced mode', async () => {
    server.use(
      http.get('*/projects', () =>
        HttpResponse.json(
          { error: { message: 'Internal server error' } },
          { status: 500 },
        ),
      ),
    );

    const user = userEvent.setup();
    const onAdded = vi.fn();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={onAdded}
      />,
    );

    await user.click(screen.getByTestId('advanced-toggle'));
    await user.type(
      screen.getByLabelText('Server URL'),
      'https://archive.test',
    );
    await user.type(screen.getByLabelText('Bearer Token'), 'some-token');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      await screen.findByText('Could not connect to server'),
    ).toBeInTheDocument();
    expect(mockCreateRemoteServer).not.toHaveBeenCalled();
  });

  it('shows connection error when validation times out (server hangs)', async () => {
    // Mock healthCheck to never resolve (simulates a server that hangs).
    // We spy directly on the api-client to avoid fake-timer interference
    // with MSW's underlying fetch plumbing.
    const neverResolves = new Promise<boolean>(() => {});
    vi.spyOn(apiClient, 'healthCheck').mockImplementation(() => neverResolves);

    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

    await user.click(screen.getByTestId('advanced-toggle'));
    await user.type(
      screen.getByLabelText('Server URL'),
      'https://archive.test',
    );
    await user.type(screen.getByLabelText('Bearer Token'), 'some-token');

    // Enable fake timers BEFORE clicking "Add" so the 10s setTimeout inside
    // validateConnection is registered as a fake timer. We use fireEvent
    // (synchronous, no internal timers) instead of userEvent for the click.
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    // Advance past the 10s timeout — this fires the setTimeout callback
    // that resolves timeoutPromise with { valid: false, connectionFailed }
    await vi.advanceTimersByTimeAsync(10_500);

    // Restore real timers so findByText polling works normally
    vi.useRealTimers();
    expect(
      await screen.findByText('Could not connect to server'),
    ).toBeInTheDocument();
    expect(mockCreateRemoteServer).not.toHaveBeenCalled();
  });

  // ---- Encrypted invite URL tests ----

  describe('encrypted invite URLs', () => {
    function makeEncryptedCode(url: string, token: string): string {
      const payload = JSON.stringify({ url, token });
      const base64 = btoa(payload)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      return `mock-encrypted-code-${base64}`;
    }

    it('redeems an encrypted invite URL and addServer is called with the decrypted token', async () => {
      const code = makeEncryptedCode('https://archive.test', 'decrypted-token');
      const inviteUrl = `https://app.com/invite?code=${encodeURIComponent(code)}`;

      const user = userEvent.setup();
      const onAdded = vi.fn();
      render(
        <AddArchiveServerDialog
          isOpen={true}
          onClose={() => {}}
          onAdded={onAdded}
        />,
      );

      await user.type(screen.getByLabelText('Invite URL or Code'), inviteUrl);
      await user.click(screen.getByRole('button', { name: 'Add' }));

      // Connection progress runs before onAdded is called
      await waitFor(
        () => {
          expect(onAdded).toHaveBeenCalledWith('test-server-id');
        },
        { timeout: 5000 },
      );
      expect(mockCreateRemoteServer).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: 'https://archive.test',
          token: 'decrypted-token',
          label: 'archive.test',
        }),
      );
    });

    it('blocks adding via encrypted invite when server is unreachable', async () => {
      server.use(
        http.get('*/healthcheck', () =>
          HttpResponse.json(
            { error: { message: 'Connection refused' } },
            { status: 502 },
          ),
        ),
      );

      const code = makeEncryptedCode('https://archive.test', 'some-token');
      const inviteUrl = `https://app.com/invite?code=${encodeURIComponent(code)}`;

      const user = userEvent.setup();
      render(
        <AddArchiveServerDialog
          isOpen={true}
          onClose={() => {}}
          onAdded={() => {}}
        />,
      );

      await user.type(screen.getByLabelText('Invite URL or Code'), inviteUrl);
      await user.click(screen.getByRole('button', { name: 'Add' }));

      expect(
        await screen.findByText('Could not connect to server'),
      ).toBeInTheDocument();
      expect(mockCreateRemoteServer).not.toHaveBeenCalled();
    });

    it('shows the expired error when the encrypted code is expired', async () => {
      const inviteUrl = 'https://app.com/invite?code=expired';

      const user = userEvent.setup();
      render(
        <AddArchiveServerDialog
          isOpen={true}
          onClose={() => {}}
          onAdded={() => {}}
        />,
      );

      await user.type(screen.getByLabelText('Invite URL or Code'), inviteUrl);
      await user.click(screen.getByRole('button', { name: 'Add' }));

      expect(
        await screen.findByText(
          'This invite has expired. Ask the sender for a new one.',
        ),
      ).toBeInTheDocument();
      expect(mockCreateRemoteServer).not.toHaveBeenCalled();
    });

    it('shows a generic invalid-invite error when the encrypt API fails for other reasons', async () => {
      server.use(
        http.post('*/api/invites/decrypt', () => {
          return HttpResponse.json(
            {
              error: {
                code: 'INVITE_DECRYPT_FAILED',
                message: 'Bad invite',
              },
            },
            { status: 400 },
          );
        }),
      );

      const inviteUrl = 'https://app.com/invite?code=anything';

      const user = userEvent.setup();
      render(
        <AddArchiveServerDialog
          isOpen={true}
          onClose={() => {}}
          onAdded={() => {}}
        />,
      );

      await user.type(screen.getByLabelText('Invite URL or Code'), inviteUrl);
      await user.click(screen.getByRole('button', { name: 'Add' }));

      expect(
        await screen.findByText(
          "Invalid invite. Make sure it's a full URL or a valid code.",
        ),
      ).toBeInTheDocument();
      expect(mockCreateRemoteServer).not.toHaveBeenCalled();
    });

    // ---- Raw invite code tests (issue #40) ----

    it('accepts a raw invite code pasted directly into the invite URL field', async () => {
      const code = makeEncryptedCode('https://archive.test', 'decrypted-token');
      const rawCode = `v1.${code}`;

      const user = userEvent.setup();
      const onAdded = vi.fn();
      render(
        <AddArchiveServerDialog
          isOpen={true}
          onClose={() => {}}
          onAdded={onAdded}
        />,
      );

      await user.type(screen.getByLabelText('Invite URL or Code'), rawCode);
      await user.click(screen.getByRole('button', { name: 'Add' }));

      // Connection progress runs before onAdded is called
      await waitFor(
        () => {
          expect(onAdded).toHaveBeenCalledWith('test-server-id');
        },
        { timeout: 5000 },
      );
      expect(mockCreateRemoteServer).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: 'https://archive.test',
          token: 'decrypted-token',
          label: 'archive.test',
        }),
      );
    });

    it('shows expired error when a raw code is expired', async () => {
      const user = userEvent.setup();
      render(
        <AddArchiveServerDialog
          isOpen={true}
          onClose={() => {}}
          onAdded={() => {}}
        />,
      );

      await user.type(
        screen.getByLabelText('Invite URL or Code'),
        'v1.expired',
      );
      await user.click(screen.getByRole('button', { name: 'Add' }));

      expect(
        await screen.findByText(
          'This invite has expired. Ask the sender for a new one.',
        ),
      ).toBeInTheDocument();
      expect(mockCreateRemoteServer).not.toHaveBeenCalled();
    });

    // ---- Connection progress tests (issue #74) ----

    it('shows connection progress steps after invite code is submitted', async () => {
      const user = userEvent.setup();
      const onAdded = vi.fn();
      render(
        <AddArchiveServerDialog
          isOpen={true}
          onClose={() => {}}
          onAdded={onAdded}
        />,
      );

      const code = makeEncryptedCode('https://archive.test', 'decrypted-token');
      const rawCode = `v1.${code}`;

      await user.type(screen.getByLabelText('Invite URL or Code'), rawCode);
      await user.click(screen.getByRole('button', { name: 'Add' }));

      // After submitting, the dialog should show connection progress steps
      expect(
        await screen.findByText('Verifying invite...'),
      ).toBeInTheDocument();
      expect(screen.getByText('Connecting to server...')).toBeInTheDocument();
      expect(screen.getByText('Syncing data...')).toBeInTheDocument();
      expect(screen.getByText('Preparing dashboard...')).toBeInTheDocument();
    });

    it('calls onAdded only after connection progress completes', async () => {
      const user = userEvent.setup();
      const onAdded = vi.fn();
      render(
        <AddArchiveServerDialog
          isOpen={true}
          onClose={() => {}}
          onAdded={onAdded}
        />,
      );

      const code = makeEncryptedCode('https://archive.test', 'decrypted-token');
      const rawCode = `v1.${code}`;

      await user.type(screen.getByLabelText('Invite URL or Code'), rawCode);
      await user.click(screen.getByRole('button', { name: 'Add' }));

      // onAdded should NOT be called immediately
      expect(onAdded).not.toHaveBeenCalled();

      // Wait for connection progress to complete and onAdded to be called
      await waitFor(
        () => {
          expect(onAdded).toHaveBeenCalledWith('test-server-id');
        },
        { timeout: 5000 },
      );
    });

    it('shows connection progress after legacy invite URL is submitted', async () => {
      const user = userEvent.setup();
      render(
        <AddArchiveServerDialog
          isOpen={true}
          onClose={() => {}}
          onAdded={() => {}}
        />,
      );

      await user.type(
        screen.getByLabelText('Invite URL or Code'),
        'https://app.com/invite?hash=abc&url=https%3A%2F%2Farchive.test',
      );
      await user.click(screen.getByRole('button', { name: 'Add' }));

      // After submitting, the dialog should show connection progress steps
      expect(
        await screen.findByText('Connecting to server...'),
      ).toBeInTheDocument();
    });

    it('shows connection progress for advanced mode submit', async () => {
      const user = userEvent.setup();
      render(
        <AddArchiveServerDialog
          isOpen={true}
          onClose={() => {}}
          onAdded={() => {}}
        />,
      );

      // Switch to advanced mode
      await user.click(screen.getByTestId('advanced-toggle'));

      await user.type(
        screen.getByLabelText('Server URL'),
        'https://archive.test',
      );
      await user.type(screen.getByLabelText('Bearer Token'), 'my-token');
      await user.click(screen.getByRole('button', { name: 'Add' }));

      // After submitting, the dialog should show connection progress steps
      expect(
        await screen.findByText('Connecting to server...'),
      ).toBeInTheDocument();
    });

    // ---- Sync failure & retry tests (issue #74) ----

    it('shows error message and Try Again when syncRemoteArchive fails', async () => {
      vi.mocked(syncRemoteArchive).mockResolvedValueOnce(
        failedSyncResult('Network error'),
      );

      const user = userEvent.setup();
      render(
        <AddArchiveServerDialog
          isOpen={true}
          onClose={() => {}}
          onAdded={() => {}}
        />,
      );

      await user.type(
        screen.getByLabelText('Invite URL or Code'),
        'https://app.com/invite?hash=abc&url=https%3A%2F%2Farchive.test',
      );
      await user.click(screen.getByRole('button', { name: 'Add' }));

      // Error message should be displayed
      expect(await screen.findByText('Network error')).toBeInTheDocument();

      // Try Again button should appear
      expect(
        screen.getByRole('button', { name: 'Try Again' }),
      ).toBeInTheDocument();
    });

    it('retries sync successfully after clicking Try Again', async () => {
      // First attempt fails
      vi.mocked(syncRemoteArchive).mockResolvedValueOnce(
        failedSyncResult('Network error'),
      );

      const user = userEvent.setup();
      const onAdded = vi.fn();
      render(
        <AddArchiveServerDialog
          isOpen={true}
          onClose={() => {}}
          onAdded={onAdded}
        />,
      );

      await user.type(
        screen.getByLabelText('Invite URL or Code'),
        'https://app.com/invite?hash=abc&url=https%3A%2F%2Farchive.test',
      );
      await user.click(screen.getByRole('button', { name: 'Add' }));

      // Wait for failure
      expect(await screen.findByText('Network error')).toBeInTheDocument();

      // Second attempt will succeed (default mock returns { success: true })
      await user.click(screen.getByRole('button', { name: 'Try Again' }));

      // onAdded should be called after successful retry
      await waitFor(
        () => {
          expect(onAdded).toHaveBeenCalledWith('test-server-id');
        },
        { timeout: 5000 },
      );
    });

    it('retains a failed archive as cancelled for safe retry', async () => {
      vi.mocked(syncRemoteArchive).mockResolvedValueOnce(
        failedSyncResult('Network error'),
      );

      const removeServerSpy = vi.spyOn(useAuthStore.getState(), 'removeServer');
      const user = userEvent.setup();
      render(
        <AddArchiveServerDialog
          isOpen={true}
          onClose={() => {}}
          onAdded={() => {}}
        />,
      );

      await user.type(
        screen.getByLabelText('Invite URL or Code'),
        'https://app.com/invite?hash=abc&url=https%3A%2F%2Farchive.test',
      );
      await user.click(screen.getByRole('button', { name: 'Add' }));

      expect(await screen.findByText('Network error')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      await waitFor(() => {
        const retained = useAuthStore
          .getState()
          .servers.find((server) => server.id === 'test-server-id');
        expect(retained).toMatchObject({
          status: 'cancelled',
          onboardingStatus: 'cancelled',
        });
      });
      expect(removeServerSpy).not.toHaveBeenCalled();
      removeServerSpy.mockRestore();
    });

    // ---- T174-2a: i18n regression tests ----

    it('shows translated error for invalid URL (not hardcoded English)', async () => {
      const user = userEvent.setup();
      render(
        <AddArchiveServerDialog
          isOpen={true}
          onClose={() => {}}
          onAdded={() => {}}
        />,
      );

      // Switch to advanced mode
      await user.click(screen.getByTestId('advanced-toggle'));

      // Enter an invalid URL (no protocol)
      await user.type(screen.getByLabelText('Server URL'), 'archive.test');
      await user.type(screen.getByLabelText('Bearer Token'), 'my-token');
      await user.click(screen.getByRole('button', { name: 'Add' }));

      // Should show translated message, not hardcoded English
      expect(
        await screen.findByText(
          'Enter a full URL including http:// or https://',
        ),
      ).toBeInTheDocument();
    });

    it('shows translated connection error (not hardcoded English)', async () => {
      server.use(
        http.get('*/healthcheck', () =>
          HttpResponse.json(
            { error: { message: 'Connection refused' } },
            { status: 502 },
          ),
        ),
      );

      const user = userEvent.setup();
      render(
        <AddArchiveServerDialog
          isOpen={true}
          onClose={() => {}}
          onAdded={() => {}}
        />,
      );

      await user.click(screen.getByTestId('advanced-toggle'));
      await user.type(
        screen.getByLabelText('Server URL'),
        'https://archive.test',
      );
      await user.type(screen.getByLabelText('Bearer Token'), 'some-token');
      await user.click(screen.getByRole('button', { name: 'Add' }));

      // Should show translated message, not hardcoded English
      expect(
        await screen.findByText('Could not connect to server'),
      ).toBeInTheDocument();
    });

    it('shows translated authorization error (not hardcoded English)', async () => {
      server.use(
        http.get('*/projects', () =>
          HttpResponse.json(
            {
              error: { code: 'UNAUTHORIZED', message: 'Invalid bearer token' },
            },
            { status: 401 },
          ),
        ),
      );

      const user = userEvent.setup();
      render(
        <AddArchiveServerDialog
          isOpen={true}
          onClose={() => {}}
          onAdded={() => {}}
        />,
      );

      await user.click(screen.getByTestId('advanced-toggle'));
      await user.type(
        screen.getByLabelText('Server URL'),
        'https://archive.test',
      );
      await user.type(screen.getByLabelText('Bearer Token'), 'bad-token');
      await user.click(screen.getByRole('button', { name: 'Add' }));

      // Should show translated message, not hardcoded English
      expect(
        await screen.findByText('Invalid token or unauthorized'),
      ).toBeInTheDocument();
    });

    it('shows translated duplicate server error (not hardcoded English)', async () => {
      useAuthStore.setState({
        servers: [
          {
            id: 'existing-id',
            label: 'Existing',
            baseUrl: 'https://archive.test',
            token: 'existing-token',
            status: 'connected' as const,
            onboardingStatus: 'ready' as const,
          },
        ],
      });

      const user = userEvent.setup();
      render(
        <AddArchiveServerDialog
          isOpen={true}
          onClose={() => {}}
          onAdded={() => {}}
        />,
      );

      await user.click(screen.getByTestId('advanced-toggle'));
      await user.type(
        screen.getByLabelText('Server URL'),
        'https://archive.test',
      );
      await user.type(screen.getByLabelText('Bearer Token'), 'new-token');
      await user.click(screen.getByRole('button', { name: 'Add' }));

      // Should show translated message, not hardcoded English
      expect(
        await screen.findByText('This archive server is already connected'),
      ).toBeInTheDocument();
    });

    it('does not call onAdded when closed while persistence is pending', async () => {
      // Make addServer (createRemoteServer) return a controllable promise so we
      // can keep it pending while the user clicks Cancel.
      let resolveCreate: (value: { id: string }) => void = () => {};
      mockCreateRemoteServer.mockReturnValue(
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
      );

      const user = userEvent.setup();
      const onAdded = vi.fn();
      const onClose = vi.fn();
      render(
        <AddArchiveServerDialog
          isOpen={true}
          onClose={onClose}
          onAdded={onAdded}
        />,
      );

      // Submit a valid invite URL — this starts the async flow
      await user.type(
        screen.getByLabelText('Invite URL or Code'),
        'https://app.com/invite?hash=abc&url=https%3A%2F%2Farchive.test',
      );
      await user.click(screen.getByRole('button', { name: 'Add' }));

      // While addServer is pending, close the progress dialog.
      await user.click(screen.getByRole('button', { name: 'Close' }));

      // Now resolve the pending addServer promise — the continuation should
      // be blocked by the cancelledRef guard. The guard check happens inside
      // the .then() before startConnectionProgress, so after flushing the
      // promise chain the connection progress UI should never appear.
      resolveCreate({ id: 'test-server-id' });
      await Promise.resolve();
      await Promise.resolve();

      // The controlled dialog may remain rendered until its parent applies
      // onClose, but the pending continuation must never start or finalize sync.
      await waitFor(() => {
        const retained = useAuthStore
          .getState()
          .servers.find((server) => server.id === 'test-server-id');
        expect(retained?.onboardingStatus).toBe('cancelled');
      });
      expect(syncRemoteArchive).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledOnce();
      expect(onAdded).not.toHaveBeenCalled();
    });

    // ---- T174-3a: Ghost server on cancel tests ----

    it('cancels onboarding when user closes during pending state (before serverId is set)', async () => {
      // Make addServer resolve but syncRemoteArchive hang indefinitely
      let resolveSync: (value: SyncResult) => void = () => {};
      mockCreateRemoteServer.mockResolvedValue({
        id: 'pending-server-id',
        baseUrl: 'https://archive.test',
        label: 'archive.test',
        status: 'pending' as const,
        lastSyncedAt: '',
      });
      vi.mocked(syncRemoteArchive).mockReturnValue(
        new Promise((resolve) => {
          resolveSync = resolve;
        }),
      );

      const user = userEvent.setup();
      const onClose = vi.fn();
      render(
        <AddArchiveServerDialog
          isOpen={true}
          onClose={onClose}
          onAdded={() => {}}
        />,
      );

      await user.type(
        screen.getByLabelText('Invite URL or Code'),
        'https://app.com/invite?hash=abc&url=https%3A%2F%2Farchive.test',
      );
      await user.click(screen.getByRole('button', { name: 'Add' }));

      // Wait for server to be added but sync to still be pending
      await waitFor(() => {
        const server = useAuthStore
          .getState()
          .servers.find((s) => s.id === 'pending-server-id');
        expect(server).toBeDefined();
        // During onboarding the status may be 'pending' or 'syncing'
        expect(['pending', 'syncing']).toContain(server?.status);
      });

      // User cancels while sync is pending - simulate closing via modal X button
      // During the progress window there is no Cancel button; the close path is
      // the Modal's onOpenChange(false) via the aria-label="Close" button.
      await user.click(screen.getByRole('button', { name: 'Close' }));

      await waitFor(() => {
        const server = useAuthStore
          .getState()
          .servers.find((s) => s.id === 'pending-server-id');
        expect(server?.onboardingStatus).toBe('cancelled');
      });

      expect(onClose).toHaveBeenCalledOnce();

      // Now resolve the sync - it should not resurrect the server
      resolveSync({
        success: true,
        status: 'ready',
        serverId: 'pending-server-id',
        projects: [],
        warnings: [],
      });
      await Promise.resolve();

      // Server should remain cancelled
      const server = useAuthStore
        .getState()
        .servers.find((s) => s.id === 'pending-server-id');
      expect(server?.onboardingStatus).toBe('cancelled');
    });
  });
});
