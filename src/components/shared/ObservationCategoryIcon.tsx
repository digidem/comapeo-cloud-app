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

  const baseClassName = `shrink-0 overflow-hidden rounded-full bg-surface-container-low ${className}`;
  if (category.iconUrl) {
    return (
      <div className={baseClassName} data-testid="category-icon">
        <AuthImg
          src={category.iconUrl}
          alt={intl.formatMessage(messages.iconAlt, {
            category: category.name,
          })}
          className="h-full w-full object-contain p-1"
        />
      </div>
    );
  }

  return (
    <div
      data-testid="category-icon-fallback"
      className={baseClassName}
      style={{ backgroundColor: category.color ?? undefined }}
      aria-hidden="true"
    />
  );
}
