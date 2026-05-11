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

  it('shows validation error on URL when empty', async () => {
    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

    // Click Add without filling URL
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Server URL is required')).toBeInTheDocument();
  });

  it('shows validation error on Token when empty', async () => {
    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

    // Fill URL but not token
    await user.type(
      screen.getByLabelText('Server URL'),
      'https://archive.test',
    );
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Bearer Token is required')).toBeInTheDocument();
  });

  it('shows both errors when both are empty', async () => {
    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add' }));
    // Validation is sequential — URL error appears first, then returns early
    expect(screen.getByText('Server URL is required')).toBeInTheDocument();
    // Token error does NOT appear because validation returned early on URL
    expect(
      screen.queryByText('Bearer Token is required'),
    ).not.toBeInTheDocument();
  });

  it('submit calls addServer and onAdded', async () => {
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
      screen.getByLabelText('Server URL'),
      'https://archive.test',
    );
    await user.type(screen.getByLabelText('Bearer Token'), 'my-token');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(onAdded).toHaveBeenCalledWith('test-server-id');
    });
  });

  it('uses label when provided', async () => {
    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

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

  it('uses URL as label when label is empty', async () => {
    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

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

  it('shows error for duplicate server URL', async () => {
    const user = userEvent.setup();
    // Pre-populate store with a server at the same URL
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
      screen.getByLabelText('Server URL'),
      'https://archive.test',
    );
    await user.type(screen.getByLabelText('Bearer Token'), 'new-token');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      screen.getByText('This server has already been added'),
    ).toBeInTheDocument();
  });

  it('shows error message when addServer fails with Error', async () => {
    mockCreateRemoteServer.mockRejectedValue(new Error('DB write failed'));

    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

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

  it('shows default error on non-Error rejection', async () => {
    mockCreateRemoteServer.mockRejectedValue('some string error');

    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

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

  it('submit button shows loading state', async () => {
    // Make addServer hang (never resolves) so loading state persists
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
      screen.getByLabelText('Server URL'),
      'https://archive.test',
    );
    await user.type(screen.getByLabelText('Bearer Token'), 'my-token');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    // The button should be in loading state (aria-busy)
    const addBtn = screen.getByRole('button', { name: /add/i });
    expect(addBtn).toHaveAttribute('aria-busy', 'true');
  });

  it('rejects a server URL without a protocol', async () => {
    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

    await user.type(screen.getByLabelText('Server URL'), 'archive.test');
    await user.type(screen.getByLabelText('Bearer Token'), 'my-token');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      screen.getByText('Enter a full URL including http:// or https://'),
    ).toBeInTheDocument();
    expect(mockCreateRemoteServer).not.toHaveBeenCalled();
  });

  it('rejects a non-http archive URL', async () => {
    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

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

  it('rejects an archive URL with embedded credentials', async () => {
    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

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

  it('normalizes trailing slash before saving and checking duplicates', async () => {
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

  it('saves a normalized archive URL', async () => {
    const user = userEvent.setup();
    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

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
