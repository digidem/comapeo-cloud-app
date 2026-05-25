import { defineMessages, useIntl } from 'react-intl';

import { Spinner } from '@/components/ui/spinner';

function getStepVariant(isActive: boolean, isError: boolean): string {
  if (isActive) return 'bg-primary/5 text-primary font-medium';
  if (isError) return 'text-error';
  return 'text-text';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StepStatus = 'pending' | 'active' | 'completed' | 'error';

interface ConnectionStep {
  id: string;
  label: string;
  status: StepStatus;
}

interface ConnectionProgressProps {
  steps: ConnectionStep[];
  heading?: string;
  /** When true, shows "Connected!" success state with checkmark animation */
  isComplete?: boolean;
}

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

const messages = defineMessages({
  connected: {
    id: 'invite.progress.connected',
    defaultMessage: 'Connected!',
  },
  redirecting: {
    id: 'invite.progress.redirecting',
    defaultMessage: 'Redirecting...',
  },
});

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StepIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case 'completed':
      return (
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <circle cx="10" cy="10" r="10" className="fill-green-500" />
          <path
            d="M6 10l3 3 5-5"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="draw-checkmark"
          />
        </svg>
      );
    case 'active':
      return <Spinner size={20} />;
    case 'error':
      return (
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          className="text-error"
        >
          <circle cx="10" cy="10" r="10" className="fill-error/20" />
          <path
            d="M7 7l6 6M13 7l-6 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'pending':
    default:
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-border text-xs text-muted" />
      );
  }
}

function SuccessState() {
  const intl = useIntl();
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <svg
        width="64"
        height="64"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="32" cy="32" r="32" className="fill-green-500" />
        <path
          d="M18 32l10 10 18-18"
          stroke="white"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="draw-checkmark-large"
        />
      </svg>
      <h2 className="text-2xl font-bold text-text">
        {intl.formatMessage(messages.connected)}
      </h2>
      <p className="text-muted">{intl.formatMessage(messages.redirecting)}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function ConnectionProgress({
  steps,
  heading,
  isComplete = false,
}: ConnectionProgressProps) {
  if (isComplete) {
    return <SuccessState />;
  }

  return (
    <div className="flex flex-col items-center gap-6 px-4">
      {heading && (
        <div className="flex items-center gap-3">
          <Spinner size={24} />
          <h2 className="text-xl font-semibold text-text">{heading}</h2>
        </div>
      )}

      <ol className="flex w-full max-w-sm flex-col gap-3" role="list">
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isPending = step.status === 'pending';
          const isActive = step.status === 'active';
          const isError = step.status === 'error';

          return (
            <li
              key={step.id}
              role="listitem"
              className={`flex items-center gap-3 rounded-lg p-2 transition-colors ${getStepVariant(
                isActive,
                isError,
              )} ${isPending ? 'opacity-50' : ''}`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center text-xs font-semibold">
                {isPending ? stepNumber : <StepIcon status={step.status} />}
              </span>
              <span
                className={`text-sm ${isActive ? 'font-semibold' : ''} ${isPending ? 'opacity-50' : ''}`}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export { ConnectionProgress };
export type { ConnectionProgressProps, ConnectionStep, StepStatus };
