import { fireEvent, render, screen, userEvent } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDb } from '@/lib/db';
import {
  clearAllStorage,
  exportLocalStorageData,
  importLocalStorageData,
} from '@/lib/local-storage-utils';
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

vi.mock('@/lib/local-storage-utils', () => ({
  exportLocalStorageData: vi.fn(() => '"{\\"version\\":1,\\"data\\":{}}"'),
  importLocalStorageData: vi.fn(() => ({ success: true })),
  clearAllStorage: vi.fn(() => Promise.resolve()),
}));

beforeEach(async () => {
  await resetDb();
  useAuthStore.setState({
    servers: [],
    activeServerId: null,
    token: null,
    baseUrl: null,
  });
  vi.clearAllMocks();

  // Mock URL functions for export tests
  URL.createObjectURL = vi.fn(() => 'blob:http://localhost/fake-url');
  URL.revokeObjectURL = vi.fn();
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

    // Should show invite URL (now points to app with url + token params)
    expect(
      screen.getByText(
        /\/invite\?hash=.*&url=https%3A%2F%2Farchive\.example\.com/,
      ),
    ).toBeInTheDocument();
    // Token must be in the URL so the InviteScreen can authenticate
    expect(screen.getByText(/&token=my-secret-token/)).toBeInTheDocument();
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

  describe('Backup & Restore', () => {
    it('renders Backup & Restore section heading', () => {
      render(<SettingsScreen />);
      expect(screen.getByText('Backup & Restore')).toBeInTheDocument();
    });

    it('renders Export Backup button', () => {
      render(<SettingsScreen />);
      expect(
        screen.getByRole('button', { name: 'Export Backup' }),
      ).toBeInTheDocument();
    });

    it('renders Import Backup button', () => {
      render(<SettingsScreen />);
      expect(
        screen.getByRole('button', { name: 'Import Backup' }),
      ).toBeInTheDocument();
    });

    it('clicking Export Backup triggers file download', async () => {
      const user = userEvent.setup();
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');

      render(<SettingsScreen />);

      await user.click(screen.getByRole('button', { name: 'Export Backup' }));

      expect(exportLocalStorageData).toHaveBeenCalledTimes(1);
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith(
        'blob:http://localhost/fake-url',
      );

      clickSpy.mockRestore();
    });

    it('shows success feedback after export', async () => {
      const user = userEvent.setup();
      render(<SettingsScreen />);

      await user.click(screen.getByRole('button', { name: 'Export Backup' }));

      expect(
        screen.getByText('Backup exported successfully.'),
      ).toBeInTheDocument();
    });

    it('shows error feedback when export fails', async () => {
      vi.mocked(exportLocalStorageData).mockImplementationOnce(() => {
        throw new Error('Storage unavailable');
      });

      const user = userEvent.setup();
      render(<SettingsScreen />);

      await user.click(screen.getByRole('button', { name: 'Export Backup' }));

      expect(screen.getByText('Failed to export backup.')).toBeInTheDocument();
    });

    it('shows error feedback when import fails', async () => {
      vi.mocked(importLocalStorageData).mockReturnValueOnce({
        success: false,
        error: 'Invalid backup file format',
      });

      const OriginalFileReader = window.FileReader;
      try {
        window.FileReader = class MockFileReader {
          onload: ((ev: Event) => void) | null = null;
          onerror: ((ev: Event) => void) | null = null;
          result: string | null = null;
          readAsText() {
            this.result = 'invalid content';
            this.onload?.({} as Event);
          }
        } as unknown as typeof window.FileReader;

        render(<SettingsScreen />);

        const fileInput = screen.getByTestId('backup-file-input');
        fireEvent.change(fileInput, {
          target: {
            files: [new File(['invalid'], 'backup.json')],
          },
        });

        expect(
          await screen.findByText(/Failed to import backup/),
        ).toBeInTheDocument();
        expect(
          screen.getByText(/Invalid backup file format/),
        ).toBeInTheDocument();
      } finally {
        window.FileReader = OriginalFileReader;
      }
    });

    it('import button shows loading state during import', () => {
      const OriginalFileReader = window.FileReader;
      try {
        window.FileReader = class DelayedFileReader {
          onload: ((ev: Event) => void) | null = null;
          onerror: ((ev: Event) => void) | null = null;
          result: string | null = null;
          readAsText() {
            // Intentionally don't call onload — stays in loading state
          }
        } as unknown as typeof window.FileReader;

        render(<SettingsScreen />);

        const fileInput = screen.getByTestId('backup-file-input');
        fireEvent.change(fileInput, {
          target: {
            files: [new File(['{}'], 'backup.json')],
          },
        });

        const importButton = screen.getByRole('button', {
          name: 'Import Backup',
        });
        expect(importButton).toHaveAttribute('aria-busy', 'true');
        expect(importButton).toBeDisabled();
      } finally {
        window.FileReader = OriginalFileReader;
      }
    });

    it('shows error feedback when FileReader fails', () => {
      const OriginalFileReader = window.FileReader;
      try {
        window.FileReader = class ErrorFileReader {
          onload: ((ev: Event) => void) | null = null;
          onerror: ((ev: Event) => void) | null = null;
          result: string | null = null;
          error: DOMException | null = new DOMException('Read error');
          readAsText() {
            this.onerror?.({} as Event);
          }
        } as unknown as typeof window.FileReader;

        render(<SettingsScreen />);

        const fileInput = screen.getByTestId('backup-file-input');
        fireEvent.change(fileInput, {
          target: {
            files: [new File(['{}'], 'backup.json')],
          },
        });

        expect(screen.getByText(/Failed to import backup/)).toBeInTheDocument();
        expect(screen.getByText(/Read error/)).toBeInTheDocument();
      } finally {
        window.FileReader = OriginalFileReader;
      }
    });
  });

  describe('Clear Local Data', () => {
    it('renders Clear Local Data section heading', () => {
      render(<SettingsScreen />);
      expect(screen.getByText('Clear Local Data')).toBeInTheDocument();
    });

    it('renders Clear All Data button', () => {
      render(<SettingsScreen />);
      expect(
        screen.getByRole('button', { name: 'Clear All Data' }),
      ).toBeInTheDocument();
    });

    it('clicking Clear All Data opens confirmation dialog', async () => {
      const user = userEvent.setup();
      render(<SettingsScreen />);

      await user.click(screen.getByRole('button', { name: 'Clear All Data' }));

      expect(screen.getByText('Clear All Data?')).toBeInTheDocument();
    });

    it('confirmation dialog shows warning text', async () => {
      const user = userEvent.setup();
      render(<SettingsScreen />);

      await user.click(screen.getByRole('button', { name: 'Clear All Data' }));

      expect(
        screen.getByText(/permanently remove all local settings/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/This action cannot be undone/),
      ).toBeInTheDocument();
    });

    it('clicking cancel closes dialog without clearing data', async () => {
      const user = userEvent.setup();
      render(<SettingsScreen />);

      await user.click(screen.getByRole('button', { name: 'Clear All Data' }));
      expect(screen.getByText('Clear All Data?')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByText('Clear All Data?')).not.toBeInTheDocument();
      expect(clearAllStorage).not.toHaveBeenCalled();
    });

    it('clicking confirm calls clearAllStorage', async () => {
      const user = userEvent.setup();
      render(<SettingsScreen />);

      await user.click(screen.getByRole('button', { name: 'Clear All Data' }));
      await user.click(
        screen.getByRole('button', { name: 'Yes, Clear Everything' }),
      );

      expect(clearAllStorage).toHaveBeenCalledTimes(1);
    });
  });
});
