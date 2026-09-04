import { useRef } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { useNavigate } from '@tanstack/react-router';

import { useToast } from '@/components/ui/toast';
import type { ToastData } from '@/components/ui/toast';
import { useSyncAll } from '@/hooks/useSyncAll';
import type { SyncAllServerResult, SyncAllSummary } from '@/hooks/useSyncAll';
import { commonMessages } from '@/i18n/common-messages';
import { selectSyncableServers, useAuthStore } from '@/stores/auth-store';

const messages = defineMessages({
  label: {
    id: 'syncAll.button.label',
    defaultMessage: 'Sync all',
  },
  ariaLabel: {
    id: 'syncAll.button.ariaLabel',
    defaultMessage: 'Sync all archives now',
  },
  syncing: {
    id: 'syncAll.button.syncing',
    defaultMessage: 'Syncing…',
  },
  successTitle: {
    id: 'syncAll.toast.successTitle',
    defaultMessage: 'All archives synced',
  },
  partialTitle: {
    id: 'syncAll.toast.partialTitle',
    defaultMessage: 'Some data synced',
  },
  partialDescription: {
    id: 'syncAll.toast.partialDescription',
    defaultMessage:
      '{synced} of {total} archives synced. Some resources failed — try again.',
  },
  errorTitle: {
    id: 'syncAll.toast.errorTitle',
    defaultMessage: 'Sync failed',
  },
  errorDescription: {
    id: 'syncAll.toast.errorDescription',
    defaultMessage:
      '{synced} of {total} archives synced. Check the archives listed in Home.',
  },
  storageCleanupTitle: {
    id: 'syncAll.toast.storageCleanupTitle',
    defaultMessage: 'Sync paused: storage cleanup needed',
  },
  workerTransitionTitle: {
    id: 'syncAll.toast.workerTransitionTitle',
    defaultMessage: 'Sync paused: app update in progress',
  },
});

type ToastDraft = Omit<ToastData, 'id'>;

type AggregateTier =
  | 'authError'
  | 'error'
  | 'storageCleanup'
  | 'workerTransition'
  | 'partial'
  | 'success';

// Worst-first. Lifecycle info outcomes outrank the generic error fallback:
// a coded failure maps to its own tier, and the generic tier only absorbs
// failures no code claims ("success: false otherwise" in the outcome table).
const TIER_RANK: Record<AggregateTier, number> = {
  authError: 0,
  error: 1,
  storageCleanup: 2,
  workerTransition: 3,
  partial: 4,
  success: 5,
};

/**
 * Tier of a single per-server result. Coded and status tiers come first —
 * keying them on `!success` would swallow the partial tier — and the
 * `!success` fallback only absorbs ready-flagged results that the server
 * reports as not fully synced ("success: false otherwise").
 */
function resultTier(result: SyncAllServerResult): AggregateTier {
  switch (result.errorCode) {
    case 'authorization':
    case 'credentials-required':
      return 'authError';
    case 'storage-cleanup-required':
      return 'storageCleanup';
    case 'worker-transition-required':
      return 'workerTransition';
    case 'partial':
      return 'partial';
    case 'connection':
      return 'error';
    default:
      break;
  }
  if (result.status === 'error') return 'error';
  if (result.status === 'partial') return 'partial';
  if (!result.success) return 'error';
  return 'success';
}

/** Worst outcome present across a run's per-server results. */
function aggregateTier(results: SyncAllServerResult[]): AggregateTier {
  return results.reduce<AggregateTier>((worst, result) => {
    const tier = resultTier(result);
    return TIER_RANK[tier] < TIER_RANK[worst] ? tier : worst;
  }, 'success');
}

function aggregateToast({
  summary,
  intl,
  openSettingsAction,
}: {
  summary: SyncAllSummary;
  intl: ReturnType<typeof useIntl>;
  openSettingsAction: { label: string; onClick: () => void };
}): ToastDraft {
  const synced = summary.results.filter(
    (result) => result.success && result.status === 'ready',
  ).length;
  const counts = { synced, total: summary.total };

  switch (aggregateTier(summary.results)) {
    case 'authError':
    case 'error':
      return {
        variant: 'error',
        title: intl.formatMessage(messages.errorTitle),
        description: intl.formatMessage(messages.errorDescription, counts),
      };
    case 'storageCleanup':
      return {
        variant: 'info',
        title: intl.formatMessage(messages.storageCleanupTitle),
        description: intl.formatMessage(messages.errorDescription, counts),
        action: openSettingsAction,
      };
    case 'workerTransition':
      return {
        variant: 'info',
        title: intl.formatMessage(messages.workerTransitionTitle),
        description: intl.formatMessage(messages.errorDescription, counts),
      };
    case 'partial':
      return {
        variant: 'info',
        title: intl.formatMessage(messages.partialTitle),
        description: intl.formatMessage(messages.partialDescription, counts),
      };
    default:
      return {
        variant: 'success',
        title: intl.formatMessage(messages.successTitle),
      };
  }
}

/**
 * Global manual trigger for syncing every eligible archive at once. Exactly
 * one instance is mounted (the authenticated layout renders it into the
 * topbar) so the disabled guard and the single aggregate toast describe one
 * user intent.
 */
export function SyncAllButton() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { sync, isSyncing } = useSyncAll();
  const eligibleCount = useAuthStore(
    (state) => selectSyncableServers(state).length,
  );
  const inFlightRef = useRef(false);

  async function handleSyncAll() {
    // `isSyncing` is state and can lag a same-tick second click, so the ref
    // carries the synchronous guard. Both resolve to a no-op.
    if (isSyncing || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const summary = await sync();
      // Re-entry and zero-eligible runs resolve empty — nothing to report.
      if (summary.total === 0) return;
      addToast(
        aggregateToast({
          summary,
          intl,
          openSettingsAction: {
            label: intl.formatMessage(commonMessages.openSettingsAction),
            onClick: () => navigate({ to: '/settings' }),
          },
        }),
      );
    } finally {
      inFlightRef.current = false;
    }
  }

  return (
    <button
      type="button"
      onClick={() => {
        void handleSyncAll();
      }}
      disabled={isSyncing || eligibleCount === 0}
      aria-busy={isSyncing}
      aria-label={intl.formatMessage(messages.ariaLabel)}
      className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-btn px-2.5 text-sm font-medium text-text-muted transition-colors hover:bg-surface hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
    >
      {isSyncing ? (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="shrink-0 animate-spin"
        >
          <path d="M21 12a9 9 0 1 1-6.22-8.56" />
        </svg>
      ) : (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="shrink-0"
        >
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
          <path d="M16 16h5v5" />
        </svg>
      )}
      <span className="hidden sm:inline">
        {intl.formatMessage(isSyncing ? messages.syncing : messages.label)}
      </span>
    </button>
  );
}
