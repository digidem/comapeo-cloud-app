import JSZip from 'jszip';

import {
  type AuthoredLayer,
  MAX_AUTHORED_JSON_DEPTH,
  MAX_AUTHORED_JSON_NODES_PER_LAYER,
  MAX_AUTHORED_JSON_STRING_BYTES,
  MAX_FINAL_STYLE_BYTES,
  measureCanonicalJsonUtf8Bounded,
} from '@/lib/map/authored-layers';
import {
  type AuthoredStyleMapContext,
  type MapLibreStyleLike,
  assertValidMapLibreStyle,
  composeAuthoredStyle,
} from '@/lib/map/authored-style';
import {
  type GlobalSourceMapping,
  type MergeInputArchive,
  applyAuthoredWriterSources,
  isPlainSmpRecord,
  mergeGlobalOverviewStyle,
  planAuthoredEntries,
  planGlobalEntries,
  planRegionalEntries,
  proveMergePlanUnique,
  smpMergeError,
} from '@/lib/map/smp-merge-plan';
import {
  MAX_SMP_CENTRAL_DIRECTORY_BYTES,
  MAX_SMP_MERGED_OUTPUT_BYTES,
  MAX_SMP_MERGE_ENTRIES,
  MAX_SMP_MERGE_INPUT_BYTES,
  MAX_SMP_MERGE_UNCOMPRESSED_BYTES,
  createSmpZipAggregateBudget,
  inspectSmpZipCentralDirectory,
  readBoundedSmpZipEntry,
  validateSmpZipLocalEntryLayout,
} from '@/lib/map/smp-zip';

export function assertSmpMergedOutputBound(
  finalUncompressedBytes: bigint,
  finalEntryCount: number,
): void {
  if (!Number.isSafeInteger(finalEntryCount) || finalEntryCount < 0) {
    throw new RangeError('finalEntryCount must be a non-negative safe integer');
  }
  const conservativeBound =
    finalUncompressedBytes + BigInt(finalEntryCount * 4096 + 2 * 1024 * 1024);
  if (conservativeBound > BigInt(MAX_SMP_MERGED_OUTPUT_BYTES)) {
    throw smpMergeError('final SMP conservative output bound exceeds 256 MiB');
  }
}

export function assertActualMergedSmpSize(size: number): void {
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new RangeError('merged SMP size must be a non-negative safe integer');
  }
  if (size > MAX_SMP_MERGED_OUTPUT_BYTES) {
    throw smpMergeError('final SMP output exceeds 256 MiB');
  }
}

export type MergeSmpWithAuthoredLayersConfig = {
  regionalBlob: Blob;
  globalBlob?: Blob;
  authoredBlob?: Blob;
  authoredLayers: readonly AuthoredLayer[];
  map: AuthoredStyleMapContext;
  signal?: AbortSignal;
};

function mergeAbortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  return new Error('Authored SMP merge failed', {
    cause:
      signal.reason ?? new DOMException('Download cancelled', 'AbortError'),
  });
}

function abortIfNeeded(signal?: AbortSignal): void {
  if (signal?.aborted) throw mergeAbortError(signal);
}

const DETERMINISTIC_ZIP_DATE = new Date(Date.UTC(1980, 0, 1));

async function generateMergedArchive(
  output: JSZip,
  signal?: AbortSignal,
): Promise<Blob> {
  const stream = output.generateInternalStream({
    type: 'uint8array',
    compression: 'STORE',
  });
  return new Promise<Blob>((resolve, reject) => {
    let settled = false;
    let totalBytes = 0;
    const chunks: Uint8Array[] = [];
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        stream.pause();
      } catch {
        // Best-effort stop: the caller-visible failure must remain primary.
      }
      reject(
        error instanceof Error
          ? error
          : new Error('Authored SMP merge failed', { cause: error }),
      );
    };
    const onAbort = () => {
      if (signal) fail(mergeAbortError(signal));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    stream
      .on('data', (chunk: Uint8Array) => {
        if (settled) return;
        totalBytes += chunk.byteLength;
        if (totalBytes > MAX_SMP_MERGED_OUTPUT_BYTES) {
          fail(smpMergeError('final SMP output exceeds 256 MiB'));
          return;
        }
        chunks.push(chunk);
      })
      .on('error', fail)
      .on('end', () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(new Blob(chunks as BlobPart[], { type: 'application/zip' }));
      });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    stream.resume();
  });
}

async function readStyle(
  archive: MergeInputArchive,
  budget: ReturnType<typeof createSmpZipAggregateBudget>,
  signal: AbortSignal,
): Promise<MapLibreStyleLike> {
  const matches = archive.inspection.entries.filter(
    (entry) => entry.name === 'style.json',
  );
  if (matches.length !== 1) {
    throw smpMergeError(
      `${archive.role} SMP must contain exactly one style.json`,
    );
  }
  const bytes = await readBoundedSmpZipEntry(
    archive.blob,
    matches[0]!,
    budget,
    signal,
    archive.inspection,
  );
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new Error(`${archive.role} style.json is not valid UTF-8`, { cause });
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (cause) {
    throw new Error(`${archive.role} style.json is not valid JSON`, { cause });
  }
  if (
    !isPlainSmpRecord(value) ||
    value.version !== 8 ||
    !isPlainSmpRecord(value.sources) ||
    !Array.isArray(value.layers)
  ) {
    throw smpMergeError(
      `${archive.role} style.json is not a MapLibre v8 style`,
    );
  }
  return value as MapLibreStyleLike;
}

function measureFinalStyle(style: MapLibreStyleLike): bigint {
  const measured = measureCanonicalJsonUtf8Bounded(style, {
    maxBytes: MAX_FINAL_STYLE_BYTES,
    maxDepth: MAX_AUTHORED_JSON_DEPTH,
    maxNodes: MAX_AUTHORED_JSON_NODES_PER_LAYER,
    maxStringBytes: MAX_AUTHORED_JSON_STRING_BYTES,
  });
  if (!measured.ok) {
    throw smpMergeError(
      `final style exceeds the 32 MiB boundary: ${measured.message}`,
    );
  }
  return measured.bytes;
}

async function inspectInputs(
  config: MergeSmpWithAuthoredLayersConfig,
): Promise<MergeInputArchive[]> {
  const inputs: Array<{ role: MergeInputArchive['role']; blob: Blob }> = [
    { role: 'regional', blob: config.regionalBlob },
    ...(config.globalBlob
      ? [{ role: 'global' as const, blob: config.globalBlob }]
      : []),
    ...(config.authoredBlob
      ? [{ role: 'authored' as const, blob: config.authoredBlob }]
      : []),
  ];
  const compressedBytes = inputs.reduce(
    (sum, input) => sum + BigInt(input.blob.size),
    0n,
  );
  if (compressedBytes > BigInt(MAX_SMP_MERGE_INPUT_BYTES)) {
    throw smpMergeError('combined SMP inputs exceed the 192 MiB cap');
  }

  const archives: MergeInputArchive[] = [];
  let entryCount = 0;
  let centralDirectoryBytes = 0;
  let declaredUncompressedBytes = 0n;
  for (const input of inputs) {
    abortIfNeeded(config.signal);
    const inspection = await inspectSmpZipCentralDirectory(input.blob);
    entryCount += inspection.entries.length;
    centralDirectoryBytes += inspection.centralDirectorySize;
    declaredUncompressedBytes += inspection.declaredUncompressedBytes;
    if (entryCount > MAX_SMP_MERGE_ENTRIES) {
      throw smpMergeError('combined SMP inputs exceed the 20,000-entry cap');
    }
    if (centralDirectoryBytes > MAX_SMP_CENTRAL_DIRECTORY_BYTES) {
      throw smpMergeError(
        'combined SMP central directories exceed the 16 MiB cap',
      );
    }
    if (declaredUncompressedBytes > BigInt(MAX_SMP_MERGE_UNCOMPRESSED_BYTES)) {
      throw smpMergeError(
        'combined declared uncompressed bytes exceed 160 MiB',
      );
    }
    await validateSmpZipLocalEntryLayout(input.blob, inspection);
    archives.push({ ...input, inspection });
  }
  return archives;
}

export async function preflightSmpWithAuthoredLayers(config: {
  regionalBlob: Blob;
  globalBlob?: Blob;
  authoredLayers: readonly AuthoredLayer[];
  map: AuthoredStyleMapContext;
  signal?: AbortSignal;
}): Promise<{ finalStyleUtf8Bytes: bigint }> {
  const mergeConfig: MergeSmpWithAuthoredLayersConfig = {
    regionalBlob: config.regionalBlob,
    ...(config.globalBlob ? { globalBlob: config.globalBlob } : {}),
    authoredLayers: config.authoredLayers,
    map: config.map,
    signal: config.signal,
  };
  const signal = config.signal ?? new AbortController().signal;
  const archives = await inspectInputs(mergeConfig);
  const regionalArchive = archives.find(
    (archive) => archive.role === 'regional',
  )!;
  const globalArchive = archives.find((archive) => archive.role === 'global');
  const budget = createSmpZipAggregateBudget();
  const regionalStyle = await readStyle(regionalArchive, budget, signal);
  const globalStyle = globalArchive
    ? await readStyle(globalArchive, budget, signal)
    : undefined;
  abortIfNeeded(config.signal);
  const globalMerge = globalStyle
    ? mergeGlobalOverviewStyle(regionalStyle, globalStyle)
    : { style: regionalStyle, mappings: [] as GlobalSourceMapping[] };
  const composed = composeAuthoredStyle({
    baseStyle: globalMerge.style,
    authoredLayers: config.authoredLayers,
    map: config.map,
  });
  return { finalStyleUtf8Bytes: composed.finalStyleUtf8Bytes };
}

export async function mergeSmpWithAuthoredLayers(
  config: MergeSmpWithAuthoredLayersConfig,
): Promise<Blob> {
  abortIfNeeded(config.signal);
  const signal = config.signal ?? new AbortController().signal;
  const archives = await inspectInputs(config);
  const regionalArchive = archives.find(
    (archive) => archive.role === 'regional',
  )!;
  const globalArchive = archives.find((archive) => archive.role === 'global');
  const authoredArchive = archives.find(
    (archive) => archive.role === 'authored',
  );
  const budget = createSmpZipAggregateBudget();

  const regionalStyle = await readStyle(regionalArchive, budget, signal);
  const globalStyle = globalArchive
    ? await readStyle(globalArchive, budget, signal)
    : undefined;
  const writerStyle = authoredArchive
    ? await readStyle(authoredArchive, budget, signal)
    : undefined;
  abortIfNeeded(config.signal);

  const globalMerge = globalStyle
    ? mergeGlobalOverviewStyle(regionalStyle, globalStyle)
    : { style: regionalStyle, mappings: [] as GlobalSourceMapping[] };
  const composed = composeAuthoredStyle({
    baseStyle: globalMerge.style,
    authoredLayers: config.authoredLayers,
    map: config.map,
  });
  const finalStyle: MapLibreStyleLike = {
    ...composed.style,
    sources: { ...composed.style.sources },
    layers: [...composed.style.layers],
    ...(composed.style.metadata
      ? { metadata: { ...composed.style.metadata } }
      : {}),
  };
  const authoredMappings = await applyAuthoredWriterSources(
    finalStyle,
    writerStyle,
    composed.layers,
  );
  assertValidMapLibreStyle(finalStyle, 'final merged style');
  const finalStyleBytes = measureFinalStyle(finalStyle);
  abortIfNeeded(config.signal);

  const plans = [
    ...planRegionalEntries(regionalArchive, globalMerge.mappings),
    ...(globalArchive
      ? planGlobalEntries(globalArchive, globalMerge.mappings)
      : []),
    ...(authoredArchive
      ? planAuthoredEntries(authoredArchive, authoredMappings)
      : []),
  ].sort((left, right) => {
    if (left.targetName < right.targetName) return -1;
    if (left.targetName > right.targetName) return 1;
    return 0;
  });
  proveMergePlanUnique(plans, MAX_SMP_MERGE_ENTRIES);

  const materialized: Array<{ targetName: string; bytes: Uint8Array }> = [];
  let finalPayloadBytes = finalStyleBytes;
  for (const plan of plans) {
    const bytes = await readBoundedSmpZipEntry(
      plan.input.blob,
      plan.entry,
      budget,
      signal,
      plan.input.inspection,
    );
    finalPayloadBytes += BigInt(bytes.byteLength);
    materialized.push({ targetName: plan.targetName, bytes });
    abortIfNeeded(config.signal);
  }

  const finalEntryCount = materialized.length + 1;
  assertSmpMergedOutputBound(finalPayloadBytes, finalEntryCount);

  // No fresh archive write happens until every target has been proven unique.
  const output = new JSZip();
  for (const item of materialized) {
    output.file(item.targetName, item.bytes, {
      binary: true,
      compression: 'STORE',
      createFolders: false,
      date: DETERMINISTIC_ZIP_DATE,
    });
  }
  const styleJson = JSON.stringify(finalStyle);
  if (
    BigInt(new TextEncoder().encode(styleJson).byteLength) !== finalStyleBytes
  ) {
    throw smpMergeError('final style measurement diverged from serialization');
  }
  output.file('style.json', styleJson, {
    compression: 'STORE',
    createFolders: false,
    date: DETERMINISTIC_ZIP_DATE,
  });
  const blob = await generateMergedArchive(output, config.signal);
  assertActualMergedSmpSize(blob.size);
  abortIfNeeded(config.signal);
  return blob;
}
