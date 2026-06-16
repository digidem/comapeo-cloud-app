import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@tests/mocks/test-utils';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { LoginScreen } from '@/screens/LoginScreen';
import { useAuthStore } from '@/stores/auth-store';

// Reset auth store between tests
afterEach(() => {
  useAuthStore.getState().clearAll();
});

// MSW server for login-specific endpoint mocking — lifecycle managed at suite level
const loginServer = setupServer();

beforeAll(() => loginServer.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => loginServer.resetHandlers());
afterAll(() => loginServer.close());

describe('LoginScreen', () => {
  it('renders the login form with URL and token inputs', () => {
    render(<LoginScreen />);

    expect(screen.getByLabelText(/server url/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/bearer token/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /connect/i }),
    ).toBeInTheDocument();
  });

  it('renders the CoMapeo Cloud heading', () => {
    render(<LoginScreen />);

    expect(
      screen.getByRole('heading', { name: /comapeo cloud/i }),
    ).toBeInTheDocument();
  });

  it('shows validation errors when submitting empty fields', async () => {
    const user = userEvent.setup();
    render(<LoginScreen />);

    await user.click(screen.getByRole('button', { name: /connect/i }));

    expect(
      await screen.findByText(/server url is required/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/bearer token is required/i)).toBeInTheDocument();
  });

  it('shows URL validation error for invalid URL', async () => {
    const user = userEvent.setup();
    render(<LoginScreen />);

    await user.type(screen.getByLabelText(/server url/i), 'not-a-url');
    await user.type(screen.getByLabelText(/bearer token/i), 'some-token');
    await user.click(screen.getByRole('button', { name: /connect/i }));

    expect(
      await screen.findByText(/enter a full url including http/i),
    ).toBeInTheDocument();
  });

  it('shows error when server is unreachable', async () => {
    loginServer.use(
      http.get('https://bad.example.com/info', () => {
        return HttpResponse.error();
      }),
    );

    const user = userEvent.setup();
    render(<LoginScreen />);

    await user.type(
      screen.getByLabelText(/server url/i),
      'https://bad.example.com',
    );
    await user.type(screen.getByLabelText(/bearer token/i), 'some-token');
    await user.click(screen.getByRole('button', { name: /connect/i }));

    expect(await screen.findByText(/unable to connect/i)).toBeInTheDocument();
  });

  it('shows error on 401 unauthorized', async () => {
    loginServer.use(
      http.get('https://auth-fail.example.com/info', ({ request }) => {
        const authHeader = request.headers.get('Authorization');
        if (authHeader !== 'Bearer valid-token') {
          return HttpResponse.json(
            {
              error: {
                code: 'UNAUTHORIZED',
                message: 'Invalid bearer token',
              },
            },
            { status: 401 },
          );
        }
        return HttpResponse.json({
          data: { deviceId: 'test', name: 'Test Server' },
        });
      }),
    );

    const user = userEvent.setup();
    render(<LoginScreen />);

    await user.type(
      screen.getByLabelText(/server url/i),
      'https://auth-fail.example.com',
    );
    await user.type(screen.getByLabelText(/bearer token/i), 'wrong-token');
    await user.click(screen.getByRole('button', { name: /connect/i }));

    expect(
      await screen.findByText(/invalid bearer token/i),
    ).toBeInTheDocument();
  });

  it('shows "already added" message when reconnecting to a known server', async () => {
    loginServer.use(
      http.get('https://good.example.com/info', () => {
        return HttpResponse.json({
          data: { deviceId: 'test-device', name: 'Test Server' },
        });
      }),
    );

    // Seed the store with the same server so addServer throws DuplicateServerError
    const existingId = await useAuthStore.getState().addServer({
      label: 'good.example.com',
      baseUrl: 'https://good.example.com',
      token: 'old-token',
      allowDuplicate: true,
    });
    expect(useAuthStore.getState().servers.length).toBe(1);

    const user = userEvent.setup();
    render(<LoginScreen />);

    await user.type(
      screen.getByLabelText(/server url/i),
      'https://good.example.com',
    );
    await user.type(screen.getByLabelText(/bearer token/i), 'valid-token');
    await user.click(screen.getByRole('button', { name: /connect/i }));

    // Should surface the accurate "already added" message, NOT the misleading
    // "unable to connect" error.
    expect(
      await screen.findByText(/this server has already been added/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/unable to connect/i)).not.toBeInTheDocument();

    // The pre-existing server is untouched (no duplicate added).
    expect(useAuthStore.getState().servers.length).toBe(1);
    expect(useAuthStore.getState().servers[0]!.id).toBe(existingId);
  });

  it('adds server to auth store on successful connection', async () => {
    loginServer.use(
      http.get('https://good.example.com/info', () => {
        return HttpResponse.json({
          data: { deviceId: 'test-device', name: 'Test Server' },
        });
      }),
    );

    const user = userEvent.setup();
    render(<LoginScreen />);

    await user.type(
      screen.getByLabelText(/server url/i),
      'https://good.example.com',
    );
    await user.type(screen.getByLabelText(/bearer token/i), 'valid-token');
    await user.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => {
      const state = useAuthStore.getState();
      expect(state.servers.length).toBeGreaterThan(0);
      expect(state.servers[0]!.baseUrl).toBe('https://good.example.com');
      expect(state.servers[0]!.token).toBe('valid-token');
    });
  });

  it('shows loading state while connecting', async () => {
    // Create a delayed response — a short delay is enough to observe the
    // loading state before the response resolves. Avoids 2s of wall-clock
    // wait per run (and the associated act()/open-handle warnings).
    loginServer.use(
      http.get('https://slow.example.com/info', async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return HttpResponse.json({
          data: { deviceId: 'test-device', name: 'Test Server' },
        });
      }),
    );

    const user = userEvent.setup();
    render(<LoginScreen />);

    await user.type(
      screen.getByLabelText(/server url/i),
      'https://slow.example.com',
    );
    await user.type(screen.getByLabelText(/bearer token/i), 'some-token');
    await user.click(screen.getByRole('button', { name: /connect/i }));

    // Button should show loading state
    expect(
      screen.getByRole('button', { name: /connecting/i }),
    ).toBeInTheDocument();
  });
});
