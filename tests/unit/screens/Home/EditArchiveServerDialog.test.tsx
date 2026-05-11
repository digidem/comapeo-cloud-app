import { render, screen, userEvent, waitFor } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDb } from '@/lib/db';
import { EditArchiveServerDialog } from '@/screens/Home/EditArchiveServerDialog';
import type { RemoteArchiveServer } from '@/stores/auth-store';
import { useAuthStore } from '@/stores/auth-store';

const mockUpdateRemoteServer = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/local-repositories', () => ({
  createRemoteServer: vi.fn().mockResolvedValue({
    id: 'test-server-id',
    baseUrl: '',
    label: '',
    status: 'idle',
    lastSyncedAt: '',
  }),
  deleteRemoteServer: vi.fn(),
  updateRemoteServer: (...args: unknown[]) => mockUpdateRemoteServer(...args),
  getRemoteServers: vi.fn().mockResolvedValue([]),
  getRemoteServer: vi.fn(),
  getRemoteServerByBaseUrl: vi.fn().mockResolvedValue(undefined),
}));

const testServer: RemoteArchiveServer = {
  id: 'srv-1',
  label: 'Demo Server',
  baseUrl: 'https://archive.example.com',
  token: 'my-token',
  status: 'idle',
};

beforeEach(async () => {
  await resetDb();
  useAuthStore.setState({
    tier: 'local',
    servers: [testServer],
    activeServerId: null,
    token: null,
    baseUrl: null,
    isAuthenticated: false,
  });
  vi.clearAllMocks();
  mockUpdateRemoteServer.mockResolvedValue(undefined);
});

describe('EditArchiveServerDialog', () => {
  it('renders when open with pre-filled values', () => {
    render(
      <EditArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        server={testServer}
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Demo Server')).toBeInTheDocument();
    expect(
      screen.getByDisplayValue('https://archive.example.com'),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('my-token')).toBeInTheDocument();
  });

  it('not rendered when closed', () => {
    render(
      <EditArchiveServerDialog
        isOpen={false}
        onClose={() => {}}
        server={testServer}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cancel calls onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <EditArchiveServerDialog
        isOpen={true}
        onClose={onClose}
        server={testServer}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows validation error when URL is cleared', async () => {
    const user = userEvent.setup();
    render(
      <EditArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        server={testServer}
      />,
    );

    const urlInput = screen.getByLabelText('Server URL');
    await user.clear(urlInput);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Server URL is required')).toBeInTheDocument();
  });

  it('shows validation error when token is cleared', async () => {
    const user = userEvent.setup();
    render(
      <EditArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        server={testServer}
      />,
    );

    const tokenInput = screen.getByLabelText('Bearer Token');
    await user.clear(tokenInput);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Bearer Token is required')).toBeInTheDocument();
  });

  it('calls updateServer and onClose on successful save', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <EditArchiveServerDialog
        isOpen={true}
        onClose={onClose}
        server={testServer}
      />,
    );

    const labelInput = screen.getByLabelText('Label (optional)');
    await user.clear(labelInput);
    await user.type(labelInput, 'Updated Server');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockUpdateRemoteServer).toHaveBeenCalledWith(
        'srv-1',
        expect.objectContaining({ label: 'Updated Server' }),
      );
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('updates server in auth store after save', async () => {
    const user = userEvent.setup();
    render(
      <EditArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        server={testServer}
      />,
    );

    const labelInput = screen.getByLabelText('Label (optional)');
    await user.clear(labelInput);
    await user.type(labelInput, 'New Label');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const updated = useAuthStore
        .getState()
        .servers.find((s) => s.id === 'srv-1');
      expect(updated?.label).toBe('New Label');
    });
  });

  it('shows error when updateServer fails with Error', async () => {
    mockUpdateRemoteServer.mockRejectedValue(new Error('DB write failed'));

    const user = userEvent.setup();
    render(
      <EditArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        server={testServer}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByText('DB write failed')).toBeInTheDocument();
    });
  });

  it('shows default error on non-Error rejection', async () => {
    mockUpdateRemoteServer.mockRejectedValue('some string error');

    const user = userEvent.setup();
    render(
      <EditArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        server={testServer}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByText('Failed to update server')).toBeInTheDocument();
    });
  });

  it('save button shows loading state', async () => {
    mockUpdateRemoteServer.mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup();
    render(
      <EditArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        server={testServer}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));

    const saveBtn = screen.getByRole('button', { name: /save/i });
    expect(saveBtn).toHaveAttribute('aria-busy', 'true');
  });
});
