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

  const fallbackLetter = category.name.trim().slice(0, 1).toUpperCase() || '?';

  // When an icon image is available, render it on a white circle with a
  // colored border so the icon remains legible regardless of the category
  // color. The letter fallback is hidden behind the image via z-index.
  if (category.iconUrl) {
    return (
      <div
        className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ${className}`}
        data-testid="category-icon"
        style={{
          border: category.color
            ? `2px solid ${category.color}`
            : '2px solid var(--color-primary, #1F6FFF)',
        }}
      >
        <span
          data-testid="category-icon-fallback"
          className="text-[0.65rem] font-semibold leading-none"
          style={{ color: category.color ?? undefined }}
          aria-hidden="true"
        >
          {fallbackLetter}
        </span>
        <AuthImg
          src={category.iconUrl}
          alt={intl.formatMessage(messages.iconAlt, {
            category: category.name,
          })}
          className="absolute inset-0 z-10 h-full w-full object-contain p-1"
          cache
        />
      </div>
    );
  }

  // No icon image: colored circle with white background + colored border +
  // colored letter — matches the "white bg, color as border" spec from PR 65
  // design review.
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ${className}`}
      data-testid="category-icon-fallback-only"
      style={{
        border: category.color
          ? `2px solid ${category.color}`
          : '2px solid var(--color-primary, #1F6FFF)',
        color: category.color ?? undefined,
      }}
      aria-label={category.name}
      role="img"
    >
      <span className="text-[0.65rem] font-semibold leading-none">
        {fallbackLetter}
      </span>
    </div>
  );
}
