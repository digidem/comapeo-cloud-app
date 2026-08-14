import type { ReactNode } from 'react';

interface CreateProjectNavActionProps {
  children: ReactNode;
  onClick: () => void;
}

function CreateProjectNavAction({
  children,
  onClick,
}: CreateProjectNavActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-btn px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-surface hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
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
      {children}
    </button>
  );
}

export { CreateProjectNavAction };
