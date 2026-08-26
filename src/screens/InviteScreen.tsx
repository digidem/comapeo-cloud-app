import { useCallback, useEffect, useRef, useState } from 'react';
import { IntlShape, defineMessages, useIntl } from 'react-intl';

import { Link, useNavigate } from '@tanstack/react-router';

import {
  ConnectionProgress,
  type ConnectionStep,
} from '@/components/shared/ConnectionProgress';
import {
  InsecureArchiveTransportDialog,
  useArchiveTransportApproval,
} from '@/components/shared/InsecureArchiveTransportDialog';
import { Button } from '@/components/ui/button';
import {
  InviteApiError,
  apiClient,
  redeemEncryptedInvite,
} from '@/lib/api-client';
import { withApprovedArchiveTransport } from '@/lib/archive-transport-gate';
import { syncRemoteArchive } from '@/lib/data-layer';
import {
  clearInviteBootstrapCandidate,
  consumeInviteBootstrapCandidate,
} from '@/lib/invite-bootstrap-runtime';
import {
  type ParseInviteResult,
  parseInviteUrl,
  warnLegacyInviteUrlOnce,
} from '@/lib/invite-url';
import { type RemoteArchiveServer, useAuthStore } from '@/stores/auth-store';

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

const messages = defineMessages({
  heading: {
    id: 'invite.progress.heading',
    defaultMessage: 'Connecting to archive...',
  },
  stepVerify: {
    id: 'invite.progress.stepVerify',
    defaultMessage: 'Verifying invite...',
  },
  stepConnect: {
    id: 'invite.progress.stepConnect',
    defaultMessage: 'Connecting to server...',
  },
  stepSync: {
    id: 'invite.progress.stepSync',
    defaultMessage: 'Syncing data...',
  },
  stepPrepare: {
    id: 'invite.progress.stepPrepare',
    defaultMessage: 'Preparing dashboard...',
  },
  error: {
    id: 'invite.error',
    defaultMessage: 'Failed to connect to archive.',
  },
  expired: {
    id: 'invite.expired',
    defaultMessage: 'This invite has expired. Ask the sender for a new one.',
  },
  invalidInvite: {
    id: 'invite.invalid',
    defaultMessage:
      "Couldn't accept this invite. The URL or code may be invalid.",
  },
  networkError: {
    id: 'invite.progress.networkError',
    defaultMessage: 'Unable to connect. Check your internet connection.',
  },
  invalidToken: {
    id: 'home.archive.dialog.invalidToken',
    defaultMessage: 'Invalid token or unauthorized',
  },
  partialSync: {
    id: 'invite.progress.partialSync',
    defaultMessage:
      'Connected, but some archive data could not be synced. Try again.',
  },
  retry: {
    id: 'invite.progress.retry',
    defaultMessage: 'Try Again',
  },
  goHome: {
    id: 'invite.progress.goHome',
    defaultMessage: 'Go to Home',
  },
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FlowStatus =
  'loading' | 'connected' | 'error' | 'expired' | 'invalid' | 'networkError';

type FlowStep = 'verify' | 'connect' | 'sync' | 'prepare';

const ALL_STEP_IDS: FlowStep[] = ['verify', 'connect', 'sync', 'prepare'];

const VALIDATION_TIMEOUT_MS = 10_000;

// Guards the pre-persist validation calls so a stalled server never leaves
// the flow hanging. Mirrors the (non-exported) withValidationTimeout helper
// in sync-coordinator.ts.
async function withValidationTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error('Archive validation timed out')),
      VALIDATION_TIMEOUT_MS,
    );
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Undo every mutation made after invite validation. A new archive is removed;
// an existing archive is restored to the exact connection/lifecycle snapshot
// from before addServer() refreshed its credentials.
async function rollbackPersistedInviteServer(
  serverId: string,
  previousServers: RemoteArchiveServer[],
): Promise<void> {
  const { servers, removeServer, restoreServerToken, updateServer } =
    useAuthStore.getState();
  const persisted = servers.find((server) => server.id === serverId);
  if (!persisted) return;

  const previous = previousServers.find((server) => server.id === serverId);
  if (!previous) {
    await removeServer(serverId);
    return;
  }

  try {
    await updateServer(serverId, {
      status: previous.status,
      onboardingStatus: previous.onboardingStatus,
      errorMessage: previous.errorMessage,
      lastSyncedAt: previous.lastSyncedAt,
      lastSuccessfulSyncAt: previous.lastSuccessfulSyncAt,
    });
  } finally {
    restoreServerToken(serverId, previous.token);
  }
}

interface InitialInviteState {
  invite: ParseInviteResult | null;
  expiresAt: number | null;
  expired: boolean;
}

function parseInviteFromLocationForTests(): ParseInviteResult | null {
  if (!import.meta.env.VITEST || typeof window === 'undefined') return null;
  const origin = window.location.origin;
  const search = window.location.search;
  if (!search) return null;
  return parseInviteUrl(origin + '/invite' + search);
}

function readInitialInviteState(): InitialInviteState {
  const bootstrap = consumeInviteBootstrapCandidate();
  if (bootstrap.kind === 'candidate') {
    return {
      invite: parseInviteUrl(bootstrap.value),
      expiresAt: bootstrap.expiresAt,
      expired: false,
    };
  }
  if (bootstrap.kind === 'expired') {
    return { invite: null, expiresAt: null, expired: true };
  }
  return {
    invite: parseInviteFromLocationForTests(),
    expiresAt: null,
    expired: false,
  };
}

function initialStatus(state: InitialInviteState): FlowStatus {
  if (state.expired) return 'expired';
  if (!state.invite) return 'error';
  return state.invite.ok ? 'loading' : 'invalid';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function getErrorDisplayMessage(
  status: string,
  errorMessage: string,
  intl: IntlShape,
): string {
  if (status === 'expired') {
    return intl.formatMessage(messages.expired);
  }
  if (status === 'invalid') {
    return intl.formatMessage(messages.invalidInvite);
  }
  if (status === 'networkError') {
    return intl.formatMessage(messages.networkError);
  }
  return errorMessage || intl.formatMessage(messages.error);
}

export function InviteScreen() {
  const intl = useIntl();
  const navigate = useNavigate();
  const [initialInviteState] = useState<InitialInviteState>(
    readInitialInviteState,
  );
  const inviteRef = useRef<ParseInviteResult | null>(initialInviteState.invite);
  const inviteExpiresAtRef = useRef<number | null>(
    initialInviteState.expiresAt,
  );
  const resolvedCredentialRef = useRef<{
    baseUrl: string;
    token: string;
  } | null>(null);
  const [transportBaseUrl, setTransportBaseUrl] = useState('');
  const transportApproval = useArchiveTransportApproval(transportBaseUrl);

  const [status, setStatus] = useState<FlowStatus>(() =>
    initialStatus(initialInviteState),
  );
  const [activeStep, setActiveStep] = useState<FlowStep>('verify');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const cancelledRef = useRef(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inviteExpiryTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const intlRef = useRef(intl);
  const effectGenerationRef = useRef(0);

  // Keep intlRef in sync so runFlow (which intentionally omits intl from deps)
  // always uses the latest intl without restarting the flow on locale changes.
  useEffect(() => {
    intlRef.current = intl;
  });

  // Build step objects for ConnectionProgress
  const stepLabels: Record<FlowStep, string> = {
    verify: intl.formatMessage(messages.stepVerify),
    connect: intl.formatMessage(messages.stepConnect),
    sync: intl.formatMessage(messages.stepSync),
    prepare: intl.formatMessage(messages.stepPrepare),
  };

  function buildSteps(
    currentActive: FlowStep,
    currentStatus: FlowStatus,
  ): ConnectionStep[] {
    return ALL_STEP_IDS.map((id) => {
      const idx = ALL_STEP_IDS.indexOf(id);
      const activeIdx = ALL_STEP_IDS.indexOf(currentActive);

      let stepStatus: ConnectionStep['status'];
      if (currentStatus === 'error' || currentStatus === 'networkError') {
        // The step where it failed gets error, previous get completed
        if (idx < activeIdx) stepStatus = 'completed';
        else if (idx === activeIdx) stepStatus = 'error';
        else stepStatus = 'pending';
      } else if (currentStatus === 'expired' || currentStatus === 'invalid') {
        // First step errored
        stepStatus = idx === 0 ? 'error' : 'pending';
      } else if (currentStatus === 'connected') {
        stepStatus = 'completed';
      } else {
        // loading
        if (idx < activeIdx) stepStatus = 'completed';
        else if (idx === activeIdx) stepStatus = 'active';
        else stepStatus = 'pending';
      }

      return { id, label: stepLabels[id]!, status: stepStatus };
    });
  }

  // Run the connection flow
  const runFlow = useCallback(() => {
    const expiresAt = inviteExpiresAtRef.current;
    if (
      !resolvedCredentialRef.current &&
      expiresAt !== null &&
      Date.now() >= expiresAt
    ) {
      inviteRef.current = null;
      inviteExpiresAtRef.current = null;
      setStatus('expired');
      return;
    }

    const invite = inviteRef.current;
    if (!resolvedCredentialRef.current && (!invite || !invite.ok)) return;
    if (cancelledRef.current) return;

    cancelledRef.current = false;
    setStatus('loading');
    setActiveStep('verify');
    setErrorMessage('');

    async function run(): Promise<void> {
      let persistedInvite:
        | { serverId: string; previousServers: RemoteArchiveServer[] }
        | undefined;

      const rollbackPersistedInvite = async () => {
        if (!persistedInvite) return;
        const rollback = persistedInvite;
        persistedInvite = undefined;
        await rollbackPersistedInviteServer(
          rollback.serverId,
          rollback.previousServers,
        );
      };

      try {
        setActiveStep('verify');
        let credential = resolvedCredentialRef.current;

        if (!credential) {
          const currentInvite = inviteRef.current;
          if (!currentInvite || !currentInvite.ok) return;

          if (currentInvite.kind === 'encrypted') {
            const redeemed = await redeemEncryptedInvite(currentInvite.code);
            if (cancelledRef.current) return;
            credential = {
              baseUrl: redeemed.baseUrl,
              token: redeemed.token,
            };
          } else {
            warnLegacyInviteUrlOnce();
            credential = {
              baseUrl: currentInvite.baseUrl,
              token: currentInvite.token,
            };
          }

          resolvedCredentialRef.current = credential;
          inviteRef.current = null;
          inviteExpiresAtRef.current = null;
          if (inviteExpiryTimerRef.current !== undefined) {
            clearTimeout(inviteExpiryTimerRef.current);
            inviteExpiryTimerRef.current = undefined;
          }
        }

        if (cancelledRef.current || !credential) return;
        setTransportBaseUrl(credential.baseUrl);

        const transportResult = await withApprovedArchiveTransport({
          baseUrl: credential.baseUrl,
          confirmInsecure: transportApproval.confirmInsecure,
          operation: async (normalizedUrl) => {
            const token = credential.token;
            setActiveStep('connect');
            const config = {
              baseUrl: normalizedUrl,
              token,
              serverId: null,
            };

            try {
              const healthy = await withValidationTimeout(
                apiClient.healthCheck(config),
              );
              if (cancelledRef.current) return false;
              if (!healthy) {
                setStatus('error');
                setErrorMessage(
                  intlRef.current.formatMessage(messages.networkError),
                );
                return false;
              }
              await withValidationTimeout(apiClient.getProjects(config));
            } catch (error) {
              if (cancelledRef.current) return false;
              const errorStatus =
                error && typeof error === 'object' && 'status' in error
                  ? Number(error.status)
                  : undefined;
              setStatus('error');
              setErrorMessage(
                intlRef.current.formatMessage(
                  errorStatus === 401 || errorStatus === 403
                    ? messages.invalidToken
                    : messages.networkError,
                ),
              );
              return false;
            }

            if (cancelledRef.current) return false;
            const previousServers = useAuthStore
              .getState()
              .servers.map((server) => ({ ...server }));
            const serverId = await useAuthStore.getState().addServer({
              label: new URL(normalizedUrl).hostname,
              baseUrl: normalizedUrl,
              token,
              allowDuplicate: true,
            });
            persistedInvite = { serverId, previousServers };
            if (cancelledRef.current) {
              await rollbackPersistedInvite();
              return false;
            }

            setActiveStep('sync');
            const syncResult = await syncRemoteArchive(
              serverId,
              { baseUrl: normalizedUrl, token },
              { isCancelled: () => cancelledRef.current },
            );
            if (cancelledRef.current) {
              await rollbackPersistedInvite();
              return false;
            }
            if (!syncResult || !syncResult.success) {
              await rollbackPersistedInvite();
              setStatus('error');
              const syncErrorCode =
                syncResult?.status === 'partial'
                  ? 'partial'
                  : syncResult?.errorCode;
              let syncErrorMessage = messages.error;
              if (syncErrorCode === 'authorization') {
                syncErrorMessage = messages.invalidToken;
              } else if (syncErrorCode === 'connection') {
                syncErrorMessage = messages.networkError;
              } else if (syncErrorCode === 'partial') {
                syncErrorMessage = messages.partialSync;
              }
              setErrorMessage(intlRef.current.formatMessage(syncErrorMessage));
              return false;
            }

            persistedInvite = undefined;
            resolvedCredentialRef.current = null;
            setActiveStep('prepare');
            if (cancelledRef.current) return false;
            setStatus('connected');
            redirectTimerRef.current = setTimeout(() => {
              if (!cancelledRef.current) navigate({ to: '/' });
            }, 1500);
            return true;
          },
        });

        if (
          transportResult.kind === 'cancelled' ||
          transportResult.kind === 'stale-approval'
        ) {
          setStatus('error');
          setErrorMessage(intlRef.current.formatMessage(messages.error));
        } else if (transportResult.kind === 'invalid-url') {
          setStatus('invalid');
        } else if (transportResult.kind === 'startup-blocked') {
          setStatus('error');
          setErrorMessage(intlRef.current.formatMessage(messages.error));
        }
      } catch (err) {
        await rollbackPersistedInvite();
        if (cancelledRef.current) return;
        if (err instanceof InviteApiError) {
          if (err.code === 'INVITE_EXPIRED') {
            inviteRef.current = null;
            inviteExpiresAtRef.current = null;
            setStatus('expired');
          } else if (err.status !== undefined && err.status >= 500) {
            setStatus('error');
            setErrorMessage(intlRef.current.formatMessage(messages.error));
          } else {
            setStatus('invalid');
          }
          return;
        }
        const isNetworkError =
          err instanceof TypeError &&
          (err.message === 'Failed to fetch' ||
            err.message === 'Load failed' ||
            err.message === 'Network request failed');
        if (isNetworkError) {
          setStatus('networkError');
          setErrorMessage(intlRef.current.formatMessage(messages.networkError));
          return;
        }
        setStatus('error');
        setErrorMessage(intlRef.current.formatMessage(messages.error));
      }
    }

    void run();
  }, [navigate, transportApproval.confirmInsecure]);

  useEffect(() => {
    const expiresAt = inviteExpiresAtRef.current;
    if (expiresAt === null || !inviteRef.current) return;

    const expire = () => {
      inviteRef.current = null;
      inviteExpiresAtRef.current = null;
      inviteExpiryTimerRef.current = undefined;
      setStatus('expired');
    };
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      queueMicrotask(expire);
      return;
    }

    inviteExpiryTimerRef.current = setTimeout(expire, remaining);
    return () => {
      if (inviteExpiryTimerRef.current !== undefined) {
        clearTimeout(inviteExpiryTimerRef.current);
        inviteExpiryTimerRef.current = undefined;
      }
    };
  }, []);

  useEffect(() => {
    // Reset the cancellation flag so the \"Try Again\" button (which calls
    // runFlow directly, bypassing this effect) can restart a failed flow.
    cancelledRef.current = false;

    // Monotonically incrementing generation counter prevents React
    // StrictMode double-invoke from executing the flow twice.  In
    // StrictMode the cleanup runs between the two effect invocations and
    // bumps the counter, invalidating the first invocation's microtask.
    // Only the second ("real") invocation's microtask survives the check.
    const generation = ++effectGenerationRef.current;

    // Defer via microtask to avoid synchronous setState in effect body
    // (required by react-hooks/set-state-in-effect; React 18+ batches the updates).
    queueMicrotask(() => {
      if (generation !== effectGenerationRef.current) return;
      runFlow();
    });

    return () => {
      // Bump the generation so any microtask still pending from a previous
      // invocation is silently dropped. React StrictMode replays effects in
      // development as setup -> cleanup -> setup while preserving component
      // refs. The cleanup therefore must cancel work immediately but must not
      // synchronously destroy the one-shot invite before the replayed setup can
      // run. Defer destructive cleanup by one microtask and let the replayed
      // setup invalidate it by advancing the generation again.
      const cleanupGeneration = ++effectGenerationRef.current;
      cancelledRef.current = true;
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = undefined;
      }
      queueMicrotask(() => {
        // Staleness is deliberate: a replayed setup advances this ref and must
        // cancel the destructive cleanup queued by StrictMode's synthetic pass.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        if (cleanupGeneration !== effectGenerationRef.current) return;
        inviteRef.current = null;
        inviteExpiresAtRef.current = null;
        resolvedCredentialRef.current = null;
        clearInviteBootstrapCandidate();
      });
    };
  }, [runFlow]);

  // -----------------------------------------------------------------------
  // Render: Error states
  // -----------------------------------------------------------------------

  if (
    status === 'expired' ||
    status === 'invalid' ||
    status === 'error' ||
    status === 'networkError'
  ) {
    const displayMessage = getErrorDisplayMessage(status, errorMessage, intl);

    return (
      <div className="flex h-screen flex-col items-center justify-center gap-6 bg-surface px-4">
        <div className="flex flex-col items-center gap-4 text-center">
          {/* Error icon */}
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            fill="none"
            aria-hidden="true"
            className="text-error"
          >
            <circle cx="24" cy="24" r="24" className="fill-error/10" />
            <path
              d="M16 16l16 16M32 16L16 32"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <p className="max-w-xs text-center text-base text-text">
            {displayMessage}
          </p>
          {status !== 'invalid' && (
            <ConnectionProgress
              steps={buildSteps(
                status === 'expired' ? 'verify' : activeStep,
                status,
              )}
              heading={intl.formatMessage(messages.heading)}
            />
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-3">
          {status !== 'invalid' && (
            <Button variant="primary" onClick={runFlow}>
              {intl.formatMessage(messages.retry)}
            </Button>
          )}
          <Link to="/" className="text-sm text-muted underline hover:text-text">
            {intl.formatMessage(messages.goHome)}
          </Link>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: Connected
  // -----------------------------------------------------------------------

  if (status === 'connected') {
    return (
      <div className="flex h-screen items-center justify-center bg-surface">
        <ConnectionProgress
          steps={buildSteps('prepare', 'connected')}
          isComplete
        />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: Loading (default)
  // -----------------------------------------------------------------------

  return (
    <>
      <div className="flex h-screen items-center justify-center bg-surface">
        <ConnectionProgress
          steps={buildSteps(activeStep, 'loading')}
          heading={intl.formatMessage(messages.heading)}
        />
      </div>
      <InsecureArchiveTransportDialog controller={transportApproval} />
    </>
  );
}
