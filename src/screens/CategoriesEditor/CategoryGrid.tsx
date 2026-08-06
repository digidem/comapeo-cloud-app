import type { Category } from '@/hooks/useCategories';
import { CategoryCard } from '@/screens/CategoriesEditor/CategoryCard';

interface CategoryGridProps {
  categories: Category[]; // FLAT list, no groups
  selectedCategoryId?: string | null;
  onCategorySelect?: (docId: string) => void;
  projectRemoteId?: string | null;
  serverBaseUrl?: string | null;
}

function CategoryGrid({
  categories,
  selectedCategoryId,
  onCategorySelect,
  projectRemoteId,
  serverBaseUrl,
}: CategoryGridProps) {
  if (categories.length === 0) {
    return null;
  }

  return (
    <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-3">
      {categories.map((category) => (
        <CategoryCard
          key={category.docId}
          docId={category.docId}
          label={category.label}
          color={category.color}
          iconRef={category.iconRef}
          selected={category.docId === selectedCategoryId}
          onClick={onCategorySelect}
          projectRemoteId={projectRemoteId ?? null}
          serverBaseUrl={serverBaseUrl}
        />
      ))}
    </div>
  );
}

export { CategoryGrid };
export type { CategoryGridProps };
