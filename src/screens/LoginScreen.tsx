import { useEffect, useRef, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { useNavigate } from '@tanstack/react-router';

import {
  InsecureArchiveTransportDialog,
  useArchiveTransportApproval,
} from '@/components/shared/InsecureArchiveTransportDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError, NetworkError, apiClient } from '@/lib/api-client';
import { withApprovedArchiveTransport } from '@/lib/archive-transport-gate';
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
  connectFailed: {
    id: 'login.connectFailed',
    defaultMessage: 'Something went wrong connecting. Please try again.',
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
// Component
// ---------------------------------------------------------------------------

export function LoginScreen() {
  const intl = useIntl();
  const navigate = useNavigate();

  type SubmitState =
    { status: 'idle' | 'loading' } | { status: 'error'; message: string };
  const [submitState, setSubmitState] = useState<SubmitState>({
    status: 'idle',
  });
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  function setSubmitStateSafe(nextState: SubmitState) {
    if (mountedRef.current) {
      setSubmitState(nextState);
    }
  }

  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const transportApproval = useArchiveTransportApproval(url);
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

    setSubmitStateSafe({ status: 'loading' });

    try {
      const transportResult = await withApprovedArchiveTransport({
        baseUrl: trimmedUrl,
        confirmInsecure: transportApproval.confirmInsecure,
        operation: async (normalizedUrl) => {
          // Credential validation is inside the transport gate so HTTP never
          // sends the bearer before the user approves this exact URL.
          await apiClient.getProjects({
            baseUrl: normalizedUrl,
            token: trimmedToken,
            serverId: null,
          });

          const hostname = new URL(normalizedUrl).hostname || normalizedUrl;
          try {
            return await useAuthStore.getState().addServer({
              label: hostname,
              baseUrl: normalizedUrl,
              token: trimmedToken,
            });
          } catch (err) {
            if (!(err instanceof DuplicateServerError)) throw err;
            try {
              await useAuthStore
                .getState()
                .updateServer(err.serverId, { token: trimmedToken });
            } catch {
              throw new Error('SERVER_UPDATE_FAILED');
            }
            return err.serverId;
          }
        },
      });

      if (transportResult.kind === 'invalid-url') {
        setUrlError(intl.formatMessage(messages.invalidUrl));
        setSubmitStateSafe({ status: 'idle' });
        return;
      }
      if (
        transportResult.kind === 'cancelled' ||
        transportResult.kind === 'stale-approval'
      ) {
        setSubmitStateSafe({ status: 'idle' });
        return;
      }
      if (transportResult.kind === 'startup-blocked') {
        setSubmitStateSafe({
          status: 'error',
          message: intl.formatMessage(messages.connectFailed),
        });
        return;
      }

      useAuthStore.getState().setActiveServer(transportResult.value);
      await navigate({ to: '/' });
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitStateSafe({ status: 'error', message: err.message });
      } else if (err instanceof NetworkError) {
        setSubmitStateSafe({
          status: 'error',
          message: intl.formatMessage(messages.unableToConnect),
        });
      } else {
        setSubmitStateSafe({
          status: 'error',
          message: intl.formatMessage(messages.connectFailed),
        });
      }
    }
  }

  const isLoading = submitState.status === 'loading';

  return (
    <>
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
              autoComplete="url"
              placeholder={intl.formatMessage(messages.urlPlaceholder)}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              error={urlError ?? undefined}
              disabled={isLoading}
            />
            <Input
              label={intl.formatMessage(messages.tokenLabel)}
              type="password"
              autoComplete="off"
              placeholder={intl.formatMessage(messages.tokenPlaceholder)}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              error={tokenError ?? undefined}
              disabled={isLoading}
            />

            {submitState.status === 'error' && (
              <p role="alert" className="text-sm text-error">
                {submitState.message}
              </p>
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
      <InsecureArchiveTransportDialog controller={transportApproval} />
    </>
  );
}
