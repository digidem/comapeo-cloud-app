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
  size?: number; // circle diameter in pixels (default 32)
  iconSize?: number; // image diameter in pixels (default size * 0.7)
  className?: string;
}

export function ObservationCategoryIcon({
  category,
  size = 32,
  iconSize = size * 0.7,
  className,
}: ObservationCategoryIconProps) {
  const intl = useIntl();

  const fallbackLetter = category.name.trim().slice(0, 1).toUpperCase() || '?';

  const circleStyle = {
    width: size,
    height: size,
    border: category.color
      ? `2px solid ${category.color}`
      : '2px solid var(--color-primary, #1F6FFF)',
  };

  // When an icon image is available, render it on a white circle with a
  // colored border so the icon remains legible regardless of the category
  // color. The letter is hidden (opacity-0) — it only shows in the no-icon
  // fallback branch below.
  if (category.iconUrl) {
    return (
      <span
        className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ${className ?? ''}`}
        data-testid="category-icon"
        style={circleStyle}
      >
        <span
          data-testid="category-icon-fallback"
          className="m-auto text-[0.65rem] font-semibold leading-none opacity-0"
          style={{
            color: category.color ?? undefined,
            fontSize: size * 0.4,
          }}
          aria-hidden="true"
        >
          {fallbackLetter}
        </span>
        <AuthImg
          src={category.iconUrl}
          alt={intl.formatMessage(messages.iconAlt, {
            category: category.name,
          })}
          className="m-auto absolute inset-0 z-10 object-contain p-1"
          style={{ width: iconSize, height: iconSize }}
          cache
        />
      </span>
    );
  }

  // No icon image: colored circle with white background + colored border +
  // colored letter — matches the "white bg, color as border" spec from PR 65
  // design review.
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ${className ?? ''}`}
      data-testid="category-icon-fallback-only"
      style={{
        ...circleStyle,
        color: category.color ?? undefined,
      }}
      aria-label={category.name}
      role="img"
    >
      <span
        className="font-semibold leading-none"
        style={{
          fontSize: size * 0.4,
          color: category.color ?? undefined,
        }}
      >
        {fallbackLetter}
      </span>
    </span>
  );
}
