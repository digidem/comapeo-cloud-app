import { render, screen, waitFor } from '@tests/mocks/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useNavigate } from '@tanstack/react-router';
import { resetDb } from '@/lib/db';
import { syncRemoteArchive } from '@/lib/data-layer';
import { useAuthStore } from '@/stores/auth-store';

import { InviteScreen } from '@/screens/InviteScreen';

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
  const actual =
    await importOriginal<typeof import('@/lib/data-layer')>();
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
    // so we patch window.location.search directly
    Object.defineProperty(window, 'location', {
      value: { search: params, origin: 'http://localhost:5173' },
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

  it('shows error when archive URL is missing', async () => {
    setSearchParams('?hash=abc123');

    render(<InviteScreen />);

    await waitFor(() => {
      expect(
        screen.getByText('Failed to connect to archive.'),
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

  it('shows error when token is missing from invite URL', async () => {
    setSearchParams('?url=https%3A%2F%2Farchive.test');

    render(<InviteScreen />);

    await waitFor(() => {
      expect(
        screen.getByText('Failed to connect to archive.'),
      ).toBeInTheDocument();
    });

    // No server was added since token is required
    expect(useAuthStore.getState().servers).toHaveLength(0);
  });
});
