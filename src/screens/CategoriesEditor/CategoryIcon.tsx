import { ObservationCategoryIcon } from '@/components/shared/ObservationCategoryIcon';
import { buildIconUrl } from '@/lib/category-utils';
import { useAuthStore } from '@/stores/auth-store';

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
  const baseUrl = useAuthStore((s) => s.baseUrl);

  const iconUrl = buildIconUrl({
    projectRemoteId: projectRemoteId ?? undefined,
    serverUrl: baseUrl ?? undefined,
    iconDocId: iconRef?.docId,
  });

  // ObservationCategoryIcon defaults to h-8 w-8 (32px). Override via
  // className with explicit size classes when size differs from default.
  let sizeClass: string;
  if (size === 64) {
    sizeClass = 'h-16 w-16';
  } else if (size === 40) {
    sizeClass = 'h-10 w-10';
  } else {
    sizeClass = `h-${size / 4} w-${size / 4}`;
  }

  return (
    <ObservationCategoryIcon
      category={{
        id: iconRef?.docId ?? label,
        name: label,
        color,
        iconUrl,
      }}
      className={className ?? sizeClass}
    />
  );
}

export { CategoryIcon };
export type { CategoryIconProps };
