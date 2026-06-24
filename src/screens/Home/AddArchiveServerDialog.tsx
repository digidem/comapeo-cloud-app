import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { useQueryClient } from '@tanstack/react-query';

import { ConnectionProgress } from '@/components/shared/ConnectionProgress';
import type { ConnectionStep } from '@/components/shared/ConnectionProgress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import {
  ApiError,
  InviteApiError,
  apiClient,
  redeemEncryptedInvite,
} from '@/lib/api-client';
import { normalizeArchiveBaseUrl } from '@/lib/archive-proxy';
import { syncRemoteArchive } from '@/lib/data-layer';
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

interface ConnectionProgressState {
  isActive: boolean;
  serverId: string;
  baseUrl: string;
  token: string;
  steps: ConnectionStep[];
  isComplete: boolean;
  errorMessage: string | null;
  /** Bumped on each "Try Again" so the connection effect re-runs. */
  attempt: number;
}

const INITIAL_CP_STATE: ConnectionProgressState = {
  isActive: false,
  serverId: '',
  baseUrl: '',
  token: '',
  steps: [],
  isComplete: false,
  errorMessage: null,
  attempt: 0,
};

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
  connectionFailed: {
    id: 'home.archive.dialog.connectionFailed',
    defaultMessage: 'Could not connect to server',
  },
  invalidToken: {
    id: 'home.archive.dialog.invalidToken',
    defaultMessage: 'Invalid token or unauthorized',
  },
  connectionProgressHeading: {
    id: 'home.archive.dialog.connectionProgress.heading',
    defaultMessage: 'Connecting to archive...',
  },
  connectionProgressStepVerify: {
    id: 'home.archive.dialog.connectionProgress.stepVerify',
    defaultMessage: 'Verifying invite...',
  },
  connectionProgressStepConnect: {
    id: 'home.archive.dialog.connectionProgress.stepConnect',
    defaultMessage: 'Connecting to server...',
  },
  connectionProgressStepSync: {
    id: 'home.archive.dialog.connectionProgress.stepSync',
    defaultMessage: 'Syncing data...',
  },
  connectionProgressStepPrepare: {
    id: 'home.archive.dialog.connectionProgress.stepPrepare',
    defaultMessage: 'Preparing dashboard...',
  },
  tryAgain: {
    id: 'home.archive.dialog.connectionProgress.retry',
    defaultMessage: 'Try Again',
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

/**
 * Validates that the server is reachable and the token is valid before adding.
 * Returns a discriminated union: `{ valid: true }` or
 * `{ valid: false, messageKey }`.
 */
async function validateConnection(
  baseUrl: string,
  token: string,
): Promise<
  { valid: true } | { valid: false; messageKey: keyof typeof messages }
> {
  const config = { baseUrl, token };

  let timeoutId: ReturnType<typeof setTimeout>;
  const validationPromise = (async () => {
    // First check server reachability (no auth required)
    const healthy = await apiClient.healthCheck(config);
    if (!healthy) {
      return { valid: false, messageKey: 'connectionFailed' as const };
    }

    // Then check token validity by trying to fetch projects
    try {
      await apiClient.getProjects(config);
    } catch (err) {
      // Reject both 401 (unauthenticated) and 403 (authenticated but
      // unauthorized / invalid bearer token) — many archive/auth stacks
      // return 403 for an invalid token, and the UI should block adding an
      // unusable server in either case.
      if (
        err instanceof ApiError &&
        (err.status === 401 || err.status === 403)
      ) {
        return { valid: false, messageKey: 'invalidToken' as const };
      }
      // Non-auth errors (e.g. 500, schema validation, proxy failures) are
      // intentionally allowed through. The server responded (unlike a network
      // failure), so it's reachable — sync will surface real errors with
      // proper context. Blocking here would prevent adding a temporarily
      // erroring but otherwise valid server.
      console.warn(
        'validateConnection: non-auth error from /projects, allowing through',
        err,
      );
    }

    return { valid: true } as const;
  })();

  // Structural safety net: if the underlying fetches hang indefinitely
  // (api-client methods don't accept an AbortSignal), race against a
  // 10-second timeout and treat it as a connection failure.
  const timeoutPromise = new Promise<{
    valid: false;
    messageKey: keyof typeof messages;
  }>((resolve) => {
    timeoutId = setTimeout(
      () => resolve({ valid: false, messageKey: 'connectionFailed' }),
      10_000,
    );
  });

  try {
    return await Promise.race([validationPromise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

function buildConnectionProgressSteps(intl: ReturnType<typeof useIntl>) {
  return [
    {
      id: 'verify',
      label: intl.formatMessage(messages.connectionProgressStepVerify),
      status: 'completed' as const,
    },
    {
      id: 'connect',
      label: intl.formatMessage(messages.connectionProgressStepConnect),
      status: 'pending' as const,
    },
    {
      id: 'sync',
      label: intl.formatMessage(messages.connectionProgressStepSync),
      status: 'pending' as const,
    },
    {
      id: 'prepare',
      label: intl.formatMessage(messages.connectionProgressStepPrepare),
      status: 'pending' as const,
    },
  ];
}

function AddArchiveServerDialog({
  isOpen,
  onClose,
  onAdded,
}: AddArchiveServerDialogProps) {
  const intl = useIntl();
  const [state, dispatch] = useReducer(dialogReducer, { status: 'idle' });
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Connection progress state
  const [cpState, setCpState] =
    useState<ConnectionProgressState>(INITIAL_CP_STATE);

  // Refs for advanced mode fields
  const labelRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const tokenRef = useRef<HTMLInputElement>(null);

  // Ref for invite URL field
  const inviteUrlRef = useRef<HTMLInputElement>(null);

  const [urlError, setUrlError] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [inviteUrlError, setInviteUrlError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  // Reset every piece of transient UI state. Used both when the user cancels
  // (handleClose) and after a successful connection, which closes the dialog
  // via onAdded without going through handleClose. Declared ahead of the
  // effects below so it is in scope where they reference it.
  const resetDialogState = useCallback(() => {
    setUrlError(null);
    setTokenError(null);
    setInviteUrlError(null);
    setShowAdvanced(false);
    dispatch({ type: 'reset' });
    setCpState(INITIAL_CP_STATE);
  }, []);

  // Drive the connection progress steps
  useEffect(() => {
    if (!cpState.isActive || cpState.isComplete) return;

    let cancelled = false;

    async function runConnection() {
      const steps = [...cpState.steps];

      // Step 1: Connecting to server (index 1)
      steps[1] = { ...steps[1]!, status: 'active' };
      setCpState((prev) => ({ ...prev, steps: [...steps] }));

      const result = await syncRemoteArchive(cpState.serverId, {
        baseUrl: cpState.baseUrl,
        token: cpState.token,
      });
      if (cancelled) return;

      if (!result.success) {
        steps[1] = { ...steps[1]!, status: 'error' };
        setCpState((prev) => ({
          ...prev,
          steps: [...steps],
          errorMessage: result.error ?? 'Sync failed',
        }));
        return;
      }

      // Step 1: Connecting complete
      steps[1] = { ...steps[1]!, status: 'completed' };
      setCpState((prev) => ({ ...prev, steps: [...steps] }));

      // Step 2: Syncing data (index 2)
      steps[2] = { ...steps[2]!, status: 'active' };
      setCpState((prev) => ({ ...prev, steps: [...steps] }));

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['observations'] }),
        queryClient.invalidateQueries({ queryKey: ['alerts'] }),
      ]);
      if (cancelled) return;

      steps[2] = { ...steps[2]!, status: 'completed' };
      setCpState((prev) => ({ ...prev, steps: [...steps] }));

      // Step 3: Preparing dashboard (index 3)
      steps[3] = { ...steps[3]!, status: 'active' };
      setCpState((prev) => ({ ...prev, steps: [...steps] }));

      // Brief pause for the "Preparing" step to be visible
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (cancelled) return;

      steps[3] = { ...steps[3]!, status: 'completed' };
      setCpState((prev) => ({
        ...prev,
        steps: [...steps],
        isComplete: true,
      }));
    }

    void runConnection();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cpState.isActive, cpState.isComplete, cpState.attempt]);

  // After connection progress completes, call onAdded. The success path closes
  // the dialog via onAdded → CLOSE_ADD_SERVER_DIALOG without invoking onClose(),
  // so reset transient state here too — otherwise it leaks into the next session
  // (e.g. cpState left as { isActive: true, isComplete: true }).
  useEffect(() => {
    if (!cpState.isActive || !cpState.isComplete) return;

    const timer = setTimeout(() => {
      onAdded(cpState.serverId);
      resetDialogState();
    }, 1500);

    return () => {
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cpState.isActive, cpState.isComplete]);

  const startConnectionProgress = useCallback(
    (serverId: string, baseUrl: string, token: string) => {
      setCpState({
        isActive: true,
        serverId,
        baseUrl,
        token,
        steps: buildConnectionProgressSteps(intl),
        isComplete: false,
        errorMessage: null,
        attempt: 0,
      });
    },
    [intl],
  );

  // "Try Again": rebuild the steps, clear the error, and bump `attempt` so the
  // connection effect re-runs (isActive/isComplete are unchanged on failure, so
  // without the bump the effect's dependency array would see no change).
  const retryConnection = useCallback(() => {
    setCpState((prev) => ({
      ...prev,
      steps: buildConnectionProgressSteps(intl),
      isComplete: false,
      errorMessage: null,
      attempt: prev.attempt + 1,
    }));
  }, [intl]);

  async function finalizeAddServer(baseUrl: string, token: string) {
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

    // Validate server is reachable and token is valid
    const validation = await validateConnection(normalizedUrl.value, token);
    if (!validation.valid) {
      dispatch({
        type: 'error',
        message: intl.formatMessage(messages[validation.messageKey]),
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
        // Instead of immediately calling onAdded, start connection progress
        dispatch({ type: 'success' });
        startConnectionProgress(serverId, normalizedUrl.value, token);
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

  async function handleInviteSubmit() {
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
      await finalizeAddServer(parsed.baseUrl, parsed.token);
      return;
    }

    // Encrypted: redeem the code first, then proceed with the same flow.
    dispatch({ type: 'submit' });
    redeemEncryptedInvite(parsed.code)
      .then(
        async (redeemed) => {
          await finalizeAddServer(redeemed.baseUrl, redeemed.token);
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
      )
      .catch(() => {
        dispatch({
          type: 'error',
          message: intl.formatMessage(messages.failed),
        });
      });
  }

  async function handleAdvancedSubmit() {
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

    // Validate server is reachable and token is valid
    const validation = await validateConnection(normalizedUrl.value, token);
    if (!validation.valid) {
      dispatch({
        type: 'error',
        message: intl.formatMessage(messages[validation.messageKey]),
      });
      return;
    }

    const addServer = useAuthStore.getState().addServer;
    addServer({
      label: label || normalizedUrl.value,
      baseUrl: normalizedUrl.value,
      token,
    }).then(
      (serverId) => {
        // Instead of immediately calling onAdded, start connection progress
        dispatch({ type: 'success' });
        startConnectionProgress(serverId, normalizedUrl.value, token);
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
    const promise = showAdvanced
      ? handleAdvancedSubmit()
      : handleInviteSubmit();
    promise.catch(() => {
      dispatch({ type: 'error', message: intl.formatMessage(messages.failed) });
    });
  }

  function handleClose() {
    resetDialogState();
    onClose();
  }

  // When connection progress is active, show it inside the dialog
  if (cpState.isActive) {
    return (
      <Modal
        open={isOpen}
        onOpenChange={() => {
          // Prevent closing during connection progress
        }}
        title={intl.formatMessage(messages.title)}
      >
        <div className="flex flex-col items-center gap-6 py-6">
          <ConnectionProgress
            steps={cpState.steps}
            heading={intl.formatMessage(messages.connectionProgressHeading)}
            isComplete={cpState.isComplete}
          />
          {cpState.errorMessage && (
            <div className="mt-2 flex flex-col items-center gap-3">
              <p className="text-sm text-red-600" role="alert">
                {cpState.errorMessage}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleClose}
                >
                  {intl.formatMessage(messages.cancel)}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={retryConnection}
                >
                  {intl.formatMessage(messages.tryAgain)}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    );
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
