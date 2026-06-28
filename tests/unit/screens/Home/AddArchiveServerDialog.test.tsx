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
import { syncRemoteArchive } from '@/lib/data-layer';
import { resetDb } from '@/lib/db';
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

// Mock data-layer for syncRemoteArchive
vi.mock('@/lib/data-layer', () => ({
  syncRemoteArchive: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock sync module (data-layer re-exports from sync)
vi.mock('@/lib/sync', () => ({
  syncRemoteArchive: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock @tanstack/react-query for useQueryClient
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    }),
  };
});

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
          status: 'idle' as const,
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

    const addBtn = screen.getByRole('button', { name: /add/i });
    expect(addBtn).toHaveAttribute('aria-busy', 'true');
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
          status: 'idle' as const,
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
      expect(screen.getByText('Failed to add server')).toBeInTheDocument();
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

    const addBtn = screen.getByRole('button', { name: /add/i });
    expect(addBtn).toHaveAttribute('aria-busy', 'true');
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
          status: 'idle' as const,
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

  it('allows adding when /projects returns 500 (non-auth error) in advanced mode', async () => {
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

    // Connection progress runs before onAdded is called
    await waitFor(
      () => {
        expect(onAdded).toHaveBeenCalledWith('test-server-id');
      },
      { timeout: 5000 },
    );
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
      vi.mocked(syncRemoteArchive).mockResolvedValueOnce({
        success: false,
        error: 'Network error',
      });

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
      vi.mocked(syncRemoteArchive).mockResolvedValueOnce({
        success: false,
        error: 'Network error',
      });

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

    it('removes orphaned server when cancelling after sync failure', async () => {
      vi.mocked(syncRemoteArchive).mockResolvedValueOnce({
        success: false,
        error: 'Network error',
      });

      const removeServerSpy = vi.spyOn(useAuthStore.getState(), 'removeServer');
      removeServerSpy.mockResolvedValue(undefined);

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

      // Wait for sync failure
      expect(await screen.findByText('Network error')).toBeInTheDocument();

      // Click Cancel
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      // removeServer should have been called with the server ID
      await waitFor(() => {
        expect(removeServerSpy).toHaveBeenCalledWith('test-server-id');
      });

      removeServerSpy.mockRestore();
    });

    it('does not call onAdded when cancel clicked during pre-progress async work', async () => {
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

      // While addServer is pending, click Cancel
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      // Now resolve the pending addServer promise — the continuation should
      // be blocked by the cancelledRef guard and NOT start connection progress.
      // Asserting on syncRemoteArchive (not onAdded) is more precise: if the
      // guard fails, startConnectionProgress fires immediately, which calls
      // syncRemoteArchive before the 500ms+1500ms progress delays.
      resolveCreate({ id: 'test-server-id' });

      // Flush the promise microtask queue so the .then() continuation runs
      await Promise.resolve();

      expect(syncRemoteArchive).not.toHaveBeenCalled();
      expect(onAdded).not.toHaveBeenCalled();
    });
  });
});
