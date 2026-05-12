import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDb } from '@/lib/db';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { useAuthStore } from '@/stores/auth-store';

// Mock crypto.subtle.digest
const mockDigest = vi.fn();
Object.defineProperty(globalThis, 'crypto', {
  value: {
    subtle: {
      digest: mockDigest,
    },
  },
  writable: true,
});

// Mock clipboard API
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn(),
  },
  writable: true,
});

beforeEach(async () => {
  await resetDb();
  useAuthStore.setState({
    servers: [],
    activeServerId: null,
    token: null,
    baseUrl: null,
  });
  vi.clearAllMocks();
});

describe('SettingsScreen', () => {
  it('renders the settings heading', () => {
    render(<SettingsScreen />);
    expect(screen.getByRole('heading', { level: 1 })).toBeDefined();
  });

  it('renders language info with current locale', () => {
    render(<SettingsScreen />);
    expect(
      screen.getByText('Change language from the top navigation bar.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Current:/)).toBeInTheDocument();
    expect(screen.getByText(/English/)).toBeInTheDocument();
  });

  it('renders the Remote Archive Invites section', () => {
    render(<SettingsScreen />);
    expect(screen.getByText('Remote Archive Invites')).toBeInTheDocument();
  });

  it('renders generate invite form fields', () => {
    render(<SettingsScreen />);
    expect(screen.getByText('Remote Archive URL')).toBeInTheDocument();
    expect(screen.getByText('Bearer Token')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Generate Invite' }),
    ).toBeInTheDocument();
  });

  it('renders the Use an Invite section', () => {
    render(<SettingsScreen />);
    expect(screen.getByText('Use an Invite')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
  });

  it('shows results after generating invite', async () => {
    // Mock SHA-256 to return predictable hash
    mockDigest.mockResolvedValue(new Uint8Array(32).fill(0xab));

    const user = userEvent.setup();
    render(<SettingsScreen />);

    const urlInput = screen.getByLabelText('Remote Archive URL');
    const tokenInput = screen.getByLabelText('Bearer Token');
    const generateBtn = screen.getByRole('button', {
      name: 'Generate Invite',
    });

    await user.type(urlInput, 'https://archive.example.com');
    await user.type(tokenInput, 'my-secret-token');
    await user.click(generateBtn);

    // Should show results
    expect(screen.getByText('Results')).toBeInTheDocument();
    expect(screen.getByText('Invite URL')).toBeInTheDocument();
    // There are two "Invite Code" labels (results + use section)
    const inviteCodeLabels = screen.getAllByText('Invite Code');
    expect(inviteCodeLabels.length).toBe(2);

    // Should show invite URL (now points to app with url param)
    expect(
      screen.getByText(/\/invite\?hash=.*&url=https%3A%2F%2Farchive\.example\.com/),
    ).toBeInTheDocument();
  });

  it('shows connected message after using an invite', async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);

    const codeInput = screen.getByLabelText('Invite Code');
    const connectBtn = screen.getByRole('button', { name: 'Connect' });

    await user.type(codeInput, 'test-invite-code-123');
    await user.click(connectBtn);

    expect(
      screen.getByText('Connected to test-invite-code-123'),
    ).toBeInTheDocument();
  });

  it('copies invite URL to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    navigator.clipboard.writeText = writeText;

    mockDigest.mockResolvedValue(new Uint8Array(32).fill(0xab));

    const user = userEvent.setup();
    render(<SettingsScreen />);

    // Fill form and generate
    await user.type(
      screen.getByLabelText('Remote Archive URL'),
      'https://archive.example.com',
    );
    await user.type(screen.getByLabelText('Bearer Token'), 'my-secret-token');
    await user.click(screen.getByRole('button', { name: 'Generate Invite' }));

    // Click copy button (there are two - URL and code)
    const copyButtons = screen.getAllByRole('button', { name: 'Copy' });
    await user.click(copyButtons[0]!);

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('/invite?hash='),
    );

    // Should show "Copied!" feedback
    expect(screen.getByText('Copied!')).toBeInTheDocument();
  });
});
