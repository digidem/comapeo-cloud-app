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
