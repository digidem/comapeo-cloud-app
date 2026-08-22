import { render, screen, userEvent, waitFor } from '@tests/mocks/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api-client';
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

const lockedServer: RemoteArchiveServer = {
  ...testServer,
  token: null,
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
  vi.spyOn(apiClient, 'healthCheck').mockResolvedValue(true);
  vi.spyOn(apiClient, 'getProjects').mockResolvedValue({ data: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function enterFreshCredential(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Bearer Token'), String(987654));
}

describe('EditArchiveServerDialog', () => {
  it('renders metadata pre-filled but never exposes the current credential', () => {
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
    expect(screen.getByLabelText('Bearer Token')).toHaveValue('');
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

  it('requires a fresh credential in reconnect mode for a locked archive', async () => {
    useAuthStore.setState({ servers: [lockedServer] });
    const user = userEvent.setup();
    render(
      <EditArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        server={lockedServer}
        mode="reconnect"
      />,
    );

    await user.click(screen.getByRole('button', { name: /reconnect/i }));

    expect(
      screen.getByText(/enter a bearer token or invite/i),
    ).toBeInTheDocument();
    expect(apiClient.healthCheck).not.toHaveBeenCalled();
  });

  it('allows metadata-only edits without exposing or re-entering the current credential', async () => {
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
    await user.type(labelInput, 'Metadata Only');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockUpdateRemoteServer).toHaveBeenCalledWith(
        'srv-1',
        expect.objectContaining({ label: 'Metadata Only' }),
      );
    });
    expect(apiClient.healthCheck).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Bearer Token')).toHaveValue('');
  });

  it('requires a fresh credential before activating a changed archive URL', async () => {
    const user = userEvent.setup();
    render(
      <EditArchiveServerDialog isOpen onClose={() => {}} server={testServer} />,
    );

    const urlInput = screen.getByLabelText('Server URL');
    await user.clear(urlInput);
    await user.type(urlInput, 'https://new-archive.example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      screen.getByText(/enter a bearer token or invite/i),
    ).toBeInTheDocument();
    expect(mockUpdateRemoteServer).not.toHaveBeenCalled();
  });

  it('validates and unlocks a locked archive with a fresh raw token without persisting it', async () => {
    useAuthStore.setState({ servers: [lockedServer] });
    const user = userEvent.setup();
    render(
      <EditArchiveServerDialog
        isOpen
        onClose={() => {}}
        server={lockedServer}
        mode="reconnect"
      />,
    );

    await user.type(screen.getByLabelText('Bearer Token'), String(238201));
    await user.click(screen.getByRole('button', { name: /reconnect/i }));

    await waitFor(() => {
      expect(useAuthStore.getState().servers[0]?.token).toBe(String(238201));
    });
    expect(apiClient.healthCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://archive.example.com',
        token: String(238201),
        serverId: null,
      }),
    );
    expect(JSON.stringify(mockUpdateRemoteServer.mock.calls)).not.toContain(
      String(238201),
    );
  });

  it('unlocks with an encrypted invite only when it targets the configured archive', async () => {
    useAuthStore.setState({ servers: [lockedServer] });
    const payload = JSON.stringify({
      url: 'https://archive.example.com',
      token: String(238202),
    });
    const code =
      'mock-encrypted-code-' +
      btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const user = userEvent.setup();
    render(
      <EditArchiveServerDialog
        isOpen
        onClose={() => {}}
        server={lockedServer}
        mode="reconnect"
      />,
    );

    const inviteInput = screen.getByLabelText(/invite url or code/i);
    await user.click(inviteInput);
    await user.paste(
      'https://app.example.com/invite?code=' + encodeURIComponent(code),
    );
    await user.click(screen.getByRole('button', { name: /reconnect/i }));

    await waitFor(() => {
      expect(useAuthStore.getState().servers[0]?.token).toBe(String(238202));
    });
    expect(JSON.stringify(mockUpdateRemoteServer.mock.calls)).not.toContain(
      String(238202),
    );
  });

  it('rejects an encrypted invite for a different archive without adopting its token', async () => {
    useAuthStore.setState({ servers: [lockedServer] });
    const payload = JSON.stringify({
      url: 'https://different.example.com',
      token: String(238203),
    });
    const code =
      'mock-encrypted-code-' +
      btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const user = userEvent.setup();
    render(
      <EditArchiveServerDialog
        isOpen
        onClose={() => {}}
        server={lockedServer}
        mode="reconnect"
      />,
    );

    const inviteInput = screen.getByLabelText(/invite url or code/i);
    await user.click(inviteInput);
    await user.paste(
      'https://app.example.com/invite?code=' + encodeURIComponent(code),
    );
    await user.click(screen.getByRole('button', { name: /reconnect/i }));

    expect(
      await screen.findByText(/invitation is for a different archive/i),
    ).toBeInTheDocument();
    expect(useAuthStore.getState().servers[0]?.token).toBeNull();
    expect(apiClient.healthCheck).not.toHaveBeenCalled();
  });

  it('shows fresh-invitation guidance when a reconnect invite is expired', async () => {
    useAuthStore.setState({ servers: [lockedServer] });
    const user = userEvent.setup();
    render(
      <EditArchiveServerDialog
        isOpen
        onClose={() => {}}
        server={lockedServer}
        mode="reconnect"
      />,
    );

    const inviteInput = screen.getByLabelText(/invite url or code/i);
    await user.click(inviteInput);
    await user.paste('https://app.example.com/invite?code=expired');
    await user.click(screen.getByRole('button', { name: /reconnect/i }));

    expect(
      await screen.findByText(/invite expired.*request a new invitation/i),
    ).toBeInTheDocument();
    expect(useAuthStore.getState().servers[0]?.token).toBeNull();
  });

  it('decrypts an HTTP reconnect invite first, then blocks archive requests until approval', async () => {
    const httpLocked = {
      ...lockedServer,
      baseUrl: 'http://legacy.example.com',
    };
    useAuthStore.setState({ servers: [httpLocked] });
    const payload = JSON.stringify({
      url: 'http://legacy.example.com',
      token: String(238204),
    });
    const code =
      'mock-encrypted-code-' +
      btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const user = userEvent.setup();
    render(
      <EditArchiveServerDialog
        isOpen
        onClose={() => {}}
        server={httpLocked}
        mode="reconnect"
      />,
    );

    const inviteInput = screen.getByLabelText(/invite url or code/i);
    await user.click(inviteInput);
    await user.paste(
      'https://app.example.com/invite?code=' + encodeURIComponent(code),
    );
    await user.click(screen.getByRole('button', { name: /reconnect/i }));

    expect(
      await screen.findByRole('heading', {
        name: /insecure archive connection/i,
      }),
    ).toBeInTheDocument();
    expect(apiClient.healthCheck).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole('button', { name: /connect insecurely/i }),
    );
    await waitFor(() => expect(apiClient.healthCheck).toHaveBeenCalledOnce());
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

    await enterFreshCredential(user);
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

    await enterFreshCredential(user);
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

    await enterFreshCredential(user);
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

    await enterFreshCredential(user);
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

    await enterFreshCredential(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const saveBtn = screen.getByRole('button', { name: /save/i });
    expect(saveBtn).toHaveAttribute('aria-busy', 'true');
  });
});
