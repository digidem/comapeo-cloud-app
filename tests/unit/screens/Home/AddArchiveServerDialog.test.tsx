import { render, screen, userEvent, waitFor } from '@tests/mocks/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    expect(screen.getByLabelText('Invite URL')).toBeInTheDocument();
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
    expect(screen.getByText('Invite URL is required')).toBeInTheDocument();
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

    await user.type(screen.getByLabelText('Invite URL'), 'not-a-valid-url');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(
      screen.getByText(
        "Invalid invite URL. Make sure it's a full invite link.",
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
      screen.getByLabelText('Invite URL'),
      'https://app.com/invite?hash=abc&url=https%3A%2F%2Farchive.test',
    );
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(onAdded).toHaveBeenCalledWith('test-server-id');
    });
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
      screen.getByLabelText('Invite URL'),
      'https://app.com/invite?hash=abc&url=https%3A%2F%2Farchive.test',
    );
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      screen.getByText('This server has already been added'),
    ).toBeInTheDocument();
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
      screen.getByLabelText('Invite URL'),
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
    expect(screen.getByLabelText('Invite URL')).toBeInTheDocument();

    // Click advanced toggle
    await user.click(screen.getByTestId('advanced-toggle'));

    // Now should show advanced fields
    expect(screen.getByLabelText('Label (optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Server URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Bearer Token')).toBeInTheDocument();
    expect(screen.queryByLabelText('Invite URL')).not.toBeInTheDocument();
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
    expect(screen.getByLabelText('Invite URL')).toBeInTheDocument();
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

    await waitFor(() => {
      expect(onAdded).toHaveBeenCalledWith('test-server-id');
    });
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
      screen.getByText('This server has already been added'),
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
      screen.getByText('This server has already been added'),
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
});
