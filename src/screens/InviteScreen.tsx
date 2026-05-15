import { useEffect, useMemo, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import { syncRemoteArchive } from '@/lib/data-layer';
import { useAuthStore } from '@/stores/auth-store';

const messages = defineMessages({
  connecting: {
    id: 'invite.connecting',
    defaultMessage: 'Connecting to archive...',
  },
  connected: {
    id: 'invite.connected',
    defaultMessage: 'Connected! Redirecting...',
  },
  error: {
    id: 'invite.error',
    defaultMessage: 'Failed to connect to archive.',
  },
});

function parseInviteParams(): { archiveUrl: string; token: string } | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const archiveUrl = params.get('url');
  const hash = params.get('hash');
  const tokenParam = params.get('token');
  // Fall back to hash for backward-compatibility with legacy invite URLs
  // that didn't include a dedicated `token` parameter.
  const token = tokenParam ?? hash ?? '';
  if (!archiveUrl || !token) return null;
  return { archiveUrl, token };
}

export function InviteScreen() {
  const intl = useIntl();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const invite = useMemo(() => parseInviteParams(), []);
  const [status, setStatus] = useState<'loading' | 'connected' | 'error'>(
    invite ? 'loading' : 'error',
  );

  useEffect(() => {
    if (!invite) return;

    const { archiveUrl, token } = invite;
    let cancelled = false;

    useAuthStore
      .getState()
      .addServer({
        label: new URL(archiveUrl).hostname,
        baseUrl: archiveUrl,
        token,
      })
      .then((serverId) => {
        if (cancelled) return undefined;
        return syncRemoteArchive(serverId, {
          baseUrl: archiveUrl,
          token,
        });
      })
      .then(async (result) => {
        if (cancelled) return;
        if (!result || !result.success) {
          setStatus('error');
          return;
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['projects'] }),
          queryClient.invalidateQueries({ queryKey: ['observations'] }),
          queryClient.invalidateQueries({ queryKey: ['alerts'] }),
        ]);
        if (cancelled) return;
        setStatus('connected');
        setTimeout(() => {
          if (!cancelled) navigate({ to: '/' });
        }, 1500);
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [invite, navigate, queryClient]);

  return (
    <div className="flex h-screen items-center justify-center bg-surface">
      <div className="text-center">
        {status === 'loading' && (
          <p className="text-text">{intl.formatMessage(messages.connecting)}</p>
        )}
        {status === 'connected' && (
          <p className="text-green-600">
            {intl.formatMessage(messages.connected)}
          </p>
        )}
        {status === 'error' && (
          <p className="text-red-600">{intl.formatMessage(messages.error)}</p>
        )}
      </div>
    </div>
  );
}
