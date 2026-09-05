import * as v from 'valibot';

import type { SavedMap } from '@/lib/db';
import type {
  AuthoredLayer,
  AuthoredLayerCommitContext,
  AuthoredLayerValidationError,
} from '@/lib/map/authored-layers';
import {
  prepareAuthoredLayer,
  prepareAuthoredLayerBatch,
} from '@/lib/map/authored-layers';
import { parseAuthoredLayer } from '@/lib/schemas/authored-layer';
import {
  SAVED_MAP_AUTHORING_OWNED_KEYS,
  SAVED_MAP_IMMUTABLE_KEYS,
  SAVED_MAP_PACKAGE_LIFECYCLE_KEYS,
  savedMapAuthoringDraftFieldsSchema,
  savedMapSchema,
} from '@/lib/schemas/saved-map';
import type {
  AuthoredLayerDraftEntry,
  CanonicalSavedMapStorageRow,
  SavedMapAuthoringDraftFields,
  SavedMapStorageRow,
  ValidatedSavedMapStorageSnapshot,
} from '@/lib/schemas/saved-map';

/**
 * The slice of a saved-map row that determines the contents of the built smp
 * package. `attribution`/`scheme` use `null` (not `undefined`) so "absent"
 * and "present" stay distinguishable inside structural comparisons.
 */
export type PackageRelevantMapConfig = {
  type: SavedMap['type'];
  styleUrl: string;
  bbox: [number, number, number, number];
  minZoom: number;
  maxZoom: number;
  attribution: string | null;
  scheme: 'xyz' | 'tms' | null;
  layers: unknown[];
};

/** Missing `layers` canonicalizes to `[]` for comparison purposes. */
export function getPackageRelevantMapConfig(
  row: SavedMapStorageRow,
): PackageRelevantMapConfig {
  return {
    type: row.type,
    styleUrl: row.styleUrl,
    bbox: row.bbox,
    minZoom: row.minZoom,
    maxZoom: row.maxZoom,
    attribution: row.attribution ?? null,
    scheme: row.scheme ?? null,
    layers: Array.isArray(row.layers) ? row.layers : [],
  };
}

/**
 * Recursive structural equality. Objects compare by sorted own-key sets so
 * insertion order never matters; arrays compare ordered and elementwise
 * because layer order is semantically meaningful. JSON.stringify is
 * deliberately avoided: it silently reorders nothing, but it collapses
 * `undefined`, mishandles non-JSON runtime values, and cannot be bounded.
 */
function structurallyEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (
      !Array.isArray(left) ||
      !Array.isArray(right) ||
      left.length !== right.length
    ) {
      return false;
    }
    return left.every((item, index) => structurallyEqual(item, right[index]));
  }
  if (
    typeof left !== 'object' ||
    left === null ||
    typeof right !== 'object' ||
    right === null
  ) {
    return false;
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key, index) =>
      leftKeys[index] === rightKeys[index] &&
      structurallyEqual(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
      ),
  );
}

function packageRelevantConfigChanged(
  row: SavedMapStorageRow,
  next: PackageRelevantMapConfig,
): boolean {
  const previous = getPackageRelevantMapConfig(row);
  // Stored layers are only trustworthy once each entry survives the canonical
  // parser: a corrupt or future-version entry means the persisted package was
  // built from a collection that can no longer round-trip, so the package is
  // stale by definition and must be rebuilt.
  const canonicalPreviousLayers: unknown[] = [];
  for (const raw of previous.layers) {
    try {
      canonicalPreviousLayers.push(parseAuthoredLayer(raw));
    } catch {
      return true;
    }
  }
  return !structurallyEqual(
    { ...previous, layers: canonicalPreviousLayers },
    next,
  );
}

// ---------------------------------------------------------------------------
// Draft commit context + extraction
// ---------------------------------------------------------------------------

/** How a commit treats the layer ids outside its own candidate set. */
export type AuthoredLayerCommitMode =
  | { kind: 'append' }
  | { kind: 'edit'; retainedId: string }
  | { kind: 'extract' };

/**
 * Commit context for the current editor draft. Zooms always come from the
 * current draft fields (never the stored row) so a commit cannot be validated
 * against a zoom window the editor no longer shows.
 */
export function buildAuthoredLayerCommitContext(
  draftFields: SavedMapAuthoringDraftFields,
  draftEntries: readonly AuthoredLayerDraftEntry[],
  mode: AuthoredLayerCommitMode,
): AuthoredLayerCommitContext {
  const validIds = new Set<string>();
  for (const entry of draftEntries) {
    if (entry.kind === 'valid') validIds.add(entry.layer.id);
  }
  if (mode.kind === 'edit') {
    // The retained layer keeps its id through an edit; every sibling id stays
    // reserved so nothing can be re-added under an id already in the draft.
    validIds.delete(mode.retainedId);
    return {
      minZoom: draftFields.minZoom,
      maxZoom: draftFields.maxZoom,
      reservedIds: validIds,
    };
  }
  if (mode.kind === 'extract') {
    // Extraction re-validates the whole collection as one batch, so nothing
    // outside the batch exists to be reserved against it.
    return {
      minZoom: draftFields.minZoom,
      maxZoom: draftFields.maxZoom,
      reservedIds: new Set<string>(),
    };
  }
  return {
    minZoom: draftFields.minZoom,
    maxZoom: draftFields.maxZoom,
    reservedIds: validIds,
  };
}

/**
 * Contextual (cross-layer) validation of the current valid draft entries.
 * Invalid recovery entries are ignored: they are already losslessly retained
 * and are validated only by the recovery editor, not by commit preparation.
 */
export function validateAuthoredLayerDraftContext(
  entries: readonly AuthoredLayerDraftEntry[],
  context: AuthoredLayerCommitContext,
): ReadonlyMap<AuthoredLayerDraftEntry['key'], AuthoredLayerValidationError> {
  const errors = new Map<
    AuthoredLayerDraftEntry['key'],
    AuthoredLayerValidationError
  >();
  for (const entry of entries) {
    if (entry.kind !== 'valid') continue;
    const prepared = prepareAuthoredLayer(entry.layer, context);
    if (!prepared.ok) {
      errors.set(entry.key, prepared.error);
    }
  }
  return errors;
}

export type ExtractCanonicalAuthoredLayersResult =
  | { ok: true; layers: AuthoredLayer[] }
  | {
      ok: false;
      kind: 'recovery';
      errors: readonly {
        key: `invalid:${number}`;
        error: AuthoredLayerValidationError;
      }[];
    }
  | {
      ok: false;
      kind: 'context';
      errors: readonly {
        key: `layer:${string}`;
        error: AuthoredLayerValidationError;
      }[];
    }
  | {
      ok: false;
      kind: 'canonical';
      errors: readonly {
        key: `layer:${string}`;
        index: number;
        error: AuthoredLayerValidationError;
      }[];
    };

/**
 * Canonicalize the current draft into the ordered layer collection to persist.
 * Gates run strictly in order — retained recovery entries first, then
 * contextual issues, then whole-batch canonicalization — and nothing partial
 * is ever returned: a failed extraction yields errors only, never layers.
 */
export function extractCanonicalAuthoredLayers(
  entries: readonly AuthoredLayerDraftEntry[],
  context: AuthoredLayerCommitContext,
): ExtractCanonicalAuthoredLayersResult {
  const recoveryErrors: {
    key: `invalid:${number}`;
    error: AuthoredLayerValidationError;
  }[] = [];
  const validEntries: { key: `layer:${string}`; layer: AuthoredLayer }[] = [];
  for (const entry of entries) {
    if (entry.kind === 'invalid') {
      recoveryErrors.push({ key: entry.key, error: entry.error });
    } else {
      validEntries.push({ key: entry.key, layer: entry.layer });
    }
  }
  if (recoveryErrors.length > 0) {
    // The draft still holds unrecovered user data; canonicalizing anything
    // now would make the persisted collection disagree with what the editor
    // shows.
    return { ok: false, kind: 'recovery', errors: recoveryErrors };
  }
  const contextErrors = validateAuthoredLayerDraftContext(entries, context);
  if (contextErrors.size > 0) {
    // Only valid entries reach this map, so every key is a `layer:` key.
    return {
      ok: false,
      kind: 'context',
      errors: [...contextErrors].map(([key, error]) => ({
        key: key as `layer:${string}`,
        error,
      })),
    };
  }
  const batch = prepareAuthoredLayerBatch(
    validEntries.map((entry) => entry.layer),
    context,
  );
  if (!batch.ok) {
    return {
      ok: false,
      kind: 'canonical',
      errors: batch.errors.map((batchError) => ({
        // Out-of-range indices (e.g. the declared-count cap) have no draft
        // entry to map back to, so fall back to a bare `layer:` key.
        key: (validEntries[batchError.index]?.key ??
          'layer:') as `layer:${string}`,
        index: batchError.index,
        error: batchError.error,
      })),
    };
  }
  return { ok: true, layers: batch.layers };
}

export type AdvancedEditorRecoveryEligibility =
  | { allowed: true }
  | {
      allowed: false;
      code: 'INVALID_RECOVERY_ENTRIES';
      keys: readonly `invalid:${number}`[];
    };

/**
 * Whether the advanced (raw-JSON) recovery editor may be opened. Any retained
 * invalid entry blocks it: entering the advanced editor implies all recovery
 * work is finished, and listing the blocking keys in draft order lets the UI
 * point at each one.
 */
export function getAdvancedEditorRecoveryEligibility(
  entries: readonly AuthoredLayerDraftEntry[],
): AdvancedEditorRecoveryEligibility {
  const keys: `invalid:${number}`[] = [];
  for (const entry of entries) {
    if (entry.kind === 'invalid') keys.push(entry.key);
  }
  return keys.length > 0
    ? { allowed: false, code: 'INVALID_RECOVERY_ENTRIES', keys }
    : { allowed: true };
}

/**
 * Canonical authoring write: rebuilds a storage row from a validated snapshot
 * plus the current editor draft.
 *
 * Unknown passthrough keys survive value-identically (forward compatibility),
 * immutable identity always comes from the snapshot row, and package
 * lifecycle (`status`/`errorMessage`/`smpBlob`/`smpSize`) is preserved only
 * while the package-relevant config is structurally unchanged — otherwise the
 * stale package bytes are dropped and the row returns to `draft`. Throws on
 * anything that cannot produce a canonical, schema-valid row.
 */
export function buildSavedMapAuthoringWrite(
  snapshot: ValidatedSavedMapStorageSnapshot,
  draftFields: SavedMapAuthoringDraftFields,
  layers: AuthoredLayer[],
  updatedAt: number,
): CanonicalSavedMapStorageRow {
  // Runtime mirror of the type-level brand: only parseSavedMapForAuthoring
  // mints snapshots, so anything else (e.g. a bare row pushed through a cast)
  // must stop here instead of producing an unvalidated write.
  if (
    typeof snapshot !== 'object' ||
    snapshot === null ||
    !Object.hasOwn(snapshot, 'row') ||
    typeof snapshot.row !== 'object' ||
    snapshot.row === null
  ) {
    throw new Error(
      'snapshot must be a ValidatedSavedMapStorageSnapshot minted by parseSavedMapForAuthoring',
    );
  }
  const row = snapshot.row;
  // Defense in depth: the brand already excludes imported rows, but a forged
  // snapshot must never reach the write path either.
  if (row.origin === 'imported') {
    throw new Error('Imported saved maps are not authorable');
  }
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) {
    throw new Error('updatedAt must be a finite epoch-milliseconds number');
  }
  // strictObject: unknown draft keys (e.g. a smuggled `status` or `smpBlob`)
  // are rejected rather than silently dropped.
  const draftCheck = v.safeParse(
    savedMapAuthoringDraftFieldsSchema,
    draftFields,
  );
  if (!draftCheck.success) {
    throw new Error(
      `draftFields are invalid: ${draftCheck.issues
        .map((issue) => issue.message)
        .join('; ')}`,
    );
  }

  const ownedKeys = new Set<string>(SAVED_MAP_AUTHORING_OWNED_KEYS);
  const immutableKeys = new Set<string>(SAVED_MAP_IMMUTABLE_KEYS);
  const writeRow: Record<string, unknown> = {};
  // defineProperty instead of plain assignment: a hostile passthrough key
  // like __proto__ can then only ever create an own property, never rebind
  // the prototype of the row handed back to IndexedDB.
  const setValue = (key: string, value: unknown) => {
    Object.defineProperty(writeRow, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  };

  for (const key of Object.keys(row)) {
    if (ownedKeys.has(key) || immutableKeys.has(key)) continue;
    setValue(key, row[key]);
  }
  for (const key of immutableKeys) {
    if (Object.hasOwn(row, key)) setValue(key, row[key]);
  }

  setValue('name', draftFields.name);
  setValue('type', draftFields.type);
  setValue('styleUrl', draftFields.styleUrl);
  setValue('bbox', draftFields.bbox);
  setValue('minZoom', draftFields.minZoom);
  setValue('maxZoom', draftFields.maxZoom);
  // Canonical writes omit optional attribution/scheme keys entirely when the
  // draft leaves them undefined, so a row never oscillates between
  // key-absent and key-present-undefined across identical saves.
  if (draftFields.attribution !== undefined) {
    setValue('attribution', draftFields.attribution);
  }
  if (draftFields.scheme !== undefined) {
    setValue('scheme', draftFields.scheme);
  }
  setValue('layers', layers);

  const packageChanged = packageRelevantConfigChanged(row, {
    type: draftFields.type,
    styleUrl: draftFields.styleUrl,
    bbox: draftFields.bbox,
    minZoom: draftFields.minZoom,
    maxZoom: draftFields.maxZoom,
    attribution: draftFields.attribution ?? null,
    scheme: draftFields.scheme ?? null,
    layers,
  });

  if (packageChanged) {
    // A changed package config invalidates the built smp package: drop its
    // bytes/size, restart the lifecycle at draft, and clear any stale error
    // by omitting the key entirely (canonical writes never carry an
    // errorMessage key when there is no error to report).
    setValue('status', 'draft');
  } else {
    for (const key of SAVED_MAP_PACKAGE_LIFECYCLE_KEYS) {
      if (key === 'updatedAt') continue;
      if (Object.hasOwn(row, key)) setValue(key, row[key]);
    }
  }
  setValue('updatedAt', new Date(updatedAt).toISOString());

  // Final gate: the assembled row must itself satisfy the strict map schema
  // (variant rules, zoom order, and canonical layers), so a canonical write
  // can always be re-read losslessly by parseSavedMapForAuthoring.
  const finalCheck = v.safeParse(savedMapSchema, writeRow);
  if (!finalCheck.success) {
    throw new Error(
      `assembled saved map row is invalid: ${finalCheck.issues
        .map((issue) => issue.message)
        .join('; ')}`,
    );
  }
  return writeRow as CanonicalSavedMapStorageRow;
}
