interface PresetInput {
  docId: string;
  name: string;
  tags: Record<string, unknown>;
  fieldRefs: Array<{ docId: string }>;
  iconRef?: { docId: string };
}

export interface Category {
  docId: string;
  label: string;
  fieldRefs: Array<{ docId: string; label?: string }>;
  color?: string;
  iconRef?: { docId: string };
}

export interface CategoryGroup {
  type: string;
  categories: Category[];
}

const ACCENT_RE = /[\u0300-\u036f]/g;

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(ACCENT_RE, '');
}

function normalizeSearch(s: string): string {
  return stripDiacritics(s).toLowerCase();
}

function resolveLocaleName(
  tags: Record<string, unknown>,
  locale: string,
  sourceName: string,
): string {
  const localeKey = `name:${locale}`;
  if (typeof tags[localeKey] === 'string') return tags[localeKey] as string;

  if (locale !== 'en') {
    const enKey = 'name:en';
    if (typeof tags[enKey] === 'string') return tags[enKey] as string;
  }

  return sourceName;
}

function matchesSearch(
  preset: PresetInput,
  searchNormalized: string,
  locale: string,
  fieldLabels?: Map<string, string>,
): boolean {
  const label = resolveLocaleName(preset.tags, locale, preset.name);
  if (normalizeSearch(label).includes(searchNormalized)) return true;

  for (const ref of preset.fieldRefs) {
    const resolvedLabel = fieldLabels?.get(ref.docId);
    if (resolvedLabel && normalizeSearch(resolvedLabel).includes(searchNormalized)) {
      return true;
    }
  }

  return false;
}

export function normalizeCategories(
  data: PresetInput[],
  locale: string,
  searchQuery: string,
  fieldLabels?: Map<string, string>,
): CategoryGroup[] {
  if (data.length === 0) return [];

  const searchNormalized = normalizeSearch(searchQuery);

  const groups = new Map<string, Category[]>();

  for (const preset of data) {
    if (searchNormalized && !matchesSearch(preset, searchNormalized, locale, fieldLabels)) {
      continue;
    }

    const rawType = preset.tags.type;
    const type =
      typeof rawType === 'string' && rawType.trim() !== ''
        ? rawType
        : 'Uncategorized';

    const label = resolveLocaleName(preset.tags, locale, preset.name);

    if (!groups.has(type)) {
      groups.set(type, []);
    }
    groups.get(type)!.push({
      docId: preset.docId,
      label,
      fieldRefs: preset.fieldRefs.map((ref) => ({
        docId: ref.docId,
        label: fieldLabels?.get(ref.docId),
      })),
      color: typeof preset.tags.color === 'string' ? preset.tags.color : undefined,
      iconRef: typeof preset.iconRef === 'object' && preset.iconRef !== null && 'docId' in preset.iconRef
        ? { docId: (preset.iconRef as { docId: string }).docId }
        : undefined,
    });
  }

  const result: CategoryGroup[] = [];
  const sortedTypes = [...groups.keys()].sort();

  for (const type of sortedTypes) {
    const categories = groups.get(type)!;
    categories.sort((a, b) => a.label.localeCompare(b.label));
    result.push({ type, categories });
  }

  return result;
}
