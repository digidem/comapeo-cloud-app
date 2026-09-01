import { defineMessages, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { readSecurityStartupState } from '@/lib/security-startup-gate';

const messages = defineMessages({
  cleanupTitle: {
    id: 'security.startup.cleanup.title',
    defaultMessage: 'Browser security cleanup must finish',
  },
  cleanupDescription: {
    id: 'security.startup.cleanup.description',
    defaultMessage:
      'Local data remains available, but archive credentials stay locked until cleanup succeeds. Retry to run the secure startup check again.',
  },
  workerTitle: {
    id: 'security.startup.worker.title',
    defaultMessage: 'Security update required — connect and retry',
  },
  workerDescription: {
    id: 'security.startup.worker.description',
    defaultMessage:
      'Local data remains available while CoMapeo installs and verifies the security-fixed service worker. Archive credentials stay locked until the update completes.',
  },
  inviteRecovery: {
    id: 'security.startup.inviteRecovery',
    defaultMessage:
      'If you opened CoMapeo from an invitation, return to the original message, app, or source containing the invitation link and open it again after this succeeds. Request a fresh invitation if you no longer have it or it has expired.',
  },
  retry: {
    id: 'security.startup.retry',
    defaultMessage: 'Retry',
  },
});

interface SecurityStartupNoticeProps {
  onRetry?: () => void;
}

function SecurityStartupNotice({ onRetry }: SecurityStartupNoticeProps) {
  const intl = useIntl();
  const state = readSecurityStartupState();

  if (state === 'ready') return null;

  const isWorkerTransition = state === 'worker-transition-required';
  const retry = onRetry ?? (() => window.location.reload());

  return (
    <section
      role="status"
      className="border-b border-warning/30 bg-warning/5 px-4 py-3 text-sm text-text"
    >
      <div className="mx-auto flex max-w-screen-xl flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="font-semibold text-warning">
            {intl.formatMessage(
              isWorkerTransition ? messages.workerTitle : messages.cleanupTitle,
            )}
          </p>
          <p>
            {intl.formatMessage(
              isWorkerTransition
                ? messages.workerDescription
                : messages.cleanupDescription,
            )}
          </p>
          <p className="text-text-muted">
            {intl.formatMessage(messages.inviteRecovery)}
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={retry}>
          {intl.formatMessage(messages.retry)}
        </Button>
      </div>
    </section>
  );
}

export { SecurityStartupNotice };
export type { SecurityStartupNoticeProps };
