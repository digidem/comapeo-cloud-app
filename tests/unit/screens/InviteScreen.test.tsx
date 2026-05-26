import { render, screen, waitFor } from '@tests/mocks/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import React from 'react';

import { syncRemoteArchive } from '@/lib/data-layer';
import { resetDb } from '@/lib/db';
import { InviteScreen } from '@/screens/InviteScreen';
import { useAuthStore } from '@/stores/auth-store';

// Mock navigate and Link
const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    Link: ({
      children,
      to,
      ...props
    }: {
      children: React.ReactNode;
      to: string;
      [key: string]: unknown;
    }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  };
});

// Mock syncRemoteArchive
vi.mock('@/lib/data-layer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data-layer')>();
  return {
    ...actual,
    syncRemoteArchive: vi.fn().mockResolvedValue({ success: true }),
  };
});

// Mock redeemEncryptedInvite — wraps the real implementation so MSW handlers
// still process encrypted/expired codes, but allows per-test overrides for
// network-failure simulation.
vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return {
    ...actual,
    redeemEncryptedInvite: vi.fn(
      (...args: Parameters<typeof actual.redeemEncryptedInvite>) =>
        actual.redeemEncryptedInvite(...args),
    ),
  };
});

function setSearchParams(params: string) {
  const origin = 'http://localhost:5173';
  Object.defineProperty(window, 'location', {
    value: {
      search: params,
      origin,
      href: `${origin}/invite${params}`,
      pathname: '/invite',
      protocol: 'http:',
      host: 'localhost:5173',
      hostname: 'localhost',
      port: '5173',
    },
    writable: true,
  });
}

describe('InviteScreen', () => {
  beforeEach(async () => {
    await resetDb();
    useAuthStore.getState().clearAll();
    vi.mocked(syncRemoteArchive).mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().clearAll();
  });

  // -----------------------------------------------------------------------
  // Progress UI rendering
  // -----------------------------------------------------------------------
  it('renders all four progress steps', async () => {
    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');
    render(<InviteScreen />);
    // Step labels should be visible
    expect(screen.getByText('Verifying invite...')).toBeInTheDocument();
    expect(screen.getByText('Connecting to server...')).toBeInTheDocument();
    expect(screen.getByText('Syncing data...')).toBeInTheDocument();
    expect(screen.getByText('Preparing dashboard...')).toBeInTheDocument();
  });

  it('shows spinner inside the progress heading', async () => {
    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');
    render(<InviteScreen />);
    // The heading row has a spinner (role="img")
    const heading = screen.getByText('Connecting to archive...');
    const container = heading.closest('div');
    expect(container?.querySelector('[role="img"]')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Success flow
  // -----------------------------------------------------------------------
  it('shows Connected! success state after sync completes', async () => {
    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');
    render(<InviteScreen />);
    await waitFor(() => {
      expect(screen.getByText('Connected!')).toBeInTheDocument();
    });
    expect(screen.getByText('Redirecting...')).toBeInTheDocument();
  });

  it('navigates to home after success delay', async () => {
    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');
    render(<InviteScreen />);
    await waitFor(
      () => {
        expect(mockNavigate).toHaveBeenCalledWith({ to: '/' });
      },
      { timeout: 3000 },
    );
  });

  // -----------------------------------------------------------------------
  // Error state — retry button
  // -----------------------------------------------------------------------
  it('shows Try Again button on error', async () => {
    vi.mocked(syncRemoteArchive).mockResolvedValue({
      success: false,
      error: 'Test error',
    });
    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');
    render(<InviteScreen />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /try again/i }),
      ).toBeInTheDocument();
    });
  });

  it('shows Go to Home link on error', async () => {
    vi.mocked(syncRemoteArchive).mockResolvedValue({
      success: false,
      error: 'Test error',
    });
    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');
    render(<InviteScreen />);
    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: /go to home/i }),
      ).toBeInTheDocument();
    });
  });

  it('Try Again button restarts the connection flow', async () => {
    // First call fails
    vi.mocked(syncRemoteArchive).mockResolvedValueOnce({
      success: false,
      error: 'Test error',
    });
    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');
    render(<InviteScreen />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /try again/i }),
      ).toBeInTheDocument();
    });

    // Click Try Again
    screen.getByRole('button', { name: /try again/i }).click();

    // Should reset to loading state with "Verifying invite..." step active
    await waitFor(() => {
      expect(screen.getByText('Connecting to archive...')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Expired invite
  // -----------------------------------------------------------------------
  it('shows expired message with Try Again and Go Home', async () => {
    setSearchParams('?code=expired');
    render(<InviteScreen />);
    await waitFor(() => {
      expect(
        screen.getByText(
          'This invite has expired. Ask the sender for a new one.',
        ),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', { name: /try again/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /go to home/i }),
    ).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Invalid invite
  // -----------------------------------------------------------------------
  it('shows invalid message immediately for bad URLs', async () => {
    setSearchParams('?hash=abc123');
    render(<InviteScreen />);
    await waitFor(() => {
      expect(
        screen.getByText(
          "Couldn't accept this invite. The URL or code may be invalid.",
        ),
      ).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Cancelled ref cleanup
  // -----------------------------------------------------------------------
  it('does not set state after unmount (cleanup)', async () => {
    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');
    // Use a never-resolving sync to test mid-flight unmount
    vi.mocked(syncRemoteArchive).mockReturnValue(new Promise(() => {}));
    const { unmount } = render(<InviteScreen />);
    // Should show loading
    expect(screen.getByText('Connecting to archive...')).toBeInTheDocument();
    // Unmount before sync resolves
    unmount();
    // No error — the cancelled ref prevented state updates on unmounted component
  });

  // -----------------------------------------------------------------------
  // Network error message
  // -----------------------------------------------------------------------
  it('shows network error message when fetch fails', async () => {
    // Simulate a network-level failure by mocking redeemEncryptedInvite
    // to throw a TypeError (bypasses MSW which always returns HTTP responses).
    const { redeemEncryptedInvite } = await import('@/lib/api-client');
    vi.mocked(redeemEncryptedInvite).mockRejectedValueOnce(
      new TypeError('Failed to fetch'),
    );
    setSearchParams('?code=network-fail');
    render(<InviteScreen />);
    await waitFor(() => {
      expect(
        screen.getByText('Unable to connect. Check your internet connection.'),
      ).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Legacy tests (preserved)
  // -----------------------------------------------------------------------
  it('calls addServer with parsed URL and hash params', async () => {
    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');

    render(<InviteScreen />);

    await waitFor(() => {
      const servers = useAuthStore.getState().servers;
      expect(servers).toHaveLength(1);
      expect(servers[0]!.baseUrl).toBe('https://archive.test');
      expect(servers[0]!.token).toBe('abc123');
    });
  });

  it('calls syncRemoteArchive after adding the server', async () => {
    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');

    render(<InviteScreen />);

    await waitFor(() => {
      expect(syncRemoteArchive).toHaveBeenCalledOnce();
    });

    // syncRemoteArchive was called with correct params
    const args = vi.mocked(syncRemoteArchive).mock.calls[0]!;
    expect(args[1]).toEqual({
      baseUrl: 'https://archive.test',
      token: 'abc123',
    });
  });

  it('shows invalid-invite message when archive URL is missing from a legacy URL', async () => {
    setSearchParams('?hash=abc123');

    render(<InviteScreen />);

    await waitFor(() => {
      expect(
        screen.getByText(
          "Couldn't accept this invite. The URL or code may be invalid.",
        ),
      ).toBeInTheDocument();
    });

    // No server was added
    expect(useAuthStore.getState().servers).toHaveLength(0);
  });

  it('reads the dedicated token param when present', async () => {
    setSearchParams(
      '?hash=fingerprint&url=https%3A%2F%2Farchive.test&token=real-token',
    );

    render(<InviteScreen />);

    await waitFor(() => {
      const servers = useAuthStore.getState().servers;
      expect(servers).toHaveLength(1);
      expect(servers[0]!.token).toBe('real-token');
    });

    const args = vi.mocked(syncRemoteArchive).mock.calls[0]!;
    expect(args[1]).toEqual({
      baseUrl: 'https://archive.test',
      token: 'real-token',
    });
  });

  it('shows error when syncRemoteArchive returns success: false', async () => {
    vi.mocked(syncRemoteArchive).mockResolvedValue({
      success: false,
      error: 'unauthorized',
    });

    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');

    render(<InviteScreen />);

    await waitFor(() => {
      expect(
        screen.getByText('Failed to connect to archive.'),
      ).toBeInTheDocument();
    });

    // Should not have navigated home
    expect(mockNavigate).not.toHaveBeenCalledWith({ to: '/' });
  });

  it('shows invalid-invite message when token is missing from invite URL', async () => {
    setSearchParams('?url=https%3A%2F%2Farchive.test');

    render(<InviteScreen />);

    await waitFor(() => {
      expect(
        screen.getByText(
          "Couldn't accept this invite. The URL or code may be invalid.",
        ),
      ).toBeInTheDocument();
    });

    // No server was added since token is required
    expect(useAuthStore.getState().servers).toHaveLength(0);
  });

  describe('encrypted invites', () => {
    function makeEncryptedCode(url: string, token: string): string {
      const payload = JSON.stringify({ url, token });
      const base64 = btoa(payload)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      return `mock-encrypted-code-${base64}`;
    }

    it('redeems encrypted code and addServer receives decrypted token', async () => {
      const code = makeEncryptedCode('https://archive.test', 'decrypted-token');
      setSearchParams(`?code=${encodeURIComponent(code)}`);

      render(<InviteScreen />);

      await waitFor(() => {
        const servers = useAuthStore.getState().servers;
        expect(servers).toHaveLength(1);
        expect(servers[0]!.baseUrl).toBe('https://archive.test');
        expect(servers[0]!.token).toBe('decrypted-token');
      });

      await waitFor(() => {
        expect(screen.getByText('Connected!')).toBeInTheDocument();
      });
    });

    it('shows expired message and does not add a server when code is expired', async () => {
      setSearchParams('?code=expired');

      render(<InviteScreen />);

      await waitFor(() => {
        expect(
          screen.getByText(
            'This invite has expired. Ask the sender for a new one.',
          ),
        ).toBeInTheDocument();
      });

      expect(useAuthStore.getState().servers).toHaveLength(0);
    });
  });
});

// Legacy deprecation test (isolated)
describe('InviteScreen legacy deprecation warning (isolated)', () => {
  it('logs a deprecation warning when a legacy invite URL is processed', async () => {
    vi.resetModules();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const origin = 'http://localhost:5173';
    const params = '?hash=raw-token&url=https%3A%2F%2Farchive.test';
    Object.defineProperty(window, 'location', {
      value: {
        search: params,
        origin,
        href: `${origin}/invite${params}`,
        pathname: '/invite',
        protocol: 'http:',
        host: 'localhost:5173',
        hostname: 'localhost',
        port: '5173',
      },
      writable: true,
    });

    const { InviteScreen: FreshInviteScreen } =
      await import('@/screens/InviteScreen');
    const { useAuthStore: freshAuthStore } =
      await import('@/stores/auth-store');
    freshAuthStore.getState().clearAll();

    render(<FreshInviteScreen />);

    await waitFor(() => {
      const servers = freshAuthStore.getState().servers;
      expect(servers).toHaveLength(1);
      expect(servers[0]!.token).toBe('raw-token');
    });

    expect(warnSpy).toHaveBeenCalled();
    const messageArgs = warnSpy.mock.calls.map((args) => String(args[0]));
    expect(messageArgs.some((m) => m.includes('deprecated'))).toBe(true);

    warnSpy.mockRestore();
    freshAuthStore.getState().clearAll();
  });
});
