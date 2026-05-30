import { useReducer, useRef, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { InviteApiError, redeemEncryptedInvite } from '@/lib/api-client';
import { normalizeArchiveBaseUrl } from '@/lib/archive-proxy';
import { parseInviteUrl, warnLegacyInviteUrlOnce } from '@/lib/invite-url';
import { DuplicateServerError, useAuthStore } from '@/stores/auth-store';

interface AddArchiveServerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdded: (serverId: string) => void;
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
    id: 'home.archive.dialog.title',
    defaultMessage: 'Add Archive Server',
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
  add: {
    id: 'home.archive.dialog.add',
    defaultMessage: 'Add',
  },
  cancel: {
    id: 'home.archive.dialog.cancel',
    defaultMessage: 'Cancel',
  },
  failed: {
    id: 'home.archive.dialog.error',
    defaultMessage: 'Failed to add server',
  },
  urlRequired: {
    id: 'home.archive.dialog.urlRequired',
    defaultMessage: 'Server URL is required',
  },
  tokenRequired: {
    id: 'home.archive.dialog.tokenRequired',
    defaultMessage: 'Bearer Token is required',
  },
  duplicateServer: {
    id: 'home.archive.dialog.duplicateServer',
    defaultMessage: 'This archive server is already connected',
  },
  invalidUrl: {
    id: 'home.archive.dialog.invalidUrl',
    defaultMessage: 'Enter a full URL including http:// or https://',
  },
  unsupportedProtocol: {
    id: 'home.archive.dialog.unsupportedProtocol',
    defaultMessage: 'Archive server URL must start with http:// or https://',
  },
  urlCredentials: {
    id: 'home.archive.dialog.urlCredentials',
    defaultMessage: 'Archive server URL must not include credentials',
  },
  inviteUrl: {
    id: 'home.archive.dialog.inviteUrl',
    defaultMessage: 'Invite URL or Code',
  },
  inviteUrlPlaceholder: {
    id: 'home.archive.dialog.inviteUrlPlaceholder',
    defaultMessage: 'Paste invite URL or code',
  },
  inviteUrlRequired: {
    id: 'home.archive.dialog.inviteUrlRequired',
    defaultMessage: 'Invite URL or code is required',
  },
  invalidInviteUrl: {
    id: 'home.archive.dialog.invalidInviteUrl',
    defaultMessage:
      "Invalid invite. Make sure it's a full URL or a valid code.",
  },
  inviteExpired: {
    id: 'home.archive.dialog.inviteExpired',
    defaultMessage: 'This invite has expired. Ask the sender for a new one.',
  },
  advanced: {
    id: 'home.archive.dialog.advanced',
    defaultMessage: 'Advanced',
  },
  advancedDescription: {
    id: 'home.archive.dialog.advancedDescription',
    defaultMessage: 'Enter server details manually',
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

function getUrlValidationMessage(
  code: Exclude<
    ReturnType<typeof normalizeArchiveBaseUrl>,
    { ok: true }
  >['code'],
) {
  switch (code) {
    case 'UNSUPPORTED_ARCHIVE_PROTOCOL':
      return messages.unsupportedProtocol;
    case 'UNSUPPORTED_ARCHIVE_URL_CREDENTIALS':
      return messages.urlCredentials;
    case 'INVALID_ARCHIVE_URL':
    case 'MISSING_ARCHIVE_TARGET':
    case 'UNSUPPORTED_ARCHIVE_PROXY_METHOD':
    case 'UNSUPPORTED_ARCHIVE_PROXY_PATH':
      return messages.invalidUrl;
  }
}

function checkDuplicate(normalizedUrl: string): boolean {
  return useAuthStore.getState().servers.some((s) => {
    const normalizedExisting = normalizeArchiveBaseUrl(s.baseUrl);
    return normalizedExisting.ok && normalizedExisting.value === normalizedUrl;
  });
}

function AddArchiveServerDialog({
  isOpen,
  onClose,
  onAdded,
}: AddArchiveServerDialogProps) {
  const intl = useIntl();
  const [state, dispatch] = useReducer(dialogReducer, { status: 'idle' });
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Refs for advanced mode fields
  const labelRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const tokenRef = useRef<HTMLInputElement>(null);

  // Ref for invite URL field
  const inviteUrlRef = useRef<HTMLInputElement>(null);

  const [urlError, setUrlError] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [inviteUrlError, setInviteUrlError] = useState<string | null>(null);

  function finalizeAddServer(baseUrl: string, token: string) {
    const normalizedUrl = normalizeArchiveBaseUrl(baseUrl);
    if (!normalizedUrl.ok) {
      const urlMessage = getUrlValidationMessage(normalizedUrl.code);
      dispatch({
        type: 'error',
        message: intl.formatMessage(urlMessage),
      });
      return;
    }

    // Check for duplicate
    if (checkDuplicate(normalizedUrl.value)) {
      dispatch({
        type: 'error',
        message: intl.formatMessage(messages.duplicateServer),
      });
      return;
    }

    const hostname = (() => {
      try {
        return new URL(baseUrl).hostname;
      } catch {
        return normalizedUrl.value;
      }
    })();

    const addServer = useAuthStore.getState().addServer;
    addServer({
      label: hostname,
      baseUrl: normalizedUrl.value,
      token,
    }).then(
      (serverId) => {
        dispatch({ type: 'success' });
        onAdded(serverId);
      },
      (err: unknown) => {
        if (err instanceof DuplicateServerError) {
          dispatch({
            type: 'error',
            message: intl.formatMessage(messages.duplicateServer),
          });
          return;
        }
        const message =
          err instanceof Error
            ? err.message
            : intl.formatMessage(messages.failed);
        dispatch({ type: 'error', message });
      },
    );
  }

  function handleInviteSubmit() {
    const inviteUrl = inviteUrlRef.current?.value?.trim() ?? '';

    setInviteUrlError(null);

    if (!inviteUrl) {
      setInviteUrlError(intl.formatMessage(messages.inviteUrlRequired));
      return;
    }

    const parsed = parseInviteUrl(inviteUrl);
    if (!parsed.ok) {
      setInviteUrlError(intl.formatMessage(messages.invalidInviteUrl));
      return;
    }

    if (parsed.kind === 'legacy') {
      // TODO(issue-#8): remove this legacy branch in the next release.
      warnLegacyInviteUrlOnce();
      // For early validation, normalize first so we can show the field error
      // (rather than a generic dialog error) for malformed legacy URLs.
      const normalizedUrl = normalizeArchiveBaseUrl(parsed.baseUrl);
      if (!normalizedUrl.ok) {
        setInviteUrlError(
          intl.formatMessage(getUrlValidationMessage(normalizedUrl.code)),
        );
        return;
      }

      // Check for duplicate
      if (checkDuplicate(normalizedUrl.value)) {
        dispatch({
          type: 'error',
          message: intl.formatMessage(messages.duplicateServer),
        });
        return;
      }

      dispatch({ type: 'submit' });
      finalizeAddServer(parsed.baseUrl, parsed.token);
      return;
    }

    // Encrypted: redeem the code first, then proceed with the same flow.
    dispatch({ type: 'submit' });
    redeemEncryptedInvite(parsed.code).then(
      (redeemed) => {
        finalizeAddServer(redeemed.baseUrl, redeemed.token);
      },
      (err: unknown) => {
        if (err instanceof InviteApiError && err.code === 'INVITE_EXPIRED') {
          dispatch({
            type: 'error',
            message: intl.formatMessage(messages.inviteExpired),
          });
          return;
        }
        let message: string;
        if (err instanceof InviteApiError) {
          message = intl.formatMessage(messages.invalidInviteUrl);
        } else if (err instanceof Error) {
          message = err.message;
        } else {
          message = intl.formatMessage(messages.failed);
        }
        dispatch({ type: 'error', message });
      },
    );
  }

  function handleAdvancedSubmit() {
    const url = urlRef.current?.value?.trim() ?? '';
    const token = tokenRef.current?.value?.trim() ?? '';
    const label = labelRef.current?.value?.trim() ?? '';

    // Clear previous field errors
    setUrlError(null);
    setTokenError(null);

    // Validate required fields
    if (!url) {
      setUrlError(intl.formatMessage(messages.urlRequired));
      return;
    }
    if (!token) {
      setTokenError(intl.formatMessage(messages.tokenRequired));
      return;
    }

    // Validate URL format and protocol
    const normalizedUrl = normalizeArchiveBaseUrl(url);
    if (!normalizedUrl.ok) {
      setUrlError(
        intl.formatMessage(getUrlValidationMessage(normalizedUrl.code)),
      );
      return;
    }

    // Check for duplicate URL (normalized comparison)
    if (checkDuplicate(normalizedUrl.value)) {
      dispatch({
        type: 'error',
        message: intl.formatMessage(messages.duplicateServer),
      });
      return;
    }

    dispatch({ type: 'submit' });

    const addServer = useAuthStore.getState().addServer;
    addServer({
      label: label || normalizedUrl.value,
      baseUrl: normalizedUrl.value,
      token,
    }).then(
      (serverId) => {
        dispatch({ type: 'success' });
        onAdded(serverId);
      },
      (err: unknown) => {
        if (err instanceof DuplicateServerError) {
          dispatch({
            type: 'error',
            message: intl.formatMessage(messages.duplicateServer),
          });
          return;
        }
        const message =
          err instanceof Error
            ? err.message
            : intl.formatMessage(messages.failed);
        dispatch({ type: 'error', message });
      },
    );
  }

  function handleSubmit() {
    if (showAdvanced) {
      handleAdvancedSubmit();
    } else {
      handleInviteSubmit();
    }
  }

  function handleClose() {
    setUrlError(null);
    setTokenError(null);
    setInviteUrlError(null);
    setShowAdvanced(false);
    dispatch({ type: 'reset' });
    onClose();
  }

  return (
    <Modal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
      title={intl.formatMessage(messages.title)}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="flex flex-col gap-4"
      >
        {!showAdvanced ? (
          /* Default mode: Invite URL input */
          <Input
            ref={inviteUrlRef}
            label={intl.formatMessage(messages.inviteUrl)}
            type="text"
            placeholder={intl.formatMessage(messages.inviteUrlPlaceholder)}
            defaultValue=""
            error={inviteUrlError ?? undefined}
          />
        ) : (
          /* Advanced mode: Label + Server URL + Bearer Token */
          <>
            <Input
              ref={labelRef}
              label={intl.formatMessage(messages.label)}
              type="text"
              placeholder={intl.formatMessage(messages.labelPlaceholder)}
              defaultValue=""
            />
            <Input
              ref={urlRef}
              label={intl.formatMessage(messages.url)}
              type="text"
              placeholder={intl.formatMessage(messages.urlPlaceholder)}
              defaultValue=""
              error={urlError ?? undefined}
            />
            <Input
              ref={tokenRef}
              label={intl.formatMessage(messages.token)}
              type="password"
              placeholder={intl.formatMessage(messages.tokenPlaceholder)}
              defaultValue=""
              error={tokenError ?? undefined}
            />
          </>
        )}

        {state.status === 'error' && (
          <p className="text-sm text-error">{state.message}</p>
        )}

        {/* Advanced toggle */}
        <button
          type="button"
          data-testid="advanced-toggle"
          className="text-sm text-primary hover:text-primary-dark text-left"
          onClick={() => setShowAdvanced((prev) => !prev)}
        >
          {intl.formatMessage(messages.advanced)} —{' '}
          {intl.formatMessage(messages.advancedDescription)}
        </button>

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
            {intl.formatMessage(messages.add)}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export { AddArchiveServerDialog };
export type { AddArchiveServerDialogProps };
