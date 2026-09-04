import { useCallback } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { useNavigate } from '@tanstack/react-router';

import { useToast } from '@/components/ui/toast';
import type { ToastData } from '@/components/ui/toast';
import { commonMessages } from '@/i18n/common-messages';
import { syncRemoteArchive } from '@/lib/data-layer';
import type { SyncResult } from '@/lib/sync';
import { useAuthStore } from '@/stores/auth-store';
import { useProjectStore } from '@/stores/project-store';

const messages = defineMessages({
  successTitle: {
    id: 'archive.sync.toast.successTitle',
    defaultMessage: 'Archive synced',
  },
  partialTitle: {
    id: 'archive.sync.toast.partialTitle',
    defaultMessage: 'Some data synced for {name}',
  },
  errorTitle: {
    id: 'archive.sync.toast.errorTitle',
    defaultMessage: "Couldn't sync {name}",
  },
  authRequired: {
    id: 'archive.sync.toast.authRequired',
    defaultMessage: 'Session expired — reconnect {name} to continue',
  },
  credentialsRequired: {
    id: 'archive.sync.toast.credentialsRequired',
    defaultMessage: 'Token missing — reconnect {name}',
  },
  connectionError: {
    id: 'archive.sync.toast.connectionError',
    defaultMessage: "Couldn't reach {name} — check your connection",
  },
  storageCleanupRequired: {
    id: 'archive.sync.toast.storageCleanupRequired',
    defaultMessage: 'Sync paused: storage cleanup needed for {name}',
  },
  workerTransitionRequired: {
    id: 'archive.sync.toast.workerTransitionRequired',
    defaultMessage: 'Sync paused: app update in progress — try again shortly',
  },
  reconnectAction: {
    id: 'archive.sync.toast.reconnectAction',
    defaultMessage: 'Reconnect',
  },
});

type ToastDraft = Omit<ToastData, 'id'>;

interface ArchiveSyncToastArgs {
  result: SyncResult | null;
  name: string;
  intl: ReturnType<typeof useIntl>;
  reconnectAction: { label: string; onClick: () => void };
  openSettingsAction: { label: string; onClick: () => void };
}

/**
 * Maps one `SyncResult` to its toast. `success` is only true for
 * `status === 'ready'`, so the partial case is keyed on the outcome itself —
 * keying it on `success && status === 'partial'` would be unsatisfiable and
 * misroute partial results to the generic error toast.
 */
function archiveSyncToast({
  result,
  name,
  intl,
  reconnectAction,
  openSettingsAction,
}: ArchiveSyncToastArgs): ToastDraft {
  const status = result?.status;
  const errorCode = result?.errorCode;

  if (result?.success && status === 'ready') {
    return {
      variant: 'success',
      title: intl.formatMessage(messages.successTitle),
      description: name,
    };
  }

  if (status === 'partial' || errorCode === 'partial') {
    return {
      variant: 'info',
      title: intl.formatMessage(messages.partialTitle, { name }),
    };
  }

  switch (errorCode) {
    case 'authorization':
      return {
        variant: 'error',
        title: intl.formatMessage(messages.authRequired, { name }),
        action: reconnectAction,
      };
    case 'credentials-required':
      return {
        variant: 'error',
        title: intl.formatMessage(messages.credentialsRequired, { name }),
        action: reconnectAction,
      };
    case 'connection':
      return {
        variant: 'error',
        title: intl.formatMessage(messages.connectionError, { name }),
      };
    case 'storage-cleanup-required':
      return {
        variant: 'info',
        title: intl.formatMessage(messages.storageCleanupRequired, { name }),
        action: openSettingsAction,
      };
    case 'worker-transition-required':
      return {
        variant: 'info',
        title: intl.formatMessage(messages.workerTransitionRequired),
      };
    default:
      // Thrown calls and any unmapped failure shape land here.
      return {
        variant: 'error',
        title: intl.formatMessage(messages.errorTitle, { name }),
      };
  }
}

/**
 * Shared per-archive manual sync trigger. Owns the whole path — server
 * resolution from the auth store, the in-flight/credential guard, the
 * coordinator call, and the outcome toast (including its recovery actions) —
 * so every wiring site reports outcomes identically.
 */
export function useArchiveSyncTrigger(): (serverId: string) => Promise<void> {
  const intl = useIntl();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const sync = useCallback(
    async (serverId: string): Promise<void> => {
      const server = useAuthStore
        .getState()
        .servers.find((candidate) => candidate.id === serverId);
      if (!server) return;

      // Same UX guard as HomeScreen.handleSync: the coordinator owns the real
      // per-server lock, this only avoids issuing a pointless call.
      if (server.status === 'syncing' || !server.token) return;

      const goToArchive = () => {
        // Home renders ArchiveServerDetail (edit/reconnect) for the selected id.
        useProjectStore.getState().setSelectedServerId(serverId);
        navigate({ to: '/' });
      };
      const goToSettings = () => navigate({ to: '/settings' });

      let result: SyncResult | null = null;
      try {
        result = await syncRemoteArchive(serverId, {
          baseUrl: server.baseUrl,
          token: server.token,
        });
      } catch {
        // Thrown calls fall through to the generic error toast via `null`.
      }

      addToast(
        archiveSyncToast({
          result,
          name: server.label || server.baseUrl,
          intl,
          reconnectAction: {
            label: intl.formatMessage(messages.reconnectAction),
            onClick: goToArchive,
          },
          openSettingsAction: {
            label: intl.formatMessage(commonMessages.openSettingsAction),
            onClick: goToSettings,
          },
        }),
      );
    },
    [addToast, intl, navigate],
  );

  return sync;
}
