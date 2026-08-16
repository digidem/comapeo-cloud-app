import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IntlShape, defineMessages, useIntl } from 'react-intl';

import { Link, useNavigate } from '@tanstack/react-router';

import {
  ConnectionProgress,
  type ConnectionStep,
} from '@/components/shared/ConnectionProgress';
import { Button } from '@/components/ui/button';
import {
  InviteApiError,
  apiClient,
  redeemEncryptedInvite,
} from '@/lib/api-client';
import { normalizeArchiveBaseUrl } from '@/lib/archive-proxy';
import { syncRemoteArchive } from '@/lib/data-layer';
import {
  type ParseInviteResult,
  parseInviteUrl,
  warnLegacyInviteUrlOnce,
} from '@/lib/invite-url';
import { getRemoteServers } from '@/lib/local-repositories';
import type { InviteAccessScope } from '@/lib/schemas/invite';
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
  const { servers, removeServer, updateServer } = useAuthStore.getState();
  const persisted = servers.find((server) => server.id === serverId);
  if (!persisted) return;

  const previous = previousServers.find((server) => server.id === serverId);
  if (!previous) {
    await removeServer(serverId);
    return;
  }

  const updates: Partial<Omit<RemoteArchiveServer, 'id'>> = {
    accessScope: previous.accessScope,
    token: previous.token,
    status: previous.status,
    onboardingStatus: previous.onboardingStatus,
    errorMessage: previous.errorMessage,
    lastSyncedAt: previous.lastSyncedAt,
    lastSuccessfulSyncAt: previous.lastSuccessfulSyncAt,
  };

  await updateServer(serverId, {
    ...updates,
  });
}

function normalizeInviteAccessScope(
  accessScope?: InviteAccessScope,
): InviteAccessScope {
  return accessScope ?? { type: 'archive' };
}

function normalizeForIdentity(baseUrl: string): string {
  const normalized = normalizeArchiveBaseUrl(baseUrl);
  return normalized.ok ? normalized.value : baseUrl.trim().replace(/\/+$/, '');
}

function isArchiveScope(accessScope?: InviteAccessScope): boolean {
  return normalizeInviteAccessScope(accessScope).type === 'archive';
}

function isArchiveWideServerForBaseUrl(
  server: { baseUrl: string; accessScope?: InviteAccessScope },
  normalizedBaseUrl: string,
): boolean {
  return (
    normalizeForIdentity(server.baseUrl) === normalizedBaseUrl &&
    isArchiveScope(server.accessScope)
  );
}

async function hasArchiveWideServerForBaseUrl(
  baseUrl: string,
): Promise<boolean> {
  const normalized = normalizeForIdentity(baseUrl);
  if (
    useAuthStore
      .getState()
      .servers.some((server) =>
        isArchiveWideServerForBaseUrl(server, normalized),
      )
  ) {
    return true;
  }

  try {
    const persistedServers = await getRemoteServers();
    return persistedServers.some((server) =>
      isArchiveWideServerForBaseUrl(server, normalized),
    );
  } catch {
    return false;
  }
}

function parseInviteFromLocation(): ParseInviteResult | null {
  if (typeof window === 'undefined') return null;
  const origin = window.location.origin;
  const search = window.location.search;
  const candidate = `${origin}/invite${search}`;
  return parseInviteUrl(candidate);
}

function initialStatus(invite: ParseInviteResult | null): FlowStatus {
  if (!invite) return 'error';
  return invite.ok ? 'loading' : 'invalid';
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
  const invite = useMemo(() => parseInviteFromLocation(), []);

  const [status, setStatus] = useState<FlowStatus>(() => initialStatus(invite));
  const [activeStep, setActiveStep] = useState<FlowStep>('verify');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const cancelledRef = useRef(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
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
    if (!invite || !invite.ok) return;

    // If the component unmounted between queueMicrotask scheduling and
    // execution, bail out immediately — don't reset the cancellation flag.
    if (cancelledRef.current) return;

    // Capture the narrowed type so the closure can access it without `!`
    const validInvite = invite;

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
        // Step 1: Verify / redeem invite
        setActiveStep('verify');
        let baseUrl: string;
        let token: string;
        let accessScope: InviteAccessScope;

        if (validInvite.kind === 'encrypted') {
          const redeemed = await redeemEncryptedInvite(validInvite.code);
          if (cancelledRef.current) return;
          baseUrl = redeemed.baseUrl;
          token = redeemed.token;
          accessScope = normalizeInviteAccessScope(redeemed.accessScope);
        } else {
          // TODO(issue-#8): remove this legacy branch in the next release.
          warnLegacyInviteUrlOnce();
          baseUrl = validInvite.baseUrl;
          token = validInvite.token;
          accessScope = { type: 'archive' };
        }
        if (cancelledRef.current) return;

        if (accessScope.type === 'project') {
          const hasArchiveWideServer =
            await hasArchiveWideServerForBaseUrl(baseUrl);
          if (cancelledRef.current) return;
          if (hasArchiveWideServer) {
            setActiveStep('prepare');
            setStatus('connected');
            redirectTimerRef.current = setTimeout(() => {
              if (!cancelledRef.current) navigate({ to: '/' });
            }, 1500);
            return;
          }
        }

        // Step 2: Validate server + credentials BEFORE persisting anything.
        // An invalid or malicious invite must never overwrite an existing
        // working connection (issue #182): addServer() below persists the
        // token, so it only runs once the server has proven reachable and the
        // token authorized.
        setActiveStep('connect');
        const config = { baseUrl, token };
        try {
          const healthy = await withValidationTimeout(
            apiClient.healthCheck(config),
          );
          if (cancelledRef.current) return;
          if (!healthy) {
            setStatus('error');
            setErrorMessage(
              intlRef.current.formatMessage(messages.networkError),
            );
            return;
          }

          await withValidationTimeout(apiClient.getProjects(config));
        } catch (error) {
          if (cancelledRef.current) return;
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
          return;
        }
        if (cancelledRef.current) return;

        // Step 3: Add server (validation passed)
        const previousServers = useAuthStore
          .getState()
          .servers.map((server) => ({ ...server }));
        const serverId = await useAuthStore.getState().addServer({
          label: new URL(baseUrl).hostname,
          baseUrl,
          token,
          accessScope,
          allowDuplicate: true,
        });
        persistedInvite = { serverId, previousServers };
        if (cancelledRef.current) {
          await rollbackPersistedInvite();
          return;
        }

        // Step 4: Sync — pass the cancellation control so unmount aborts it
        setActiveStep('sync');
        const syncResult = await syncRemoteArchive(
          serverId,
          { baseUrl, token, accessScope },
          {
            isCancelled: () => cancelledRef.current,
            deferScopedConsolidation: accessScope.type === 'archive',
          },
        );
        if (cancelledRef.current) {
          await rollbackPersistedInvite();
          return;
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
          return;
        }

        // A ready sync is the commit point. Until here, cancellation can restore
        // the exact prior credential set because scoped-server consolidation was
        // deliberately deferred above.
        persistedInvite = undefined;
        setActiveStep('prepare');
        if (accessScope.type === 'archive') {
          try {
            await useAuthStore
              .getState()
              .consolidateScopedServersForArchive(serverId);
          } catch (error) {
            console.warn(
              'Archive connected but scoped credential cleanup failed',
              error,
            );
          }
        }
        if (cancelledRef.current) return;

        setStatus('connected');
        redirectTimerRef.current = setTimeout(() => {
          if (!cancelledRef.current) navigate({ to: '/' });
        }, 1500);
      } catch (err) {
        await rollbackPersistedInvite();
        if (cancelledRef.current) return;
        if (err instanceof InviteApiError) {
          if (err.code === 'INVITE_EXPIRED') {
            setStatus('expired');
          } else {
            setStatus('invalid');
          }
          return;
        }
        // Check for network errors (includes Safari-specific messages)
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
  }, [invite, navigate]);

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
      // Bump the generation so any microtask still pending from a
      // previous invocation is silently dropped. Deliberate write to a
      // stable generation counter; staleness is the point, not a hazard.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      effectGenerationRef.current++;
      // Signal in-flight async work (inside run()) that the component
      // is unmounting so it can short-circuit early.
      cancelledRef.current = true;
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
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
    <div className="flex h-screen items-center justify-center bg-surface">
      <ConnectionProgress
        steps={buildSteps(activeStep, 'loading')}
        heading={intl.formatMessage(messages.heading)}
      />
    </div>
  );
}
