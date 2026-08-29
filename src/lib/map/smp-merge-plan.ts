import {
  type AuthoredLayer,
  sourceFolderForAuthoredLayer,
  sourceLayerIdForAuthoredLayer,
} from '@/lib/map/authored-layers';
import type { MapLibreStyleLike } from '@/lib/map/authored-style';
import type { SmpZipEntry, SmpZipInspection } from '@/lib/map/smp-zip';

export const GLOBAL_OVERVIEW_MAX_ZOOM_FOR_MERGE = 3;
export const GLOBAL_OVERVIEW_BBOX_FOR_MERGE: [number, number, number, number] =
  [-180, -85.0511, 180, 85.0511];

export type MergeInputArchive = {
  role: 'regional' | 'global' | 'authored';
  blob: Blob;
  inspection: SmpZipInspection;
};

export type GlobalSourceMapping = {
  sourceId: string;
  regionalFolder: string;
  globalFolder: string;
  mergedFolder: string;
  globalSourceId: string;
};

export type AuthoredFolderMapping = {
  sourceId: string;
  oldFolder: string;
  targetFolder: string;
};

export type MergeEntryPlan = {
  input: MergeInputArchive;
  entry: SmpZipEntry;
  targetName: string;
};

export function smpMergeError(message: string): Error {
  return new Error(`Authored SMP merge failed: ${message}`);
}

export function isPlainSmpRecord(
  value: unknown,
): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function getSmpTileFolder(
  source: Record<string, unknown>,
): string | undefined {
  const tiles = source.tiles;
  if (!Array.isArray(tiles) || tiles.length === 0) return undefined;
  let folder: string | undefined;
  for (const tile of tiles) {
    if (typeof tile !== 'string') return undefined;
    const matched = /^smp:\/\/maps\.v1\/s\/([^/]+)\//.exec(tile)?.[1];
    if (!matched) return undefined;
    if (folder !== undefined && folder !== matched) return undefined;
    folder = matched;
  }
  return folder;
}

export function withSmpTileFolder(
  source: Record<string, unknown>,
  oldFolder: string,
  newFolder: string,
): Record<string, unknown> {
  if (!Array.isArray(source.tiles)) {
    throw smpMergeError('SMP source has no tile URLs');
  }
  return {
    ...source,
    tiles: source.tiles.map((tile) => {
      if (typeof tile !== 'string') {
        throw smpMergeError('SMP source has a non-string tile URL');
      }
      const oldPath = `/s/${oldFolder}/`;
      if (!tile.includes(oldPath)) {
        throw smpMergeError(
          `SMP source URL is inconsistent with folder ${oldFolder}`,
        );
      }
      return tile.replace(oldPath, `/s/${newFolder}/`);
    }),
  };
}

export function getOrCreateSmpSourceFolders(
  style: MapLibreStyleLike,
): Record<string, string> {
  let metadata = style.metadata;
  if (!metadata || !isPlainSmpRecord(metadata)) {
    metadata = {};
    style.metadata = metadata;
  }
  const raw = metadata['smp:sourceFolders'];
  let folders: Record<string, string>;
  if (!isPlainSmpRecord(raw)) {
    folders = {};
    metadata['smp:sourceFolders'] = folders;
  } else {
    folders = raw as Record<string, string>;
  }
  for (const [sourceId, source] of Object.entries(style.sources)) {
    const folder = getSmpTileFolder(source);
    if (!folder) continue;
    const existing = folders[sourceId];
    if (existing !== undefined && existing !== `s/${folder}`) {
      throw smpMergeError(`source-folder metadata mismatch for ${sourceId}`);
    }
    folders[sourceId] = `s/${folder}`;
  }
  return folders;
}

export function mergeGlobalOverviewStyle(
  regionalInput: MapLibreStyleLike,
  globalStyle: MapLibreStyleLike,
): { style: MapLibreStyleLike; mappings: GlobalSourceMapping[] } {
  const clonedMetadata = regionalInput.metadata
    ? { ...regionalInput.metadata }
    : undefined;
  if (clonedMetadata && isPlainSmpRecord(clonedMetadata['smp:sourceFolders'])) {
    clonedMetadata['smp:sourceFolders'] = {
      ...(clonedMetadata['smp:sourceFolders'] as Record<string, string>),
    };
  }
  const regionalStyle: MapLibreStyleLike = {
    ...regionalInput,
    sources: { ...regionalInput.sources },
    layers: [...regionalInput.layers],
    metadata: clonedMetadata,
  };
  const sourceFolders = getOrCreateSmpSourceFolders(regionalStyle);
  const usedFolders = new Set<string>();
  for (const source of Object.values(regionalStyle.sources)) {
    const folder = getSmpTileFolder(source);
    if (folder) usedFolders.add(folder);
  }
  const mappings: GlobalSourceMapping[] = [];
  const usedGlobalFolders = new Set<string>();
  let globalIndex = 0;

  const globalSourceEntries = Object.entries(globalStyle.sources).sort(
    ([leftId], [rightId]) => {
      if (leftId < rightId) return -1;
      if (leftId > rightId) return 1;
      return 0;
    },
  );
  for (const [sourceId, globalSource] of globalSourceEntries) {
    const regionalSource = regionalStyle.sources[sourceId];
    if (!regionalSource) continue;
    const globalFolder = getSmpTileFolder(globalSource);
    const regionalFolder = getSmpTileFolder(regionalSource);
    if (!globalFolder || !regionalFolder) continue;
    if (globalFolder.startsWith('comapeo-authored-')) {
      throw smpMergeError(
        'global overview cannot use the authored resource prefix',
      );
    }
    if (usedGlobalFolders.has(globalFolder)) {
      throw smpMergeError(
        `global overview source folder is shared by multiple sources: ${globalFolder}`,
      );
    }
    usedGlobalFolders.add(globalFolder);
    const globalSourceId = `${sourceId}__global_overview`;
    if (Object.hasOwn(regionalStyle.sources, globalSourceId)) {
      throw smpMergeError(
        `global overview source ID collision: ${globalSourceId}`,
      );
    }
    const mergedFolder = `g${globalIndex++}`;
    if (usedFolders.has(mergedFolder)) {
      throw smpMergeError(`global overview folder collision: ${mergedFolder}`);
    }
    usedFolders.add(mergedFolder);
    regionalStyle.sources[globalSourceId] = withSmpTileFolder(
      globalSource,
      globalFolder,
      mergedFolder,
    );
    sourceFolders[globalSourceId] = `s/${mergedFolder}`;
    mappings.push({
      sourceId,
      regionalFolder,
      globalFolder,
      mergedFolder,
      globalSourceId,
    });
  }

  const mappingBySource = new Map(
    mappings.map((mapping) => [mapping.sourceId, mapping]),
  );
  const usedLayerIds = new Set(regionalStyle.layers.map((layer) => layer.id));
  const mergedLayers: MapLibreStyleLike['layers'] = [];
  for (const layer of regionalStyle.layers) {
    const mapping = layer.source
      ? mappingBySource.get(layer.source)
      : undefined;
    if (!mapping) {
      mergedLayers.push(layer);
      continue;
    }
    const minZoom = typeof layer.minzoom === 'number' ? layer.minzoom : 0;
    const maxZoom = typeof layer.maxzoom === 'number' ? layer.maxzoom : 24;
    const splitZoom = GLOBAL_OVERVIEW_MAX_ZOOM_FOR_MERGE + 1;
    if (minZoom < splitZoom) {
      const globalLayerId = `${layer.id}__global_overview`;
      if (usedLayerIds.has(globalLayerId)) {
        throw smpMergeError(
          `global overview layer ID collision: ${globalLayerId}`,
        );
      }
      usedLayerIds.add(globalLayerId);
      mergedLayers.push({
        ...layer,
        id: globalLayerId,
        source: mapping.globalSourceId,
        maxzoom: Math.min(maxZoom, splitZoom),
      });
    }
    if (maxZoom > splitZoom) {
      mergedLayers.push({ ...layer, minzoom: Math.max(minZoom, splitZoom) });
    }
  }
  regionalStyle.layers = mergedLayers;
  const metadata = regionalStyle.metadata ?? {};
  if (mappings.length > 0) {
    const regionalBounds = metadata['smp:bounds'];
    if (regionalBounds === undefined) delete metadata['smp:regionalBounds'];
    else metadata['smp:regionalBounds'] = regionalBounds;
    metadata['smp:bounds'] = [...GLOBAL_OVERVIEW_BBOX_FOR_MERGE];
  }
  regionalStyle.metadata = metadata;
  return { style: regionalStyle, mappings };
}

function isRecognizedFile(name: string): boolean {
  return (
    name === 'VERSION' ||
    name === 'style.json' ||
    name.startsWith('s/') ||
    name.startsWith('sprites/') ||
    name.startsWith('fonts/')
  );
}

function zoomUnderFolder(name: string, folder: string): number | undefined {
  const prefix = `s/${folder}/`;
  if (!name.startsWith(prefix)) return undefined;
  const segment = name.slice(prefix.length).split('/')[0];
  if (!segment || !/^\d+$/.test(segment)) return undefined;
  return Number(segment);
}

export function planRegionalEntries(
  archive: MergeInputArchive,
  mappings: readonly GlobalSourceMapping[],
): MergeEntryPlan[] {
  const plans: MergeEntryPlan[] = [];
  for (const entry of archive.inspection.entries) {
    if (entry.isDirectory || entry.name === 'style.json') continue;
    if (!isRecognizedFile(entry.name)) {
      throw smpMergeError(`unexpected file in regional SMP: ${entry.name}`);
    }
    const replacedByGlobal = mappings.some((mapping) => {
      const zoom = zoomUnderFolder(entry.name, mapping.regionalFolder);
      return zoom !== undefined && zoom <= GLOBAL_OVERVIEW_MAX_ZOOM_FOR_MERGE;
    });
    if (!replacedByGlobal) {
      plans.push({ input: archive, entry, targetName: entry.name });
    }
  }
  return plans;
}

export function planGlobalEntries(
  archive: MergeInputArchive,
  mappings: readonly GlobalSourceMapping[],
): MergeEntryPlan[] {
  const plans: MergeEntryPlan[] = [];
  for (const entry of archive.inspection.entries) {
    if (
      entry.isDirectory ||
      entry.name === 'style.json' ||
      entry.name === 'VERSION'
    ) {
      continue;
    }
    if (!isRecognizedFile(entry.name)) {
      throw smpMergeError(`unexpected file in global SMP: ${entry.name}`);
    }
    let mapped = false;
    for (const mapping of mappings) {
      const zoom = zoomUnderFolder(entry.name, mapping.globalFolder);
      if (zoom === undefined || zoom > GLOBAL_OVERVIEW_MAX_ZOOM_FOR_MERGE) {
        continue;
      }
      plans.push({
        input: archive,
        entry,
        targetName: `s/${mapping.mergedFolder}/${entry.name.slice(`s/${mapping.globalFolder}/`.length)}`,
      });
      mapped = true;
      break;
    }
    if (!mapped && entry.name.startsWith('s/')) {
      throw smpMergeError(`unexpected global source resource: ${entry.name}`);
    }
  }
  return plans;
}

export function planAuthoredEntries(
  archive: MergeInputArchive,
  mappings: readonly AuthoredFolderMapping[],
): MergeEntryPlan[] {
  const plans: MergeEntryPlan[] = [];
  for (const entry of archive.inspection.entries) {
    if (
      entry.isDirectory ||
      entry.name === 'style.json' ||
      entry.name === 'VERSION'
    ) {
      continue;
    }
    if (!isRecognizedFile(entry.name)) {
      throw smpMergeError(`unexpected file in authored SMP: ${entry.name}`);
    }
    const mapping = mappings.find((candidate) =>
      entry.name.startsWith(`s/${candidate.oldFolder}/`),
    );
    if (!mapping) {
      throw smpMergeError(`unexpected authored resource: ${entry.name}`);
    }
    plans.push({
      input: archive,
      entry,
      targetName: `s/${mapping.targetFolder}/${entry.name.slice(`s/${mapping.oldFolder}/`.length)}`,
    });
  }
  return plans;
}

export function proveMergePlanUnique(
  plans: readonly MergeEntryPlan[],
  maxEntries: number,
): void {
  if (plans.length + 1 > maxEntries) {
    throw smpMergeError('final SMP entry cap exceeded');
  }
  const targets = new Set<string>(['style.json']);
  for (const plan of plans) {
    if (targets.has(plan.targetName)) {
      throw smpMergeError(`merge target collision: ${plan.targetName}`);
    }
    targets.add(plan.targetName);
  }
}

export async function applyAuthoredWriterSources(
  finalStyle: MapLibreStyleLike,
  writerStyle: MapLibreStyleLike | undefined,
  authoredLayers: readonly AuthoredLayer[],
): Promise<AuthoredFolderMapping[]> {
  const rasters = authoredLayers.filter(
    (layer) => layer.source.type === 'raster-tiles',
  );
  if (rasters.length === 0) {
    if (writerStyle) {
      throw smpMergeError('Writer SMP exists without authored raster layers');
    }
    return [];
  }
  if (!writerStyle) {
    throw smpMergeError('authored raster layers require a Writer SMP');
  }
  const rawFolders = writerStyle.metadata?.['smp:sourceFolders'];
  if (!isPlainSmpRecord(rawFolders)) {
    throw smpMergeError('Writer style is missing source-folder metadata');
  }
  const usedFolders = new Set<string>();
  for (const source of Object.values(finalStyle.sources)) {
    const folder = getSmpTileFolder(source);
    if (folder) usedFolders.add(folder);
  }
  const seenOld = new Set<string>();
  const finalFolders = getOrCreateSmpSourceFolders(finalStyle);
  const targetFolders = await Promise.all(
    rasters.map((layer) => sourceFolderForAuthoredLayer(layer.id)),
  );
  const mappings: AuthoredFolderMapping[] = [];
  for (const [index, layer] of rasters.entries()) {
    const sourceId = sourceLayerIdForAuthoredLayer(layer.id);
    const writerSource = writerStyle.sources[sourceId];
    if (!writerSource) {
      throw smpMergeError(`Writer style missing source ${sourceId}`);
    }
    const oldFolder = getSmpTileFolder(writerSource);
    if (!oldFolder) {
      throw smpMergeError(`Writer source ${sourceId} has no SMP folder`);
    }
    if (rawFolders[sourceId] !== `s/${oldFolder}`) {
      throw smpMergeError(
        `Writer source-folder metadata mismatch for ${sourceId}`,
      );
    }
    if (seenOld.has(oldFolder)) {
      throw smpMergeError(
        `Writer folder reused by multiple sources: ${oldFolder}`,
      );
    }
    seenOld.add(oldFolder);
    const targetFolder = targetFolders[index]!;
    if (usedFolders.has(targetFolder)) {
      throw smpMergeError(`authored source-folder collision: ${targetFolder}`);
    }
    usedFolders.add(targetFolder);
    const composedSource = finalStyle.sources[sourceId];
    const rewrittenWriterSource = withSmpTileFolder(
      writerSource,
      oldFolder,
      targetFolder,
    );
    finalStyle.sources[sourceId] = {
      ...rewrittenWriterSource,
      ...(typeof composedSource?.minzoom === 'number'
        ? { minzoom: composedSource.minzoom }
        : {}),
      ...(typeof composedSource?.maxzoom === 'number'
        ? { maxzoom: composedSource.maxzoom }
        : {}),
    };
    finalFolders[sourceId] = `s/${targetFolder}`;
    mappings.push({ sourceId, oldFolder, targetFolder });
  }
  return mappings;
}
