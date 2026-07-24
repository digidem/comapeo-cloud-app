import { defineMessages, useIntl } from 'react-intl';

import { AuthImg } from '@/components/shared/auth-img';
import { buildIconUrl } from '@/lib/category-utils';
import { useAuthStore } from '@/stores/auth-store';

const messages = defineMessages({
  iconAlt: {
    id: 'categories.iconAlt',
    defaultMessage: '{category} icon',
  },
});

interface CategoryIconProps {
  projectRemoteId: string | null;
  iconRef?: { docId: string };
  label: string;
  color?: string;
  size?: number;
  className?: string;
}

function CategoryIcon({
  projectRemoteId,
  iconRef,
  label,
  color,
  size = 40,
  className,
}: CategoryIconProps) {
  const intl = useIntl();
  const baseUrl = useAuthStore((s) => s.baseUrl);

  const fallbackLetter = label.trim().slice(0, 1).toUpperCase() || '?';

  const iconUrl = buildIconUrl({
    projectRemoteId: projectRemoteId ?? undefined,
    serverUrl: baseUrl ?? undefined,
    iconDocId: iconRef?.docId,
  });

  if (iconUrl) {
    return (
      <div
        data-testid="category-icon"
        className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className ?? ''}`}
        style={{
          backgroundColor: color ?? '#1F6FFF',
          width: size,
          height: size,
        }}
      >
        <span
          data-testid="category-icon-fallback"
          className="text-[0.65rem] font-semibold leading-none text-white"
          aria-hidden="true"
        >
          {fallbackLetter}
        </span>
        <AuthImg
          src={iconUrl}
          alt={intl.formatMessage(messages.iconAlt, {
            category: label,
          })}
          className="absolute inset-0 z-10 h-full w-full object-contain p-1"
          cache
        />
      </div>
    );
  }

  // No icon: colored circle with letter
  return (
    <div
      data-testid="category-icon"
      className={`flex shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${className ?? ''}`}
      style={{
        backgroundColor: color ?? '#1F6FFF',
        width: size,
        height: size,
      }}
      aria-label={label}
      role="img"
    >
      {fallbackLetter}
    </div>
  );
}

export { CategoryIcon };
export type { CategoryIconProps };
