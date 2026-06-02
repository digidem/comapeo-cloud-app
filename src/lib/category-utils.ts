import type { Observation, Preset } from '@/lib/db';
import {
  getLegacyDisplayName,
  matchObservationToPreset,
} from '@/lib/preset-utils';

export interface ObservationCategory {
  id: string;
  name: string;
  color?: string;
  iconDocId?: string;
  iconUrl?: string;
  preset?: Preset;
}

export interface CategoryContext {
  projectRemoteId?: string;
  serverUrl?: string;
}

export interface ObservationCategoryMetadata {
  categories: ObservationCategory[];
  categoryByObservationId: Map<string, ObservationCategory>;
  displayNamesByObservationId: Map<string, string>;
}

function normalizeCategoryValue(value: string): string {
  return value.trim().toLowerCase();
}

function getCategoryTagValue(
  tags: Record<string, unknown> | undefined,
): string | undefined {
  const value = tags?.category;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function buildIconUrl({
  projectRemoteId,
  serverUrl,
  iconDocId,
}: CategoryContext & { iconDocId?: string }): string | undefined {
  if (!projectRemoteId || !iconDocId) return undefined;

  const path = `/projects/${encodeURIComponent(projectRemoteId)}/icon/${encodeURIComponent(iconDocId)}`;
  if (!serverUrl) return path;

  return `${serverUrl.replace(/\/+$/, '')}${path}`;
}

export function buildProjectCategorySet(
  presets: Preset[],
  context: CategoryContext,
): ObservationCategory[] {
  const categories = new Map<string, ObservationCategory>();

  for (const preset of presets) {
    const id = preset.remoteId ?? preset.localId;
    if (categories.has(id)) continue;

    categories.set(id, {
      id,
      name: preset.name,
      color: preset.color,
      iconDocId: preset.iconDocId,
      iconUrl: buildIconUrl({
        ...context,
        iconDocId: preset.iconDocId,
      }),
      preset,
    });
  }

  return Array.from(categories.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export function buildObservationCategoryMetadata(
  observations: Observation[],
  presets: Preset[],
  context: CategoryContext,
): ObservationCategoryMetadata {
  const categories = buildProjectCategorySet(presets, context);
  const categoryByPresetId = new Map(
    categories.map((category) => [category.id, category]),
  );
  const categoryByTagValue = new Map<string, ObservationCategory>();
  for (const category of categories) {
    const tagValue = getCategoryTagValue(category.preset?.tags);
    if (tagValue) {
      categoryByTagValue.set(normalizeCategoryValue(tagValue), category);
    }
    categoryByTagValue.set(normalizeCategoryValue(category.name), category);
  }
  const categoryByObservationId = new Map<string, ObservationCategory>();
  const displayNamesByObservationId = new Map<string, string>();

  for (const observation of observations) {
    const tagCategoryValue = getCategoryTagValue(observation.tags);
    const preset = matchObservationToPreset(observation, presets);
    if (preset) {
      const id = preset.remoteId ?? preset.localId;
      const category = categoryByPresetId.get(id);
      if (category) {
        categoryByObservationId.set(observation.localId, category);
      }
      displayNamesByObservationId.set(observation.localId, preset.name);
      continue;
    }

    if (tagCategoryValue) {
      const category = categoryByTagValue.get(
        normalizeCategoryValue(tagCategoryValue),
      ) ?? {
        id: `tag:${normalizeCategoryValue(tagCategoryValue)}`,
        name: tagCategoryValue,
      };
      categoryByObservationId.set(observation.localId, category);
      displayNamesByObservationId.set(observation.localId, category.name);
      continue;
    }

    const legacyName = getLegacyDisplayName(observation.tags);
    if (legacyName) {
      displayNamesByObservationId.set(observation.localId, legacyName);
    }
  }

  return {
    categories,
    categoryByObservationId,
    displayNamesByObservationId,
  };
}
