import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IntlShape, defineMessages, useIntl } from 'react-intl';

import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';

import {
  ConnectionProgress,
  type ConnectionStep,
} from '@/components/shared/ConnectionProgress';
import { Button } from '@/components/ui/button';
import { InviteApiError, redeemEncryptedInvite } from '@/lib/api-client';
import { syncRemoteArchive } from '@/lib/data-layer';
import {
  type ParseInviteResult,
  parseInviteUrl,
  warnLegacyInviteUrlOnce,
} from '@/lib/invite-url';
import { DuplicateServerError, useAuthStore } from '@/stores/auth-store';

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
  alreadyConnected: {
    id: 'invite.alreadyConnected',
    defaultMessage: 'This archive server is already connected',
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
  | 'loading'
  | 'connected'
  | 'error'
  | 'expired'
  | 'invalid'
  | 'networkError';

type FlowStep = 'verify' | 'connect' | 'sync' | 'prepare';

const ALL_STEP_IDS: FlowStep[] = ['verify', 'connect', 'sync', 'prepare'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  const queryClient = useQueryClient();
  const invite = useMemo(() => parseInviteFromLocation(), []);

  const [status, setStatus] = useState<FlowStatus>(() => initialStatus(invite));
  const [activeStep, setActiveStep] = useState<FlowStep>('verify');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const cancelledRef = useRef(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const intlRef = useRef(intl);

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
      try {
        // Step 1: Verify / redeem invite
        setActiveStep('verify');
        let baseUrl: string;
        let token: string;

        if (validInvite.kind === 'encrypted') {
          const redeemed = await redeemEncryptedInvite(validInvite.code);
          if (cancelledRef.current) return;
          baseUrl = redeemed.baseUrl;
          token = redeemed.token;
        } else {
          // TODO(issue-#8): remove this legacy branch in the next release.
          warnLegacyInviteUrlOnce();
          baseUrl = validInvite.baseUrl;
          token = validInvite.token;
        }
        if (cancelledRef.current) return;

        // Step 2: Add server
        setActiveStep('connect');
        const serverId = await useAuthStore.getState().addServer({
          label: new URL(baseUrl).hostname,
          baseUrl,
          token,
        });
        if (cancelledRef.current) return;

        // Step 3: Sync
        setActiveStep('sync');
        const syncResult = await syncRemoteArchive(serverId, {
          baseUrl,
          token,
        });
        if (cancelledRef.current) return;
        if (!syncResult || !syncResult.success) {
          setStatus('error');
          setErrorMessage(intlRef.current.formatMessage(messages.error));
          return;
        }

        // Step 4: Prepare dashboard
        setActiveStep('prepare');
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['projects'] }),
          queryClient.invalidateQueries({ queryKey: ['observations'] }),
          queryClient.invalidateQueries({ queryKey: ['alerts'] }),
        ]);
        if (cancelledRef.current) return;

        setStatus('connected');
        redirectTimerRef.current = setTimeout(() => {
          if (!cancelledRef.current) navigate({ to: '/' });
        }, 1500);
      } catch (err) {
        if (cancelledRef.current) return;
        if (err instanceof DuplicateServerError) {
          setStatus('error');
          setErrorMessage(
            intlRef.current.formatMessage(messages.alreadyConnected),
          );
          return;
        }
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
  }, [invite, navigate, queryClient]);

  useEffect(() => {
    // Defer via microtask to avoid synchronous setState in effect body
    // (required by react-hooks/set-state-in-effect; React 18+ batches the updates).
    queueMicrotask(runFlow);
    return () => {
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
