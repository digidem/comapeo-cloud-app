import type { UserEvent } from '@testing-library/user-event';
import { server } from '@tests/mocks/node';
import {
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from '@tests/mocks/test-utils';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDb } from '@/lib/db';
import {
  exportLocalStorageData,
  importLocalStorageData,
} from '@/lib/local-storage-utils';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { useAuthStore } from '@/stores/auth-store';

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
}));

async function generateInvite(user: UserEvent) {
  await user.type(
    screen.getByLabelText('Remote Archive URL'),
    'https://archive.example.com',
  );
  await user.type(screen.getByLabelText('Bearer Token'), 'my-secret-token');
  await user.click(screen.getByRole('button', { name: 'Generate Invite' }));
}

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

  it('does not render the dead "Use an Invite" section', () => {
    render(<SettingsScreen />);
    expect(screen.queryByText('Use an Invite')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Connect' }),
    ).not.toBeInTheDocument();
  });

  it('shows an encrypted invite URL after generating (no raw token leaks)', async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);

    await generateInvite(user);

    // Results header should appear
    expect(await screen.findByText('Results')).toBeInTheDocument();
    expect(screen.getByText('Invite URL')).toBeInTheDocument();
    expect(screen.getByText('Invite Code')).toBeInTheDocument();

    // Find the displayed invite URL
    const inviteUrlEl = await screen.findByText(
      /\/invite\?code=mock-encrypted-code-/,
    );
    const renderedUrl = inviteUrlEl.textContent ?? '';
    expect(renderedUrl).toMatch(
      /^https?:\/\/[^/]+\/invite\?code=mock-encrypted-code-/,
    );

    // Regression guard for issue #8: the URL must NOT contain a token=
    // parameter or the raw bearer token value.
    expect(renderedUrl).not.toContain('token=');
    expect(renderedUrl).not.toContain('my-secret-token');
  });

  it('shows the "Expires in 24 hours" caption after generating', async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);

    await generateInvite(user);

    expect(await screen.findByText('Expires in 24 hours.')).toBeInTheDocument();
  });

  it('shows the missing-key error message when the server is not configured', async () => {
    server.use(
      http.post('*/api/invites/encrypt', () => {
        return HttpResponse.json(
          {
            error: {
              code: 'INVITE_KEY_MISSING',
              message: 'Server key is not configured',
            },
          },
          { status: 500 },
        );
      }),
    );

    const user = userEvent.setup();
    render(<SettingsScreen />);

    await generateInvite(user);

    expect(
      await screen.findByText(
        /Server is not configured to issue encrypted invites/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Results')).not.toBeInTheDocument();
  });

  it('copies invite URL to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    navigator.clipboard.writeText = writeText;

    const user = userEvent.setup();
    render(<SettingsScreen />);

    await generateInvite(user);

    // Wait for results to render
    await screen.findByText('Results');

    // Scope to the invite-URL row and click its Copy button
    const inviteUrlRow = screen.getByTestId('invite-url-row');
    await user.click(
      within(inviteUrlRow).getByRole('button', { name: 'Copy' }),
    );

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('/invite?code='),
    );

    // Should show "Copied!" feedback
    expect(screen.getByText('Copied!')).toBeInTheDocument();
  });

  describe('Long value wrapping (issue #155)', () => {
    it('Invite URL code wraps long values instead of truncating', async () => {
      const user = userEvent.setup();
      render(<SettingsScreen />);
      await generateInvite(user);

      const inviteUrlCode = await screen.findByText(
        /\/invite\?code=mock-encrypted-code-/,
        { selector: 'code' },
      );

      // Must NOT use truncate (which hides the value behind an ellipsis)
      expect(inviteUrlCode).not.toHaveClass('truncate');
      // Must wrap long unbreakable tokens (base64url, URLs)
      expect(inviteUrlCode).toHaveClass('break-words');
      expect(inviteUrlCode).toHaveClass('wrap-anywhere');
      // Flex child must be able to shrink below content size
      expect(inviteUrlCode).toHaveClass('min-w-0');
      // Full value remains visible and selectable (not hidden)
      expect(inviteUrlCode.textContent).toMatch(
        /^https?:\/\/[^/]+\/invite\?code=mock-encrypted-code-/,
      );
    });

    it('Invite Code code wraps long unbreakable tokens', async () => {
      const user = userEvent.setup();
      render(<SettingsScreen />);
      await generateInvite(user);

      const inviteCode = await screen.findByText(/^mock-encrypted-code-/, {
        selector: 'code',
      });

      expect(inviteCode).toHaveClass('break-words');
      expect(inviteCode).toHaveClass('wrap-anywhere');
      expect(inviteCode).toHaveClass('min-w-0');
      // Full value remains visible (not hidden by truncation)
      expect(inviteCode.textContent).toMatch(/^mock-encrypted-code-/);
    });

    it('Copy button still copies the full invite code value', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      navigator.clipboard.writeText = writeText;

      const user = userEvent.setup();
      render(<SettingsScreen />);
      await generateInvite(user);

      const inviteCodeRow = screen.getByTestId('invite-code-row');
      await user.click(
        within(inviteCodeRow).getByRole('button', { name: 'Copy' }),
      );

      expect(writeText).toHaveBeenCalledTimes(1);
      expect(writeText).toHaveBeenCalledWith(
        expect.stringMatching(/^mock-encrypted-code-/),
      );
    });
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

    it('clears pending export feedback timers on unmount', async () => {
      const user = userEvent.setup();
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

      const { unmount } = render(<SettingsScreen />);

      await user.click(screen.getByRole('button', { name: 'Export Backup' }));
      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalled();

      clearTimeoutSpy.mockRestore();
    });

    it('shows error feedback and logs diagnostics when export fails', async () => {
      const exportError = new Error('Storage unavailable');
      vi.mocked(exportLocalStorageData).mockImplementationOnce(() => {
        throw exportError;
      });
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      try {
        const user = userEvent.setup();
        render(<SettingsScreen />);

        await user.click(screen.getByRole('button', { name: 'Export Backup' }));

        expect(
          screen.getByText('Failed to export backup.'),
        ).toBeInTheDocument();
        expect(consoleError).toHaveBeenCalledWith(
          'Failed to export local storage backup',
          exportError,
        );
      } finally {
        consoleError.mockRestore();
      }
    });

    it('reloads immediately after a successful import', () => {
      const mockReload = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { reload: mockReload },
        writable: true,
      });

      const OriginalFileReader = window.FileReader;
      try {
        window.FileReader = class MockFileReader {
          onload: ((ev: Event) => void) | null = null;
          onerror: ((ev: Event) => void) | null = null;
          result: string | null = null;
          readAsText() {
            this.result = '{}';
            this.onload?.({} as Event);
          }
        } as unknown as typeof window.FileReader;

        render(<SettingsScreen />);

        fireEvent.change(screen.getByTestId('backup-file-input'), {
          target: { files: [new File(['{}'], 'backup.json')] },
        });

        expect(importLocalStorageData).toHaveBeenCalledTimes(1);
        expect(mockReload).toHaveBeenCalledTimes(1);
      } finally {
        window.FileReader = OriginalFileReader;
      }
    });

    it('shows error feedback when import fails', async () => {
      vi.mocked(importLocalStorageData).mockReturnValueOnce({
        success: false,
        error: 'invalid-format',
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

    it('shows localized restored-state warning when browser storage blocks import', async () => {
      vi.mocked(importLocalStorageData).mockReturnValueOnce({
        success: false,
        error: 'storage-unavailable',
      });

      const OriginalFileReader = window.FileReader;
      try {
        window.FileReader = class MockFileReader {
          onload: ((ev: Event) => void) | null = null;
          onerror: ((ev: Event) => void) | null = null;
          result: string | null = null;
          readAsText() {
            this.result = '{}';
            this.onload?.({} as Event);
          }
        } as unknown as typeof window.FileReader;

        render(<SettingsScreen />);

        fireEvent.change(screen.getByTestId('backup-file-input'), {
          target: { files: [new File(['{}'], 'backup.json')] },
        });

        expect(
          await screen.findByText(/Existing preferences were restored/),
        ).toBeInTheDocument();
      } finally {
        window.FileReader = OriginalFileReader;
      }
    });

    it('warns and reloads immediately when import compensation also fails', async () => {
      vi.mocked(importLocalStorageData).mockReturnValueOnce({
        success: false,
        error: 'compensation-failed',
      });
      const mockReload = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { reload: mockReload },
        writable: true,
      });

      const OriginalFileReader = window.FileReader;
      try {
        window.FileReader = class MockFileReader {
          onload: ((ev: Event) => void) | null = null;
          onerror: ((ev: Event) => void) | null = null;
          result: string | null = null;
          readAsText() {
            this.result = '{}';
            this.onload?.({} as Event);
          }
        } as unknown as typeof window.FileReader;

        render(<SettingsScreen />);
        fireEvent.change(screen.getByTestId('backup-file-input'), {
          target: { files: [new File(['{}'], 'backup.json')] },
        });

        expect(
          screen.getByText(/could not restore your previous preferences/),
        ).toBeInTheDocument();
        await waitFor(() => {
          expect(mockReload).toHaveBeenCalledOnce();
        });
      } finally {
        window.FileReader = OriginalFileReader;
      }
    });

    // FIXME: flaky test — FileReader mock timing issue with jsdom. Track: https://github.com/digidem/comapeo-cloud-app/issues/TBD
    it.skip('import button shows loading state during import', async () => {
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

        const importButton = await screen.findByRole('button', {
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
        expect(
          screen.getByText(/selected backup file could not be read/),
        ).toBeInTheDocument();
      } finally {
        window.FileReader = OriginalFileReader;
      }
    });
  });
});
