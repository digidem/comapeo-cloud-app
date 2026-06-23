import { useReducer, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { useNavigate } from '@tanstack/react-router';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError, apiClient } from '@/lib/api-client';
import { normalizeArchiveBaseUrl } from '@/lib/archive-proxy';
import { DuplicateServerError, useAuthStore } from '@/stores/auth-store';

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

const messages = defineMessages({
  heading: {
    id: 'login.heading',
    defaultMessage: 'CoMapeo Cloud',
  },
  subtitle: {
    id: 'login.subtitle',
    defaultMessage: 'Connect to your remote archive server',
  },
  urlLabel: {
    id: 'login.urlLabel',
    defaultMessage: 'Server URL',
  },
  urlPlaceholder: {
    id: 'login.urlPlaceholder',
    defaultMessage: 'https://archive.example.com',
  },
  tokenLabel: {
    id: 'login.tokenLabel',
    defaultMessage: 'Bearer Token',
  },
  tokenPlaceholder: {
    id: 'login.tokenPlaceholder',
    defaultMessage: 'Enter bearer token',
  },
  connectButton: {
    id: 'login.connect',
    defaultMessage: 'Connect',
  },
  connectingButton: {
    id: 'login.connecting',
    defaultMessage: 'Connecting...',
  },
  urlRequired: {
    id: 'login.urlRequired',
    defaultMessage: 'Server URL is required',
  },
  tokenRequired: {
    id: 'login.tokenRequired',
    defaultMessage: 'Bearer Token is required',
  },
  invalidUrl: {
    id: 'login.invalidUrl',
    defaultMessage: 'Enter a full URL including http:// or https://',
  },
  unableToConnect: {
    id: 'login.unableToConnect',
    defaultMessage: 'Unable to connect. Check the server URL and try again.',
  },
  serverUpdateFailed: {
    id: 'login.serverUpdateFailed',
    defaultMessage: 'Failed to save server details. Please try again.',
  },
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LoginState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string };

type LoginAction =
  | { type: 'submit' }
  | { type: 'success' }
  | { type: 'error'; message: string }
  | { type: 'reset' };

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function loginReducer(_state: LoginState, action: LoginAction): LoginState {
  switch (action.type) {
    case 'submit':
      return { status: 'loading' };
    case 'success':
      return { status: 'idle' };
    case 'error':
      return { status: 'error', message: action.message };
    case 'reset':
      return { status: 'idle' };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LoginScreen() {
  const intl = useIntl();
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(loginReducer, { status: 'idle' });

  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedUrl = url.trim();
    const trimmedToken = token.trim();

    // Clear previous errors
    setUrlError(null);
    setTokenError(null);

    // Validate required fields
    let hasError = false;
    if (!trimmedUrl) {
      setUrlError(intl.formatMessage(messages.urlRequired));
      hasError = true;
    }
    if (!trimmedToken) {
      setTokenError(intl.formatMessage(messages.tokenRequired));
      hasError = true;
    }
    if (hasError) return;

    // Validate URL format
    const normalizedUrl = normalizeArchiveBaseUrl(trimmedUrl);
    if (!normalizedUrl.ok) {
      setUrlError(intl.formatMessage(messages.invalidUrl));
      return;
    }

    dispatch({ type: 'submit' });

    try {
      // Verify credentials by fetching /projects with auth via the api-client,
      // which routes through the /api proxy and validates the response.
      await apiClient.getProjects({
        baseUrl: normalizedUrl.value,
        token: trimmedToken,
      });

      // Server responded successfully — add it to the auth store
      const hostname = (() => {
        try {
          return new URL(normalizedUrl.value).hostname;
        } catch {
          return normalizedUrl.value;
        }
      })();

      let serverId: string;
      try {
        serverId = await useAuthStore.getState().addServer({
          label: hostname,
          baseUrl: normalizedUrl.value,
          token: trimmedToken,
        });
      } catch (err) {
        // The server was reachable and is already in the store. Since the
        // connectivity check (/projects) succeeded, we can complete the login:
        // activate the existing server and navigate away instead of stranding
        // the user on the login screen.
        if (err instanceof DuplicateServerError) {
          try {
            await useAuthStore
              .getState()
              .updateServer(err.serverId, { token: trimmedToken });
          } catch {
            dispatch({
              type: 'error',
              message: intl.formatMessage(messages.serverUpdateFailed),
            });
            return;
          }
          useAuthStore.getState().setActiveServer(err.serverId);
          dispatch({ type: 'success' });
          await navigate({ to: '/' });
          return;
        }
        throw err;
      }

      useAuthStore.getState().setActiveServer(serverId);

      dispatch({ type: 'success' });

      // Navigate to home
      await navigate({ to: '/' });
    } catch (err) {
      if (err instanceof ApiError) {
        dispatch({ type: 'error', message: err.message });
      } else if (err instanceof Error && err.message === 'Unable to connect') {
        dispatch({
          type: 'error',
          message: intl.formatMessage(messages.unableToConnect),
        });
      } else {
        dispatch({
          type: 'error',
          message: intl.formatMessage(messages.serverUpdateFailed),
        });
      }
    }
  }

  const isLoading = state.status === 'loading';

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-text">
            {intl.formatMessage(messages.heading)}
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            {intl.formatMessage(messages.subtitle)}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label={intl.formatMessage(messages.urlLabel)}
            type="text"
            placeholder={intl.formatMessage(messages.urlPlaceholder)}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            error={urlError ?? undefined}
            disabled={isLoading}
          />
          <Input
            label={intl.formatMessage(messages.tokenLabel)}
            type="password"
            placeholder={intl.formatMessage(messages.tokenPlaceholder)}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            error={tokenError ?? undefined}
            disabled={isLoading}
          />

          {state.status === 'error' && (
            <p className="text-sm text-error">{state.message}</p>
          )}

          <Button
            type="submit"
            loading={isLoading}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading
              ? intl.formatMessage(messages.connectingButton)
              : intl.formatMessage(messages.connectButton)}
          </Button>
        </form>
      </div>
    </div>
  );
}
