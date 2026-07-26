import { ObservationCategoryIcon } from '@/components/shared/ObservationCategoryIcon';
import { buildIconUrl } from '@/lib/category-utils';
import { useAuthStore } from '@/stores/auth-store';

interface CategoryIconProps {
  projectRemoteId: string | null;
  iconRef?: { docId: string };
  label: string;
  color?: string;
  size?: number; // circle diameter (default 50)
  iconSize?: number; // image diameter (default size * 0.7)
  serverBaseUrl?: string | null;
}

function CategoryIcon({
  projectRemoteId,
  iconRef,
  label,
  color,
  size = 50,
  iconSize = size * 0.7,
  serverBaseUrl,
}: CategoryIconProps) {
  const baseUrl = useAuthStore((s) => s.baseUrl);

  const iconUrl = buildIconUrl({
    projectRemoteId: projectRemoteId ?? undefined,
    serverUrl: serverBaseUrl ?? baseUrl ?? undefined,
    iconDocId: iconRef?.docId,
  });

  return (
    <ObservationCategoryIcon
      category={{
        id: iconRef?.docId ?? label,
        name: label,
        color,
        iconUrl,
      }}
      size={size}
      iconSize={iconSize}
    />
  );
}

export { CategoryIcon };
export type { CategoryIconProps };
