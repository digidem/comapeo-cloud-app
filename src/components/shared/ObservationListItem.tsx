import { MediaPreview } from '@/components/shared/MediaPreview';
import { ObservationCategoryIcon } from '@/components/shared/ObservationCategoryIcon';
import type { ObservationCategory } from '@/lib/category-utils';
import type { Attachment } from '@/lib/data-layer';

export type ObservationListItemCategory = Pick<
  ObservationCategory,
  'id' | 'name' | 'color' | 'iconDocId' | 'iconUrl'
>;

export function resolveObservationListItemName({
  resolvedDisplayName,
  categoryTag,
  fallback,
}: {
  resolvedDisplayName?: string;
  categoryTag?: unknown;
  fallback: string;
}) {
  if (resolvedDisplayName !== undefined) return resolvedDisplayName;
  if (categoryTag !== undefined && categoryTag !== null) {
    const categoryLabel = String(categoryTag);
    if (categoryLabel !== '') return categoryLabel;
  }
  return fallback;
}

interface ObservationListItemProps {
  observationLocalId: string;
  category?: ObservationListItemCategory;
  displayName: string;
  createdAt: string;
  dateLabel?: string;
  tags?: Record<string, string>;
  attachments?: Attachment[];
}

export function ObservationListItem({
  observationLocalId,
  category,
  displayName,
  createdAt,
  dateLabel,
  tags,
  attachments,
}: ObservationListItemProps) {
  return (
    <div
      data-observation-list-item
      className="grid grid-cols-[auto_1fr_auto] items-center gap-3"
    >
      {category ? (
        <ObservationCategoryIcon category={category} size={48} />
      ) : (
        <div className="h-12 w-12" aria-hidden="true" />
      )}
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium text-text break-words wrap-anywhere">
          {displayName}
        </span>
        <span className="text-xs text-text-muted">
          {dateLabel ?? new Date(createdAt).toLocaleDateString()}
        </span>
      </div>
      <MediaPreview
        observationLocalId={observationLocalId}
        tags={tags}
        attachments={attachments}
      />
    </div>
  );
}
