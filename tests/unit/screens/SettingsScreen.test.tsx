import { render, screen, userEvent, waitFor } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDb } from '@/lib/db';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { useAuthStore } from '@/stores/auth-store';

// Mock sync module
vi.mock('@/lib/sync', () => ({
  syncRemoteArchive: vi.fn().mockResolvedValue({ success: true }),
}));

beforeEach(async () => {
  await resetDb();
  useAuthStore.setState({
    servers: [],
    activeServerId: null,
    token: null,
    baseUrl: null,
  });
});

describe('SettingsScreen', () => {
  it('renders the settings heading', () => {
    render(<SettingsScreen />);
    expect(screen.getByRole('heading', { level: 1 })).toBeDefined();
  });

  it('displays archive server section', () => {
    render(<SettingsScreen />);
    const section = screen.getByRole('region');
    expect(section).toBeDefined();
  });

  it('shows add server form', () => {
    render(<SettingsScreen />);
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.length).toBeGreaterThan(0);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('shows server URL and token inputs', () => {
    render(<SettingsScreen />);
    expect(screen.getByPlaceholderText('Server URL')).toBeDefined();
    expect(screen.getByPlaceholderText('Bearer Token')).toBeDefined();
  });

  it('shows add server submit button', () => {
    render(<SettingsScreen />);
    expect(screen.getByRole('button', { name: 'Add Server' })).toBeDefined();
  });

  it('does not submit when URL is empty', async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);
    await user.click(screen.getByRole('button', { name: 'Add Server' }));
    // No server should be added — no list items
    expect(screen.queryByRole('listitem')).toBeNull();
  });

  it('adds a server when URL and token are provided', async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);

    await user.type(
      screen.getByPlaceholderText('Server URL'),
      'https://example.com',
    );
    await user.type(screen.getByPlaceholderText('Bearer Token'), 'my-token');
    await user.click(screen.getByRole('button', { name: 'Add Server' }));

    // Server should appear in the list
    const items = await screen.findAllByRole('listitem');
    expect(items.length).toBe(1);
    expect(items[0]?.textContent).toContain('https://example.com');
  });

  it('uses URL as label when label is empty', async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);

    await user.type(
      screen.getByPlaceholderText('Server URL'),
      'https://example.com',
    );
    await user.type(screen.getByPlaceholderText('Bearer Token'), 'my-token');
    await user.click(screen.getByRole('button', { name: 'Add Server' }));

    const items = await screen.findAllByRole('listitem');
    expect(items[0]?.textContent).toContain('https://example.com');
  });

  it('shows server status in list', async () => {
    useAuthStore.setState({
      servers: [
        {
          id: 'server-1',
          label: 'Test Server',
          baseUrl: 'https://test.example.com',
          token: 'tok123',
          status: 'idle',
        },
      ],
    });

    render(<SettingsScreen />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]?.textContent).toContain('idle');
  });

  it('shows error message for server with error', () => {
    useAuthStore.setState({
      servers: [
        {
          id: 'server-1',
          label: 'Error Server',
          baseUrl: 'https://error.example.com',
          token: 'tok123',
          status: 'error',
          errorMessage: 'Connection refused',
        },
      ],
    });

    render(<SettingsScreen />);
    expect(screen.getByText('Connection refused')).toBeDefined();
  });

  it('removes a server when remove button is clicked', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({
      servers: [
        {
          id: 'server-1',
          label: 'Remove Me',
          baseUrl: 'https://remove.example.com',
          token: 'tok123',
          status: 'idle',
        },
      ],
    });

    render(<SettingsScreen />);
    expect(screen.getAllByRole('listitem').length).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(screen.queryByRole('listitem')).toBeNull();
  });

  it('shows sync button for each server', () => {
    useAuthStore.setState({
      servers: [
        {
          id: 'server-1',
          label: 'Server A',
          baseUrl: 'https://a.example.com',
          token: 'tok-a',
          status: 'idle',
        },
        {
          id: 'server-2',
          label: 'Server B',
          baseUrl: 'https://b.example.com',
          token: 'tok-b',
          status: 'idle',
        },
      ],
    });

    render(<SettingsScreen />);
    const syncButtons = screen.getAllByRole('button', { name: 'Sync Now' });
    expect(syncButtons.length).toBe(2);
  });

  it('shows sync error when sync fails', async () => {
    const { syncRemoteArchive } = await import('@/lib/sync');
    vi.mocked(syncRemoteArchive).mockResolvedValueOnce({
      success: false,
      error: 'Sync failed',
    });

    const user = userEvent.setup();
    useAuthStore.setState({
      servers: [
        {
          id: 'server-1',
          label: 'Fail Server',
          baseUrl: 'https://fail.example.com',
          token: 'tok-fail',
          status: 'idle',
        },
      ],
    });

    render(<SettingsScreen />);
    await user.click(screen.getByRole('button', { name: 'Sync Now' }));

    expect(await screen.findByText('Sync failed')).toBeDefined();
  });

  it('clears inputs after adding a server', async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);

    await user.type(
      screen.getByPlaceholderText('Server URL'),
      'https://example.com',
    );
    await user.type(screen.getByPlaceholderText('Bearer Token'), 'my-token');
    await user.click(screen.getByRole('button', { name: 'Add Server' }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Server URL')).toHaveValue('');
    });
    expect(screen.getByPlaceholderText('Bearer Token')).toHaveValue('');
  });
});
