> **GitHub issue:** #283 — `perf(map): bound SMP download memory for large offline maps`  
> **Reviewed against:** `main` @ `5f5e0685cf88866773e5ed661964debf48013d14` on 2026-08-27  
> **Role:** canonical reviewed specification (durable in-repo copy). The GitHub issue carries workflow state only (labels, lane, discussion) plus a stub and acceptance checklist linking here. Where issue body and this file disagree, **this file at the linked SHA wins**.  
> **Supersedes:** none. **Superseded-by:** none.

# perf(map): bound SMP download memory for large offline maps

## Implementation-start gate

This is one executable implementation issue and should land as one independently mergeable PR.

**Label gating is part of the gate, not prose only:** `agent:ready-for-implementation` + `lane:implementation` may only be applied to the GitHub issue after #279 is merged and the target base contains its artifacts. Until then the issue remains in the spec lane with a comment naming the exact merge gate.

Before coding, verify the **actual target base** contains all of the following:

1. **#255 / PR #267 storage foundation** — already verified on `main` at `5f5e0685cf88866773e5ed661964debf48013d14`: `SavedMapPackage`, v14 `mapPackageChunks`, 4 MiB chunking, `getSavedMapPackageSource()`, v13 whole-`ArrayBuffer` compatibility, and pre-v13 `smpBlob` compatibility.
2. **#279 merged** — #283 must not create a second Writer/ZIP lifecycle beside #279. At specification time PR #287 is open and owns the canonical authored-layer Writer cancellation/backpressure rules and bounded authored-package merge limits. Do not start #283 until #279 is merged and the target base contains its final equivalents of `src/lib/map/authored-writer.ts`, the authored SMP package APIs in `src/lib/map/smp-download.ts`, and the authored merge/resource-limit tests. If #279 is superseded or its final public seam differs materially from PR #287, stop and update this dependency seam before implementation rather than duplicating compatible-looking helpers.

#280/#281/#282 are **not** implementation prerequisites. #283 must work when `authoredLayers` is empty and preserve #279 behavior/limits when authored layers are present.

## Problem

The current basemap download path defeats the streaming contract exposed by `styled-map-package-api`:

- `download()` already returns `ReadableStream<Uint8Array>`, but `collectDownloadChunks()` retains every output chunk before constructing a `Blob`.
- With global overview enabled, the app retains complete global and regional SMPs, opens both in JSZip, materializes copied entries, and generates another complete merged archive.
- Persistence is chunked only **after** the complete final `Blob` exists.

Large downloads therefore scale JS payload memory with final SMP size and can fail on constrained mobile/WebKit browsers even though v14 IndexedDB persistence itself is chunked.

## Verified upstream constraints

- Installed and latest published `styled-map-package-api` is `5.0.0-pre.5` (package git head `65f5db2453917db2fa5165b9c57fb3b62e05e196`).
- Its public `download()` output is a Web `ReadableStream`.
- Public `StyleDownloader` and `Writer` entry points are exported.
- `Writer` writes ZIP output incrementally through its `outputStream`; it does not require a final in-memory Blob.
- `StyleDownloader.getTiles()` exposes `[ReadableStream<Uint8Array>, TileInfo]` entries and per-pass skipped-tile metadata. It has no caller `minzoom`, so the regional pass still discovers/downloads z0–3; #283 may consume/discard those duplicate low-zoom streams but must not add them to the final Writer.
- #279 establishes an important Writer cleanup invariant: cancel the acquired output reader to release the underlying ZIP producer; `Writer.abort()` alone is not the cleanup boundary. #283 must reuse/refactor that exact lifecycle rather than regress it.

## Goal

Make the normal offline-map download path bounded in application payload memory independently of final SMP byte size, while preserving global overview behavior, cancellation, progress, storage safety, package integrity, v13/v14 compatibility, offline rendering, and export compatibility.

## Architecture decisions

### 1. Stream the final basemap SMP directly into staged IndexedDB chunks

Do not stream into the currently active generation. A partial download must never replace or masquerade as a complete package.

Keep `MAP_PACKAGE_CHUNK_SIZE = 4 * 1024 * 1024` (4 MiB). Add an optional active generation pointer to package metadata; this is schemaless data and does **not** require a Dexie version bump:

```ts
interface SavedMapPackage {
  mapId: string;
  data?: ArrayBuffer;          // v13 compatibility
  contentType: string;
  size?: number;
  chunkSize?: number;
  chunkCount?: number;
  generationId?: string;      // new active streamed generation
  updatedAt: string;
}

interface SavedMapPackageChunk {
  id: string;
  mapId: string;
  generationId?: string;      // diagnostic/back-compat field; not a required index
  index: number;
  data: ArrayBuffer;
}
```

Chunk IDs are canonical:

- legacy v14: `${mapId}:${index}`
- new streamed generation: `${mapId}:g:${generationId}:${index}`

`generationId` is an opaque `crypto.randomUUID()` and is never user-visible.

Add a focused package-write boundary (prefer `src/lib/map/smp-package-write.ts` rather than further growing `db.ts`):

```ts
interface SavedMapPackageWriteSession {
  readonly generationId: string;
  readonly writable: WritableStream<Uint8Array>;
  readonly bytesWritten: number;
  readonly chunkCount: number;
  commit(updates: Partial<SavedMap>): Promise<void>;
  abort(reason?: unknown): Promise<void>;
}

function createSavedMapPackageWriteSession(
  mapId: string,
  options?: {
    contentType?: string;
    signal?: AbortSignal;
    onBytesWritten?: (bytes: number) => void;
  },
): SavedMapPackageWriteSession;
```

Required behavior:

- accept arbitrary stream chunk boundaries and coalesce sequentially into fixed 4 MiB IndexedDB rows;
- keep at most one filling chunk plus one currently persisted chunk in app-owned buffering; never use `Promise.all()` across package chunks;
- stage under the new generation without changing active `mapPackages` metadata;
- `commit()` is the single visibility point: in one short Dexie transaction, verify the map still exists and cancellation has not won, then write **one consistent metadata set** — package record `{ contentType, size (final byte count), chunkSize, chunkCount, generationId }`, map updates including `smpSize = size`, and removal of the v13 `data` field (a stale whole-buffer `data` would win the read order and permanently serve the old package) — and deletion of legacy `${mapId}:${index}` chunk rows for the map (legacy rows are not generations; leaving them leaks quota and risks ambiguity). `hasSavedMapSmpPackage()` compares stored package `size` with `map.smpSize` and reports *no package* when they disagree, so commit must never write one without the other;
- cancellation is honored until that atomic promotion commits; after commit the operation is complete;
- `abort()` awaits any in-flight chunk put, then deletes only this session's staged generation rows; it is idempotent and never throws over the caller's original error; it never deletes the active package;
- after a successful promotion, delete superseded/unreferenced chunk generations for that map best-effort without hydrating their `data` (enumerate primary keys via the `mapId` index only — never the `[mapId+index]` compound index; the reason is that `index` is ambiguous across generations, so the chunk-ID string is the sole authority for generation membership, as specified in the readers section);
- on the existing interrupted-download Retry path, remove unreferenced generation rows before starting the replacement download so a prior crash cannot permanently consume quota;
- a browser crash may leave hidden orphan generation rows until retry/next successful promotion, but those rows are never active/readable/exportable.

IndexedDB transaction discipline for streaming writes:

- each chunk `put` runs as its own auto-commit transaction;
- no transaction spans a stream read or awaits a non-Dexie promise outside `Dexie.waitFor`;
- `commit()` is the only multi-table transaction and contains no stream awaits.

Legacy Blob-write helpers (`writeSavedMapPackageChunks` and equivalents) currently start with an **unscoped** `mapPackageChunks.where('mapId').equals(mapId).delete()`, which would destroy staged generations for the same map. Such helpers must scope their deletes to legacy-format chunk IDs (`${mapId}:${index}` pattern) and must not run concurrently with an active staging session for the same map; import-during-download on one map is rejected with a typed error rather than racing the staging generation.

Cross-tab download coordination remains the existing product policy and is not redesigned here; same-tab single-download protection remains required. Do not add a lease/heartbeat subsystem in #283.

### 2. Make all package readers generation-aware without breaking v13/v14

Update `getMapPackageChunkId()`, `hasSavedMapSmpPackage()`, `getSavedMapPackageSource()`, and `getSavedMapSmpBlob()` so they resolve **only the active generation's exact chunk IDs**.

Do not use `where('mapId').count()` or `sortBy('index')` to validate/hydrate a generation, because hidden old/staged generations can coexist for the same `mapId`.

Read order remains:

1. pre-v13 `SavedMap.smpBlob`;
2. v13 `SavedMapPackage.data`;
3. v14 package metadata with no `generationId` -> legacy `${mapId}:${index}` rows;
4. new package metadata with `generationId` -> `${mapId}:g:${generationId}:${index}` rows.

Existing Blob-based import/update helpers remain supported. If they replace a generated package they must explicitly clear `generationId` when writing legacy v14 chunk IDs, or be migrated to the generation helper; they must never leave metadata pointing at a deleted generation, and their chunk deletes must be scoped to legacy-format IDs as specified in the package-write boundary above.

The `[mapId+index]` compound index is retained for legacy reads but MUST NOT be used for generation reads or cleanup. The chunk-ID string is the single authority for generation membership; the `generationId` chunk column is diagnostic and is never queried.

No migration rewrites existing SMP bytes. No IndexedDB schema-version bump is required unless #279 changes the target schema before implementation.

### 3. Remove the basemap global/regional ZIP merge entirely

For `authoredLayers.length === 0`, stop using `download()` + `collectDownloadChunks()` + `mergeGlobalOverviewSmp()`/JSZip. Build one final SMP with the supported `StyleDownloader` + `Writer` APIs and drain the Writer into the staged package session from construction time.

Prefer a focused module such as `src/lib/map/smp-basemap-writer.ts` with a destination-oriented API so callers cannot accidentally forget to drain Writer output:

```ts
async function writeBasemapSmp(
  config: BuildSmpStreamConfig,
  destination: WritableStream<Uint8Array>,
): Promise<{
  skippedTiles: number;
  criticalSkipped: number;
  entryCount: number;
}>;
```

Use `BASEMAP_DOWNLOAD_CONCURRENCY = 8`. This is intentionally lower than the old `download()` helper's internal 24-way tile write path to keep the mobile network/resource window bounded.

#### Global overview in the same Writer

A single source cannot simply contain world z0–3 plus regional z4+ while retaining regional source bounds: MapLibre source `bounds` would otherwise prevent world rendering. Preserve the current visible behavior by constructing the Writer input style with separate source/layer identities **before** tiles are written:

- keep each regional source under its original source id;
- for every downloadable raster/vector source, create one collision-safe `__global_overview` source id using the same disambiguation rules already covered by the current merge tests;
- split affected layers at zoom 4: global layer `maxzoom: 4`, regional layer `minzoom: 4`, preserving existing explicit min/max zoom behavior;
- retain non-tile/unsupported/unmapped layers unchanged;
- do not duplicate inline GeoJSON sources;
- factor/reuse #279's final global-style helper if its merged version owns the equivalent transformation; there must be one canonical transformation, not parallel estimate/runtime implementations.

Then:

1. fetch/in-line the base style once with `StyleDownloader.getStyle()`;
2. construct `Writer(preparedStyle, { dedupe: false })` (`dedupe: false` is deliberate: content-deduplication requires hashing/retaining resource bytes, which would reintroduce exactly the unbounded retention this design removes);
3. start the canonical Writer-output pump into the IndexedDB package sink **before** adding any resource;
4. add sprites once;
5. when global overview is enabled, iterate world z0–3 tiles and map each yielded original `sourceId` to its prepared global-overview source id before `writer.addTile()`;
6. for `maxZoom > 3`, iterate the regional pass; **`await stream.cancel()`** on every yielded z0–3 tile stream (cancel is the producer-release mechanism; draining would waste the bandwidth this design is removing, and leaving them unread would stall the downloader on backpressure). Cancelled duplicate z0–3 regional streams count as warnings, never toward `criticalSkipped`, and are excluded from **both** the progress `downloaded` count **and** the progress `total` denominator (the regional denominator is today seeded from `countBboxTiles(map.bbox, 0, map.maxZoom, ...)` which includes z0–3; leaving them in `total` while excluding them from `downloaded` would stall the bar below 100%). Add only z4+ tiles under the original regional source id;
7. when overview is disabled, add the complete regional pass under original source ids;
8. add glyphs once;
9. finalize Writer and wait for both `finish()` and output EOF using #279's bounded terminal/cleanup rules;
10. only after Writer/output success and skipped-tile validation, promote the staged generation.

The known duplicate regional z0–3 network work remains until upstream offers caller minzoom; #283 removes its memory/ZIP cost without inventing a private upstream patch.

If global overview is enabled and `maxZoom <= 3`, write only the world pass; no regional source split/pass is required.

### 4. Reuse #279 Writer lifecycle; do not fork it

Extract/refactor #279's generic output-reader cancellation, terminal settlement, and bounded cleanup machinery into one shared internal module (for example `src/lib/map/smp-writer-output.ts`). This extraction is **mandatory**: the only acceptable exception is a written justification in the implementation PR demonstrating #279's merged seam is already directly reusable as-is, accepted during review.

The shared boundary must guarantee:

- exactly one reader is acquired for `Writer.outputStream`;
- draining begins before Writer work so backpressure cannot deadlock `addTile()`/`finish()`;
- output-reader cancellation is idempotent and is the producer-release mechanism;
- every reader/finish/cancel rejection is observed immediately;
- failure cleanup is bounded by #279's existing watchdog policy;
- caller cancellation cannot be replaced by a secondary cleanup `AbortError`;
- the streamed basemap path writes output to the package sink instead of accumulating output chunks.

#279 authored-writer regression tests must remain green after this extraction.

### 5. Keep #279 authored-layer packaging as an explicit bounded fallback

#283 does **not** redesign #279's deterministic authored-layer namespace/merge contract.

When `authoredLayers.length > 0`, preserve the exact authored package path and hard limits merged by #279, then feed its bounded final Blob to the staged package writer via `blob.stream()` and atomically promote it. Do not relax #279 limits to make a large authored map fit.

As of PR #287 those boundaries include 192 MiB combined merge input, 20,000 merge entries, 160 MiB declared/inflated aggregate payload, and 256 MiB merged output; implementation must re-read the constants actually merged by #279 and preserve them or stricter values.

This is the explicit safe fallback for authored-layer maps. Large basemap-only downloads use the new streaming path; scaling authored-layer composition beyond #279's hard bounds is out of scope for #283.

### 6. Explicit resource limits for the streaming basemap path

The final SMP byte size has **no arbitrary app hard cap** below browser storage quota. Do not use user-agent or guessed device-RAM heuristics.

Archive-metadata safety uses an entry cap in the #279 safety scale:

```ts
const MAX_BASEMAP_SMP_ENTRIES = 20_000;
```

Prefer factoring this into one canonical shared package-entry limit if #279's merged code already exposes an appropriate constant. The cap's purpose is bounding Writer central-directory/resource metadata, not payload bytes; if implementation shows the Writer metadata budget supports a higher derived limit, raise it to that derived value and document the derivation.

**Preflight enforcement is mandatory:** before the first byte downloads, compute the projected entry count for the selected configuration and fail with a typed/localized `SMP_DOWNLOAD_ENTRY_LIMIT` error instructing the user to reduce area or maximum zoom. The projection mirrors `estimateDownloadSize()`'s pass split: global `0..min(3, maxZoom)` over `GLOBAL_OVERVIEW_BBOX` **plus** regional `4..maxZoom` over the map bbox (or a single `0..maxZoom` regional count when overview is off), plus style/sprite/glyph resource entries. Note `countBboxTiles()` is currently module-private; the implementation must export it (or relocate the projection helper) so the new basemap-writer module can consume it. A mid-download failure before entry 20,001 is added is a safety net, not the primary UX; the preflight failure happens before any user bandwidth is spent. "Not bypassable" means the user cannot skip it at runtime; the 20,000 value itself may change only through the documented derivation above, never per-download.

The app-owned payload-buffer invariant is:

- 4 MiB package storage chunk size;
- sequential chunk persistence;
- at most one filling + one in-flight persistence chunk, plus the current upstream stream chunk;
- fixed tile-fetch concurrency of 8;
- no `Uint8Array[]`/`BlobPart[]` whose retained contents scale with final basemap package size;
- no JSZip in the basemap download path.

Writer central-directory/resource metadata may scale with entry count, but the 20,000-entry hard cap makes that bound finite and independent of final package bytes.

## Cancellation and failure semantics

Cancellation must remain available in Preparing, Downloading/Saving, and Finalizing states.

- Before Writer construction: no package rows become active.
- During resource download/Writer output: cancel the shared Writer output reader, stop accepting new sink bytes, observe pending failures through the bounded cleanup path, then delete this generation.
- During IndexedDB chunk write: finish/observe the current IndexedDB request, then delete all rows for the staging generation.
- During final promotion: check the signal inside the Dexie transaction before active package metadata and before map status mutation so the transaction aborts as a unit when cancellation wins.
- After promotion commits: success has won the race; do not roll back a ready package because of a late signal.

Failure from network, Writer, entry limit, storage quota, or package finalization never commits staging metadata.

Skipped-tile policy remains compatible with current behavior:

- with no global overview, every skipped regional tile is critical;
- with global overview + regional z4+, global skips and duplicate regional z0–3 skips are warnings only;
- skipped regional z4+ tiles are critical;
- for a global-only package (`maxZoom <= 3`), global skips are critical.

A critical skip discards staging and produces `status: 'error'`; no incomplete package is exposed as ready/exportable.

## Storage quota and UX

Keep the current 100 MiB large-download confirmation threshold. It is a UX warning, not a memory safety boundary.

Preflight continues to use `navigator.storage.estimate()` when available and requires the current 20% headroom (`available >= estimatedBytes * 1.2`). Because browser quota estimates and tile-size estimates are approximate, the existing explicit **Try anyway** path may bypass only this preflight warning.

During streaming persistence, an actual IndexedDB `QuotaExceededError` is authoritative: cancel Writer/output, abort staging, clean its generation, persist a localized storage-full error state, and require the user to free space/reduce the map before retry. There is no mid-download bypass of an actual quota failure.

Do not invent a browser-memory estimator. Memory/resource limits are surfaced through the 100 MiB confirmation, the non-bypassable 20,000-entry safety error, #279's authored-package hard-limit errors, and actual storage failures.

Extend ephemeral `DownloadProgress` with an optional phase if useful:

```ts
phase?: 'preparing' | 'downloading' | 'finalizing';
```

Do not add a new persistent `SavedMap.status`; existing `draft | downloading | ready | error` remains the durable model. The Cancel action stays visible throughout the active operation.

`DownloadProgress.bytes` on the streaming basemap path is the actual final SMP output bytes accepted by the package sink, not the sum of two temporary archive sizes. The existing progress contract is preserved: `total` and `downloaded` remain **tile counts** (percentage = `downloaded/total` tiles), and `bytes` remains an independent byte counter that now reports real output bytes instead of summed temporary archive sizes. When `phase` is present it is informational for UX state; it does not redefine the denominators.

## Security and privacy

- Package bytes remain local in IndexedDB; #283 adds no upload, telemetry, or remote service.
- Do not persist or log Mapbox tokens, authenticated style URLs, tile response bodies, style JSON, package bytes, or project content in error metadata/Sentry.
- Preserve same-origin tile proxy and existing style/source validation boundaries.
- Do not weaken #279's authored URL/content/resource limits.
- Generated staging IDs are opaque local implementation identifiers and contain no project/user data.
- Full local-data reset/delete must continue deleting every chunk generation for the affected map/database.

## Backward compatibility

- Existing pre-v13 `smpBlob` maps remain readable/exportable/renderable.
- Existing v13 whole-`ArrayBuffer` `mapPackages.data` rows remain readable.
- Existing v14 `${mapId}:${index}` chunk packages remain readable and require no migration rewrite.
- Newly streamed generation packages render through existing random-access SMP serving and export through the existing explicit full-Blob path.
- Existing already-generated global-overview packages with synthetic `__global_overview` sources remain valid; #283 does not rewrite stored SMPs.
- Existing SMP import behavior stays intact.
- **New user-visible restriction:** today a download's tile count is unlimited (it just takes long); #283 introduces the non-bypassable `MAX_BASEMAP_SMP_ENTRIES` preflight, so some very-large selections that previously "worked" will now fail closed with `SMP_DOWNLOAD_ENTRY_LIMIT`. The 20,000 scale is borrowed from #279's authored-merge entry budget, which is a different (smaller) budget than basemap tile entries; the documented derivation path exists to raise it if the Writer metadata budget allows.
- Export remains an explicit full-Blob consumer; making very-large export itself streaming is out of scope, but generation-aware reads must introduce no regression for package sizes the browser can currently export.

## Required TDD and automated coverage

Follow repository TDD strictly. At minimum add/adjust coverage for:

### Package sink / DB

- arbitrary source chunk boundaries coalesce into exact 4 MiB rows;
- a large logical stream (at least 512 MiB represented by repeated reusable test chunks and a non-retaining fake persistence adapter) proves retained package buffering stays within the documented fixed chunk window rather than retaining logical output size;
- a real-Dexie (fake-indexeddb) multi-chunk test asserts exact row count and per-row byte lengths for a multi-row package, proving the actual persistence layer — not only the fake adapter — materializes the expected rows;
- staging rows are invisible to `hasSavedMapSmpPackage()`, random-access rendering, and export before commit;
- active generation promotion is atomic with map `ready` metadata and produces the full consistent metadata set (package `size`/`chunkSize`/`chunkCount`/`generationId`, map `smpSize`, `data` cleared, legacy rows deleted);
- cancel/failure removes only staging and never exposes it;
- interrupted-retry cleanup removes unreferenced generation keys without hydrating chunk data;
- v13, legacy v14, and new generation reads all return byte-identical ranges/Blobs;
- active-generation validation ignores orphan/old generations for the same map;
- legacy Blob update/import after a generated package cannot leave a stale `generationId` pointer, and a legacy write scoped to legacy-format IDs leaves staged generation rows of a concurrent session intact (typed rejection of same-map concurrent import during download is also covered);
- quota failure after multiple persisted chunks leaves no active/incomplete package.

### Basemap Writer

- no-overview package streams directly and contains expected regional tiles/style;
- overview package contains world z0–3 under collision-safe global source/folder identities and regional z4+ under regional identities in **one Writer output**;
- resulting style preserves current layer split semantics, source/layer collision handling, regional initial-view bounds, attribution, raster/vector behavior, and MapLibre style validity;
- regional z0–3 duplicate streams are never added to Writer output;
- multi-source styles are handled deterministically;
- entry 20,001 fails closed before Writer accepts it;
- global-only (`maxZoom <= 3`) behavior remains correct;
- current global/regional skipped-tile warning/error semantics remain correct;
- cancellation is covered before Writer construction, during global tiles, during regional tiles, during glyph/sprite work, while output persistence is pending, during finalization, and before atomic promotion;
- reuse #279 real-Writer cancellation/backpressure watchdog tests; do not replace them with mocks only.

### Browser/E2E

Use deterministic local/mock style and tile responses; no production map service is allowed for stress coverage.

Chromium, Firefox, and WebKit must each cover:

- a representative package large enough to span many 4 MiB package rows (target >=64 MiB final output) reaching `ready` without full-package seeding shortcuts;
- cancel after multiple rows have persisted -> no ready/exportable package and successful retry;
- reload/cold-start of the resulting package through the random-access SMP reader;
- global overview at z0–3 and regional tiles at z4+ from the generated package.

Keep a smaller deterministic export regression in all three engines so generation-aware hydration/download remains covered without making CI export a huge Blob.

If Playwright cannot expose comparable heap metrics across all engines, do **not** gate on engine-specific `performance.memory`; enforce the structural fixed-buffer invariant with package-sink instrumentation/tests plus real multi-chunk browser runs.

## Repository validation required before implementation handoff

Run all affected focused tests plus the repository's normal validation:

- `npm run lint`
- `npm run test:coverage`
- `npm run build`
- `npm run build-storybook`
- React Doctor changed-file gate and full reconciliation smoke
- affected Storybook/visual checks if DownloadPanel messages/states change
- Playwright Chromium + Firefox + WebKit targeted large-package/cancel/cold-start coverage
- existing map-download, map-offline-cold-start, SMP serve/import/export, DB migration/package, and #279 authored-layer package regressions
- the PR-cycle skill's required checks/review loop

The implementation PR must include a human-QA runbook and runnable helper, following the #279 precedent:

- `docs/qa/283-bounded-smp-download.md`
- `scripts/qa/283-bounded-smp-download.sh`

The QA runbook must exercise a >100 MiB confirmed download, cancellation + retry, global overview, reload/offline rendering, export, and the visible storage/resource-limit errors using local/staging fixtures rather than production tile services wherever practical.

## Acceptance criteria

- [ ] Normal basemap download no longer calls `collectDownloadChunks()`, constructs a package-sized `Blob` before persistence, or uses JSZip to merge global/regional packages.
- [ ] Entry-cap preflight (projected entries from `countBboxTiles()`) fails before the first byte when over `MAX_BASEMAP_SMP_ENTRIES`, and the mid-download cap check remains as a non-bypassable safety net.
- [ ] Basemap package payload buffering is fixed-size and does not grow with final SMP bytes; Writer metadata is bounded by `MAX_BASEMAP_SMP_ENTRIES` (20,000 unless a documented derivation raises it).
- [ ] Global z0–3 + regional z4+ behavior is produced in one Writer output and matches current offline rendering/initial-view semantics.
- [ ] Final output streams directly into staged 4 MiB IndexedDB rows and becomes active only through one atomic promotion.
- [ ] Cancellation/failure/quota exhaustion cannot expose partial bytes as ready or exportable.
- [ ] v13, legacy v14, and new generation package storage all remain readable/renderable/exportable.
- [ ] Storage preflight, 100 MiB confirmation, non-bypassable resource limits, and runtime quota failure are surfaced clearly to users.
- [ ] #279 Writer lifecycle and authored package limits remain intact; authored-layer maps use the explicit bounded #279 fallback rather than a parallel unbounded merger.
- [ ] Chromium, Firefox, and WebKit pass deterministic multi-chunk large-package, cancellation/retry, global-overview, and cold-start tests without production network services.
- [ ] Existing offline render/export/package-integrity regressions remain green.
- [ ] QA runbook + runnable QA helper are included in the implementation PR.

## Explicitly out of scope

- changing the SMP file format;
- rewriting/migrating already-stored SMP package bytes;
- changing #279 canonical authored-layer data, namespaces, raster fetch policy, or safety limits;
- making authored-layer package composition scale beyond #279's merged hard limits;
- adding #280 SavedMap authored-layer persistence UI or #281/#282 GeoLibre work;
- eliminating the upstream regional z0–3 duplicate network requests (requires an upstream minzoom-capable API change);
- making browser export itself fully streaming;
- new cross-tab download leasing/heartbeat coordination;
- replacing IndexedDB chunk storage with OPFS or another persistence backend;
- user-agent/device-RAM heuristics.
