import { useEffect, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';
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

export function InviteScreen() {
  const intl = useIntl();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'connected' | 'error'>(
    'loading',
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const archiveUrl = params.get('url');
    const hash = params.get('hash');

    if (!archiveUrl) {
      setStatus('error');
      return;
    }

    let cancelled = false;

    useAuthStore
      .getState()
      .addServer({
        label: new URL(archiveUrl).hostname,
        baseUrl: archiveUrl,
        token: hash ?? '',
      })
      .then((serverId) => {
        if (cancelled) return;
        // After adding the server, trigger a sync to actually connect
        return syncRemoteArchive(serverId, {
          baseUrl: archiveUrl,
          token: hash ?? '',
        });
      })
      .then(() => {
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
  }, [navigate]);

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
          <p className="text-red-600">
            {intl.formatMessage(messages.error)}
          </p>
        )}
      </div>
    </div>
  );
}
