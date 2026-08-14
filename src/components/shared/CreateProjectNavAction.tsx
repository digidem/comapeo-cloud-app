import { defineMessages, useIntl } from 'react-intl';

const messages = defineMessages({
  label: {
    id: 'common.createProject',
    defaultMessage: 'Create Project',
  },
});

interface CreateProjectNavActionProps {
  onClick: () => void;
}

function CreateProjectNavAction({ onClick }: CreateProjectNavActionProps) {
  const intl = useIntl();

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-2 rounded-btn px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-surface hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
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
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      {intl.formatMessage(messages.label)}
    </button>
  );
}

export { CreateProjectNavAction };
export type { CreateProjectNavActionProps };
