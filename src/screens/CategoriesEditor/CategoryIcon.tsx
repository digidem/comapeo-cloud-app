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

  return (
    <span style={{ display: 'inline-block', width: size, height: size }}>
      <ObservationCategoryIcon
        category={{
          id: iconRef?.docId ?? label,
          name: label,
          color,
          iconUrl,
        }}
        className={className}
      />
    </span>
  );
}

export { CategoryIcon };
export type { CategoryIconProps };
