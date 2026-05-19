import { render, screen, waitFor } from '@tests/mocks/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { syncRemoteArchive } from '@/lib/data-layer';
import { resetDb } from '@/lib/db';
import { InviteScreen } from '@/screens/InviteScreen';
import { useAuthStore } from '@/stores/auth-store';

// Mock the navigate function
const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
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

describe('InviteScreen', () => {
  beforeEach(async () => {
    await resetDb();
    useAuthStore.getState().clearAll();
    vi.mocked(syncRemoteArchive).mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Clear servers after each test
    useAuthStore.getState().clearAll();
  });

  function setSearchParams(params: string) {
    // jsdom doesn't fully support URLSearchParams in popstate,
    // so we patch window.location.search directly. Provide an `href` too
    // so any code path that resolves relative URLs via window.location keeps
    // working (the api-client uses fetch with a relative path for /api/...).
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

  it('navigates to home after sync completes', async () => {
    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');

    render(<InviteScreen />);

    // Wait for connected status
    await waitFor(() => {
      expect(screen.getByText('Connected! Redirecting...')).toBeInTheDocument();
    });

    // Wait for navigation
    await waitFor(
      () => {
        expect(mockNavigate).toHaveBeenCalledWith({ to: '/' });
      },
      { timeout: 3000 },
    );
  });

  it('shows invalid-invite message when archive URL is missing from a legacy URL', async () => {
    setSearchParams('?hash=abc123');

    render(<InviteScreen />);

    await waitFor(() => {
      expect(
        screen.getByText(
          "Couldn't accept this invite. The link may be invalid.",
        ),
      ).toBeInTheDocument();
    });

    // No server was added
    expect(useAuthStore.getState().servers).toHaveLength(0);
  });

  it('shows loading state while connecting', async () => {
    // Make sync never resolve to keep loading state
    vi.mocked(syncRemoteArchive).mockReturnValue(new Promise(() => {}));

    setSearchParams('?hash=abc123&url=https%3A%2F%2Farchive.test');

    render(<InviteScreen />);

    expect(screen.getByText('Connecting to archive...')).toBeInTheDocument();
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
          "Couldn't accept this invite. The link may be invalid.",
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
        expect(
          screen.getByText('Connected! Redirecting...'),
        ).toBeInTheDocument();
      });
    });

    it('shows expired message and does not add a server when code is expired', async () => {
      setSearchParams('?code=expired');

      render(<InviteScreen />);

      await waitFor(() => {
        expect(
          screen.getByText(
            'This invite link has expired. Ask the sender for a new one.',
          ),
        ).toBeInTheDocument();
      });

      expect(useAuthStore.getState().servers).toHaveLength(0);
    });
  });
});

// The legacy-invite deprecation warning is guarded by a module-level boolean
// inside InviteScreen so it fires at most once per browser session. To verify
// it fires for the first legacy invite of the session, we isolate this test
// in its own describe block, reset the module registry, and re-import the
// screen so its module-level state starts fresh.
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
