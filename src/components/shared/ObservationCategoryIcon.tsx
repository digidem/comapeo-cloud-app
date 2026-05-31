import { defineMessages, useIntl } from 'react-intl';

import { AuthImg } from '@/components/shared/auth-img';
import type { ObservationCategory } from '@/lib/category-utils';

const messages = defineMessages({
  iconAlt: {
    id: 'observationCategoryIcon.alt',
    defaultMessage: '{category} icon',
  },
});

interface ObservationCategoryIconProps {
  category: Pick<
    ObservationCategory,
    'id' | 'name' | 'color' | 'iconDocId' | 'iconUrl'
  >;
  className?: string;
}

export function ObservationCategoryIcon({
  category,
  className = 'h-8 w-8',
}: ObservationCategoryIconProps) {
  const intl = useIntl();

  const baseClassName = `relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary ${className}`;
  const fallbackLetter = category.name.trim().slice(0, 1).toUpperCase() || '?';
  const fallback = (
    <span
      data-testid="category-icon-fallback"
      className="text-[0.65rem] font-semibold leading-none"
      aria-hidden="true"
    >
      {fallbackLetter}
    </span>
  );

  if (category.iconUrl) {
    return (
      <div
        className={baseClassName}
        data-testid="category-icon"
        style={{
          backgroundColor: category.color ?? undefined,
          color: category.color ? '#fff' : undefined,
        }}
      >
        {fallback}
        <AuthImg
          src={category.iconUrl}
          alt={intl.formatMessage(messages.iconAlt, {
            category: category.name,
          })}
          className="absolute inset-0 h-full w-full object-contain p-1"
        />
      </div>
    );
  }

  return (
    <div
      className={baseClassName}
      style={{
        backgroundColor: category.color ?? undefined,
        color: category.color ? '#fff' : undefined,
      }}
      aria-label={category.name}
      role="img"
    >
      {fallback}
    </div>
  );
}
