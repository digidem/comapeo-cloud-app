import { useReducer, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import {
  InsecureArchiveTransportDialog,
  useArchiveTransportApproval,
} from '@/components/shared/InsecureArchiveTransportDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import {
  ApiError,
  InviteApiError,
  NetworkError,
  apiClient,
  redeemEncryptedInvite,
} from '@/lib/api-client';
import { normalizeArchiveBaseUrl } from '@/lib/archive-proxy';
import { withApprovedArchiveTransport } from '@/lib/archive-transport-gate';
import { parseInviteUrl, warnLegacyInviteUrlOnce } from '@/lib/invite-url';
import type { RemoteArchiveServer } from '@/stores/auth-store';
import { useAuthStore } from '@/stores/auth-store';

type EditArchiveServerDialogMode = 'edit' | 'reconnect';

interface EditArchiveServerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  server: RemoteArchiveServer;
  mode?: EditArchiveServerDialogMode;
}

type DialogState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string };

type DialogAction =
  | { type: 'submit' }
  | { type: 'success' }
  | { type: 'error'; message: string }
  | { type: 'reset' };

const messages = defineMessages({
  title: {
    id: 'home.archive.editDialog.title',
    defaultMessage: 'Edit Archive Server',
  },
  reconnectTitle: {
    id: 'home.archive.reconnectDialog.title',
    defaultMessage: 'Reconnect Archive',
  },
  label: {
    id: 'home.archive.dialog.label',
    defaultMessage: 'Label (optional)',
  },
  labelPlaceholder: {
    id: 'home.archive.dialog.labelPlaceholder',
    defaultMessage: 'e.g. Production Server',
  },
  url: {
    id: 'home.archive.dialog.url',
    defaultMessage: 'Server URL',
  },
  urlPlaceholder: {
    id: 'home.archive.dialog.urlPlaceholder',
    defaultMessage: 'https://archive.example.com',
  },
  token: {
    id: 'home.archive.dialog.token',
    defaultMessage: 'Bearer Token',
  },
  tokenPlaceholder: {
    id: 'home.archive.dialog.tokenPlaceholder',
    defaultMessage: 'Enter bearer token',
  },
  invite: {
    id: 'home.archive.reconnectDialog.invite',
    defaultMessage: 'Invite URL or Code',
  },
  invitePlaceholder: {
    id: 'home.archive.reconnectDialog.invitePlaceholder',
    defaultMessage: 'Paste an invitation instead of a bearer token',
  },
  save: {
    id: 'home.archive.editDialog.save',
    defaultMessage: 'Save',
  },
  reconnect: {
    id: 'home.archive.reconnectDialog.reconnect',
    defaultMessage: 'Reconnect',
  },
  cancel: {
    id: 'home.archive.dialog.cancel',
    defaultMessage: 'Cancel',
  },
  failed: {
    id: 'home.archive.editDialog.error',
    defaultMessage: 'Failed to update server',
  },
  urlRequired: {
    id: 'home.archive.dialog.urlRequired',
    defaultMessage: 'Server URL is required',
  },
  invalidUrl: {
    id: 'home.archive.dialog.invalidUrl',
    defaultMessage: 'Enter a full URL including http:// or https://',
  },
  credentialRequired: {
    id: 'home.archive.reconnectDialog.credentialRequired',
    defaultMessage: 'Enter a bearer token or invite to reconnect',
  },
  credentialChoice: {
    id: 'home.archive.reconnectDialog.credentialChoice',
    defaultMessage: 'Use either a bearer token or an invite, not both',
  },
  invalidInvite: {
    id: 'home.archive.reconnectDialog.invalidInvite',
    defaultMessage: 'This invitation is invalid. Request a new invitation.',
  },
  inviteMismatch: {
    id: 'home.archive.reconnectDialog.inviteMismatch',
    defaultMessage: 'This invitation is for a different archive',
  },
  inviteExpired: {
    id: 'home.archive.reconnectDialog.inviteExpired',
    defaultMessage: 'Invite expired — request a new invitation',
  },
  invalidToken: {
    id: 'home.archive.dialog.invalidToken',
    defaultMessage: 'Invalid token or unauthorized',
  },
  unableToConnect: {
    id: 'home.archive.reconnectDialog.unableToConnect',
    defaultMessage: 'Unable to connect. Check the archive and try again.',
  },
  startupBlocked: {
    id: 'home.archive.reconnectDialog.startupBlocked',
    defaultMessage: 'Secure startup must complete before reconnecting.',
  },
});

function dialogReducer(_state: DialogState, action: DialogAction): DialogState {
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

function EditArchiveServerDialogContent({
  isOpen,
  onClose,
  server,
  mode = 'edit',
}: EditArchiveServerDialogProps) {
  const intl = useIntl();
  const [state, dispatch] = useReducer(dialogReducer, { status: 'idle' });
  const [label, setLabel] = useState(server.label);
  const [url, setUrl] = useState(server.baseUrl);
  const [candidateToken, setCandidateToken] = useState('');
  const [inviteInput, setInviteInput] = useState('');
  const transportApproval = useArchiveTransportApproval(url);

  function resetSensitiveInputs() {
    setCandidateToken('');
    setInviteInput('');
    transportApproval.cancel();
  }

  function fail(message: string) {
    dispatch({ type: 'error', message });
  }

  async function resolveInviteCredential(
    input: string,
  ): Promise<{ baseUrl: string; token: string } | null> {
    const parsed = parseInviteUrl(input);
    if (!parsed.ok) {
      fail(intl.formatMessage(messages.invalidInvite));
      return null;
    }

    if (parsed.kind === 'legacy') {
      warnLegacyInviteUrlOnce();
      return { baseUrl: parsed.baseUrl, token: parsed.token };
    }

    try {
      return await redeemEncryptedInvite(parsed.code);
    } catch (error) {
      if (error instanceof InviteApiError && error.code === 'INVITE_EXPIRED') {
        fail(intl.formatMessage(messages.inviteExpired));
        return null;
      }
      if (error instanceof NetworkError) {
        fail(intl.formatMessage(messages.unableToConnect));
        return null;
      }
      fail(intl.formatMessage(messages.invalidInvite));
      return null;
    }
  }

  async function handleSubmit() {
    const trimmedUrl = url.trim();
    const trimmedLabel = label.trim();
    const trimmedToken = candidateToken.trim();
    const trimmedInvite = inviteInput.trim();

    if (!trimmedUrl) {
      fail(intl.formatMessage(messages.urlRequired));
      return;
    }

    const normalizedTarget = normalizeArchiveBaseUrl(trimmedUrl);
    if (!normalizedTarget.ok) {
      fail(intl.formatMessage(messages.invalidUrl));
      return;
    }

    const normalizedExisting = normalizeArchiveBaseUrl(server.baseUrl);
    const urlChanged =
      !normalizedExisting.ok ||
      normalizedExisting.value !== normalizedTarget.value;
    const requiresCredential = mode === 'reconnect' || urlChanged;

    if (trimmedToken && trimmedInvite) {
      fail(intl.formatMessage(messages.credentialChoice));
      return;
    }

    if (!trimmedToken && !trimmedInvite) {
      if (requiresCredential) {
        fail(intl.formatMessage(messages.credentialRequired));
        return;
      }

      dispatch({ type: 'submit' });
      try {
        await useAuthStore.getState().updateServer(server.id, {
          label: trimmedLabel || normalizedTarget.value,
          baseUrl: normalizedTarget.value,
        });
        dispatch({ type: 'success' });
        resetSensitiveInputs();
        onClose();
      } catch (error) {
        fail(
          error instanceof Error
            ? error.message
            : intl.formatMessage(messages.failed),
        );
      }
      return;
    }

    dispatch({ type: 'submit' });

    let token = trimmedToken;
    if (trimmedInvite) {
      const redeemed = await resolveInviteCredential(trimmedInvite);
      if (!redeemed) return;

      const normalizedInviteUrl = normalizeArchiveBaseUrl(redeemed.baseUrl);
      if (
        !normalizedInviteUrl.ok ||
        normalizedInviteUrl.value !== normalizedTarget.value
      ) {
        fail(intl.formatMessage(messages.inviteMismatch));
        return;
      }
      token = redeemed.token;
    }

    try {
      const transportResult = await withApprovedArchiveTransport({
        baseUrl: normalizedTarget.value,
        confirmInsecure: transportApproval.confirmInsecure,
        operation: async (approvedUrl) => {
          const config = { baseUrl: approvedUrl, token, serverId: null };
          const healthy = await apiClient.healthCheck(config);
          if (!healthy) throw new NetworkError();
          await apiClient.getProjects(config);

          await useAuthStore.getState().updateServer(server.id, {
            label: trimmedLabel || approvedUrl,
            baseUrl: approvedUrl,
            token,
          });
        },
      });

      if (
        transportResult.kind === 'cancelled' ||
        transportResult.kind === 'stale-approval'
      ) {
        dispatch({ type: 'reset' });
        return;
      }
      if (transportResult.kind === 'invalid-url') {
        fail(intl.formatMessage(messages.invalidUrl));
        return;
      }
      if (transportResult.kind === 'startup-blocked') {
        fail(intl.formatMessage(messages.startupBlocked));
        return;
      }

      dispatch({ type: 'success' });
      resetSensitiveInputs();
      onClose();
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === 401 || error.status === 403)
      ) {
        fail(intl.formatMessage(messages.invalidToken));
        return;
      }
      if (error instanceof NetworkError) {
        fail(intl.formatMessage(messages.unableToConnect));
        return;
      }
      fail(
        error instanceof Error
          ? error.message
          : intl.formatMessage(messages.failed),
      );
    }
  }

  function handleClose() {
    dispatch({ type: 'reset' });
    setLabel(server.label);
    setUrl(server.baseUrl);
    resetSensitiveInputs();
    onClose();
  }

  return (
    <>
      <Modal
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
        title={intl.formatMessage(
          mode === 'reconnect' ? messages.reconnectTitle : messages.title,
        )}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
          className="flex flex-col gap-4"
        >
          <Input
            label={intl.formatMessage(messages.label)}
            type="text"
            placeholder={intl.formatMessage(messages.labelPlaceholder)}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            disabled={mode === 'reconnect'}
          />
          <Input
            label={intl.formatMessage(messages.url)}
            type="text"
            placeholder={intl.formatMessage(messages.urlPlaceholder)}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            disabled={mode === 'reconnect'}
          />
          <Input
            label={intl.formatMessage(messages.token)}
            type="password"
            autoComplete="off"
            placeholder={intl.formatMessage(messages.tokenPlaceholder)}
            value={candidateToken}
            onChange={(event) => setCandidateToken(event.target.value)}
          />
          <Input
            label={intl.formatMessage(messages.invite)}
            type="text"
            autoComplete="off"
            placeholder={intl.formatMessage(messages.invitePlaceholder)}
            value={inviteInput}
            onChange={(event) => setInviteInput(event.target.value)}
          />

          {state.status === 'error' && (
            <p role="alert" className="text-sm text-error">
              {state.message}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleClose}
            >
              {intl.formatMessage(messages.cancel)}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={state.status === 'loading'}
            >
              {intl.formatMessage(
                mode === 'reconnect' ? messages.reconnect : messages.save,
              )}
            </Button>
          </div>
        </form>
      </Modal>
      <InsecureArchiveTransportDialog controller={transportApproval} />
    </>
  );
}

function EditArchiveServerDialog(props: EditArchiveServerDialogProps) {
  if (!props.isOpen) return null;
  return (
    <EditArchiveServerDialogContent
      key={`${props.server.id}:${props.mode ?? 'edit'}`}
      {...props}
    />
  );
}

export { EditArchiveServerDialog };
export type { EditArchiveServerDialogMode, EditArchiveServerDialogProps };
