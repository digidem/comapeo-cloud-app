interface PresetInput {
  docId: string;
  name: string;
  tags: Record<string, unknown>;
  fieldRefs: Array<{ docId: string }>;
  iconRef?: { docId: string };
  color?: string;
  geometry?: string[];
}

export interface Category {
  docId: string;
  label: string;
  geometry?: string[];
  fieldRefs: Array<{ docId: string }>;
  color?: string;
  iconRef?: { docId: string };
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
    if (
      resolvedLabel &&
      normalizeSearch(resolvedLabel).includes(searchNormalized)
    ) {
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
): Category[] {
  if (data.length === 0) return [];

  const searchNormalized = normalizeSearch(searchQuery);

  const result: Category[] = [];

  for (const preset of data) {
    // Geometry filtering: include point presets and legacy presets (no
    // geometry). Exclude presets whose geometry does not include 'point'.
    if (preset.geometry && !preset.geometry.includes('point')) {
      continue;
    }

    if (
      searchNormalized &&
      !matchesSearch(preset, searchNormalized, locale, fieldLabels)
    ) {
      continue;
    }

    const label = resolveLocaleName(preset.tags, locale, preset.name);

    result.push({
      docId: preset.docId,
      label,
      geometry: preset.geometry,
      fieldRefs: preset.fieldRefs.map((ref) => ({ docId: ref.docId })),
      color: preset.color,
      iconRef:
        typeof preset.iconRef === 'object' &&
        preset.iconRef !== null &&
        'docId' in preset.iconRef
          ? { docId: (preset.iconRef as { docId: string }).docId }
          : undefined,
    });
  }

  return result;
}
