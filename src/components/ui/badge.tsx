import { type ReactNode } from 'react';
import { defineMessages, useIntl } from 'react-intl';

const messages = defineMessages({
  severityHigh: {
    id: 'alertCard.severityHigh',
    defaultMessage: 'High',
  },
  severityMedium: {
    id: 'alertCard.severityMedium',
    defaultMessage: 'Medium',
  },
  severityLow: {
    id: 'alertCard.severityLow',
    defaultMessage: 'Low',
  },
  severityUnknown: {
    id: 'alertCard.severityUnknown',
    defaultMessage: 'Unknown',
  },
});

export type BadgeVariant = 'high' | 'medium' | 'low' | 'info' | 'neutral';

const variantStyles: Record<BadgeVariant, string> = {
  high: 'bg-red-100 text-red-800 border-red-200',
  medium: 'bg-amber-100 text-amber-800 border-amber-200',
  low: 'bg-blue-100 text-blue-800 border-blue-200',
  info: 'bg-slate-100 text-slate-700 border-slate-200',
  neutral: 'bg-gray-100 text-gray-600 border-gray-200',
};

export function severityToVariant(severity: string | undefined): BadgeVariant {
  switch (severity?.toLowerCase()) {
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
      return 'low';
    default:
      return 'info';
  }
}

export function severityToLabel(
  severity: string | undefined,
  intl: ReturnType<typeof useIntl>,
): string {
  switch (severity?.toLowerCase()) {
    case 'high':
      return intl.formatMessage(messages.severityHigh);
    case 'medium':
      return intl.formatMessage(messages.severityMedium);
    case 'low':
      return intl.formatMessage(messages.severityLow);
    default:
      return intl.formatMessage(messages.severityUnknown);
  }
}

export interface BadgeProps {
  variant: BadgeVariant;
  children: ReactNode;
  className?: string;
}

export function Badge({ variant, children, className = '' }: BadgeProps) {
  const base =
    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border';
  const style = variantStyles[variant] ?? variantStyles.info;

  return (
    <span data-variant={variant} className={`${base} ${style} ${className}`}>
      {children}
    </span>
  );
}
