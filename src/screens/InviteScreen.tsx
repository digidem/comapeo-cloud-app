import { useEffect, useMemo, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import { InviteApiError, redeemEncryptedInvite } from '@/lib/api-client';
import { syncRemoteArchive } from '@/lib/data-layer';
import {
  type ParseInviteResult,
  parseInviteUrl,
  warnLegacyInviteUrlOnce,
} from '@/lib/invite-url';
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
  expired: {
    id: 'invite.expired',
    defaultMessage:
      'This invite link has expired. Ask the sender for a new one.',
  },
  invalidInvite: {
    id: 'invite.invalid',
    defaultMessage: "Couldn't accept this invite. The link may be invalid.",
  },
});

function parseInviteFromLocation(): ParseInviteResult | null {
  if (typeof window === 'undefined') return null;
  const origin = window.location.origin;
  const search = window.location.search;
  const candidate = `${origin}/invite${search}`;
  return parseInviteUrl(candidate);
}

export function InviteScreen() {
  const intl = useIntl();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const invite = useMemo(() => parseInviteFromLocation(), []);
  const [status, setStatus] = useState<
    'loading' | 'connected' | 'error' | 'expired' | 'invalid'
  >(() => {
    if (!invite) return 'error';
    return invite.ok ? 'loading' : 'invalid';
  });

  useEffect(() => {
    if (!invite || !invite.ok) return;

    let cancelled = false;
    const parsed = invite;

    async function run(): Promise<void> {
      try {
        let baseUrl: string;
        let token: string;

        if (parsed.kind === 'encrypted') {
          const redeemed = await redeemEncryptedInvite(parsed.code);
          if (cancelled) return;
          baseUrl = redeemed.baseUrl;
          token = redeemed.token;
        } else {
          // TODO(issue-#8): remove this legacy branch in the next release.
          warnLegacyInviteUrlOnce();
          baseUrl = parsed.baseUrl;
          token = parsed.token;
        }

        const serverId = await useAuthStore.getState().addServer({
          label: new URL(baseUrl).hostname,
          baseUrl,
          token,
        });
        if (cancelled) return;

        const syncResult = await syncRemoteArchive(serverId, {
          baseUrl,
          token,
        });
        if (cancelled) return;
        if (!syncResult || !syncResult.success) {
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
      } catch (err) {
        if (cancelled) return;
        if (err instanceof InviteApiError) {
          if (err.code === 'INVITE_EXPIRED') {
            setStatus('expired');
          } else {
            setStatus('invalid');
          }
          return;
        }
        setStatus('error');
      }
    }

    void run();

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
        {status === 'expired' && (
          <p className="text-red-600">{intl.formatMessage(messages.expired)}</p>
        )}
        {status === 'invalid' && (
          <p className="text-red-600">
            {intl.formatMessage(messages.invalidInvite)}
          </p>
        )}
        {status === 'error' && (
          <p className="text-red-600">{intl.formatMessage(messages.error)}</p>
        )}
      </div>
    </div>
  );
}
