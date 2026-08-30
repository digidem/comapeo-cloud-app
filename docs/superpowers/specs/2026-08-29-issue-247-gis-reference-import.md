# CoMapeo Cloud App — Issue #247 implementation-ready spec set

Prepared from repository `origin/main` as inspected on 2026-08-27 at commit `5f5e0685cf88866773e5ed661964debf48013d14`, plus the then-current #279 implementation PR head `4c92ccf5995dbe65ed42ea2d50653695fc010e2a` solely to verify the downstream contract it promises. Before publication/implementation, re-check both exact bases because #279 was not yet merged when this spec was prepared.

This issue must be split under the repository `issue-to-spec` rule. The conversion/security foundation and its MapScreen consumer are independently mergeable and have a hard dependency seam through #280. The original #247 becomes a parent tracker and is not implemented directly.

---

# Parent tracker — issue #247

## feat(map): import KML/KMZ, Shapefile, and GPX reference formats

Status: **parent tracker — do not implement directly**

## Goal

Extend CoMapeo map authoring so common GIS reference files can be imported locally and become the same canonical authored GeoJSON layers used by direct GeoJSON import. No format gets its own renderer, persistence model, map state, or SMP representation.

## Child implementation units

- [ ] **Child A — Safe GIS reference-file conversion to canonical authored layers**
  Depends on #279 merged/green. Owns format detection, bounded XML/ZIP parsing, KML/KMZ/GPX conversion, zipped Shapefile conversion and CRS handling, dependency choices, security/privacy limits, fixtures, and the pure batch API that returns canonical `AuthoredLayer[]`.
- [ ] **Child B — Map-authoring UI integration for GIS reference imports**
  Depends on Child A **and** #280 merged/green. Owns file-picker/drag-drop wiring, localized help/errors/loading behavior, atomic draft insertion, mobile/desktop UX, and integration/E2E/visual QA. It consumes #280's canonical draft APIs and must not recreate transient `GeoJsonOverlay` state.

## Dependency graph

```text
#279 canonical AuthoredLayer + package contract
  ├──> Child A: safe GIS converters
  └──> #280: SavedMap persistence + authoring draft/recovery UI

Child A + #280
  └──> Child B: GIS import UI integration
```

Child A and #280 may proceed in parallel after #279 is merged/green. **Label eligibility differs from review eligibility:** Child A (#311) may be labeled implementation-ready once its spec is terminal P1/P2-clear, because its only dependency (#279) is merged. Child B (#312) may be fully spec-reviewed, but must **stay in the spec lane with a blocked-on-#280 comment** — it is not label-eligible until #280 merges, because agents read labels first and a prose gate in the body is not a gate. Implementation for either child must not begin until its exact start gate is satisfied on the target base.

## Durable architecture decisions

- The single import architecture is:
  `File -> bounded format conversion -> normalized GeoJSON -> #279 canonical AuthoredLayer preparation -> #280 draft/render/persistence -> #279 SMP packaging`.
- Direct GeoJSON continues through the existing #222 `readGeoJsonOverlayFile`/`normalizeGeoJson` boundary. No second GeoJSON parser is introduced.
- KML and GPX use native browser `DOMParser` plus `@tmcw/togeojson`; KMZ uses the same KML path after bounded local ZIP extraction.
- Zipped Shapefile uses the app's existing streaming ZIP reader and passes already-extracted `.shp/.dbf/.prj/.cpg` buffers to `shpjs`; `shpjs`' URL and ZIP-input paths are forbidden.
- Shapefile `.prj` is mandatory in V1. Unknown/unparseable/unsupported or grid-dependent CRS data fails closed; arbitrary numeric coordinates are never assumed to be WGS84.
- GPX is included in V1 because the chosen KML library supports it with negligible additional architecture.
- GeoPackage is explicitly deferred. Current browser-capable GeoPackage JS requires a SQLite/sql.js + WASM runtime and materially larger dependency surface, which violates this issue's lightweight-path requirement.
- Loose multi-file Shapefile selection is deferred. V1's accepted Shapefile affordance is one ZIP containing one dataset.
- Original KML/KMZ/GPX/Shapefile bytes are never persisted. Only normalized canonical GeoJSON inside `AuthoredLayer` may reach SavedMap/SMP state.
- Import performs no network requests and never resolves KML NetworkLinks, icons, schemas, linked KML, CRS definitions, or grid files.

## Parent completion

This tracker is complete when both children are merged and their cross-child integration tests are green. It must never carry `agent:ready-for-implementation` or `lane:implementation`.

---

# Child A

## feat(map): safely convert GIS reference files to canonical authored layers

Status: **implementation-ready once review gate passes**
Parent tracker: #247
Depends on: **#279 merged/green**. No dependency on #280 or GeoLibre work.

### Implementation-start gate

Before coding, update the target branch from `origin/main` and verify #279's actual merged contract exists. At minimum the base must export from its canonical authored-layer modules:

- `AuthoredLayer`
- `AUTHORED_LAYER_SCHEMA_VERSION`
- `AuthoredLayerCommitContext`
- `AuthoredLayerValidationError`
- `PrepareAuthoredLayerBatchResult`
- `MAX_AUTHORED_LAYER_JSON_BYTES`
- `MAX_AUTHORED_VECTOR_FEATURES`
- `MAX_AUTHORED_JSON_DEPTH`
- `MAX_AUTHORED_JSON_NODES_PER_LAYER`
- `MAX_AUTHORED_JSON_STRING_BYTES`
- `prepareAuthoredLayerBatch`
- `createGeoJsonAuthoredLayer`

and retain the existing #222 `readGeoJsonOverlayFile` / `normalizeGeoJson` creation boundary. If those names/signatures or schema version differ on merged `main`, stop and update this spec against the real #279 contract; do not copy/redeclare a compatible-looking local model.

## Objective

Add one pure, UI-independent import subsystem that safely converts supported reference files into the canonical vector `AuthoredLayer` representation. The subsystem performs no app-state mutation and no persistence. One top-level input file always produces exactly one canonical layer or one structured failure.

Supported V1 top-level formats:

- `.geojson` / `.json`
- `.kml`
- `.kmz`
- `.zip` containing exactly one Shapefile dataset
- `.gpx`

Explicitly unsupported here: GeoPackage, file geodatabase, loose Shapefile component selection, raster GIS containers, and server/cloud conversion.

## Dependency spike result

Use these current browser-compatible packages (facts below were verified against the actual published packages, 2026-08-29):

- `@tmcw/togeojson@^7.1.2` for KML + GPX conversion (verified: v7.1.2 is the current release; browser/ESM compatible, zero runtime dependencies, exposes incremental `kmlGen`/`gpxGen`, supports the required common KML/GPX geometries/properties, and deliberately does not follow KML NetworkLinks). GroundOverlay features are identified by the `"@geometry-type": "groundoverlay"` property marker (verified in the published dist; NetworkLink elements are likewise marked `"@geometry-type": "networklink"` and are ignored). Drop features whose properties carry that groundoverlay marker before canonicalization; never treat the marker as user data.
- `shpjs@^6.2.0` for Shapefile geometry/DBF parsing and reprojection (verified: v6.2.0 is the current release and its object API accepts `{ shp, dbf, prj, cpg }` buffers — documented in its README and implemented in `lib/index.js`). Use **only** this object API; its URL and ZIP-input paths are forbidden.
- `proj4@^2.21.0` as an explicit direct dependency so CRS preflight and `shpjs` resolve a single current projection implementation through the lockfile (verified: `shpjs@6.2.0` declares `proj4: ^2.1.4`, so `^2.21.0` dedupes to one version under normal resolution; if the lockfile ever resolves two, add an override/resolution and record it).
- Reuse the already-installed `@gmaclennan/zip-reader@^1.0.0` for KMZ and Shapefile ZIP inspection/extraction. Do not use JSZip for untrusted import archives. Note: `BlobSource` is **not** exported from the package index; it must be imported from the subpath export `@gmaclennan/zip-reader/blob-source` (verified in the package's `exports` map), or reuse the existing local random-access-source pattern in `src/lib/map/smp-serve.ts`.
- Add `@xmldom/xmldom@^0.9.12` as a **dev/type dependency only** because `@tmcw/togeojson`'s published TypeScript declarations import its `Document` type. Production code must use the browser's native `DOMParser` and must not import xmldom at runtime.

All new converter libraries must be loaded through dynamic imports from the format-specific branches. KML/GPX dependencies must not be eagerly included in the initial application entry chunk; Shapefile/proj4 dependencies must not load until a Shapefile import is attempted. The implementation PR records raw + gzip Vite chunk deltas and verifies the lockfile resolves one runtime `proj4` version.

## Public module contract

Own the new boundary in `src/lib/map/reference-layer-import.ts` (small format-specific helpers may live beside it).

```ts
export type ReferenceImportFormat =
  | 'geojson'
  | 'kml'
  | 'kmz'
  | 'shapefile-zip'
  | 'gpx';

export const SUPPORTED_REFERENCE_IMPORT_EXTENSIONS = [
  '.geojson',
  '.json',
  '.kml',
  '.kmz',
  '.zip',
  '.gpx',
] as const;

export const REFERENCE_IMPORT_ACCEPT =
  '.geojson,.json,.kml,.kmz,.zip,.gpx,application/geo+json,application/json,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,application/gpx+xml,application/zip';

export const MAX_REFERENCE_IMPORT_SOURCE_BYTES = MAX_GEOJSON_OVERLAY_BYTES;
export const MAX_REFERENCE_ARCHIVE_ENTRIES = 64;
export const MAX_REFERENCE_ARCHIVE_ENTRY_BYTES = 10 * 1024 * 1024;
export const MAX_REFERENCE_ARCHIVE_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
export const MAX_REFERENCE_XML_MARKUP_TOKENS = 200_000;
export const MAX_REFERENCE_XML_ELEMENTS = 100_000;
export const MAX_REFERENCE_XML_DEPTH = 64;
export const MAX_REFERENCE_TEXT_METADATA_BYTES = 64 * 1024;

export type ReferenceLayerImportErrorCode =
  | 'unsupported-format'
  | 'source-too-large'
  | 'read-failed'
  | 'invalid-geojson'
  | 'invalid-polygon-ring'
  | 'archive-invalid'
  | 'archive-unsupported'
  | 'archive-too-many-entries'
  | 'archive-entry-too-large'
  | 'archive-uncompressed-too-large'
  | 'archive-nested'
  | 'xml-invalid'
  | 'xml-forbidden-doctype'
  | 'xml-too-complex'
  | 'no-supported-geometry'
  | 'too-many-features'
  | 'kmz-no-kml'
  | 'kmz-ambiguous-kml'
  | 'shapefile-missing-components'
  | 'shapefile-ambiguous-dataset'
  | 'shapefile-invalid'
  | 'shapefile-unsupported-crs';

export class ReferenceLayerImportError extends Error {
  readonly code: ReferenceLayerImportErrorCode;
  readonly format?: ReferenceImportFormat;
  readonly fileName: string;
  readonly missingComponents?: readonly ('dbf' | 'prj')[];
}

export type ReferenceImportFailure = {
  index: number;
  fileName: string;
  format?: ReferenceImportFormat;
} & (
  | { kind: 'conversion'; error: ReferenceLayerImportError }
  | { kind: 'canonical'; error: AuthoredLayerValidationError }
);

export type PrepareReferenceImportBatchResult =
  | { ok: true; layers: AuthoredLayer[] }
  | { ok: false; errors: readonly ReferenceImportFailure[] };

export function detectReferenceImportFormat(file: File): ReferenceImportFormat;

export async function prepareReferenceImportBatch(
  files: readonly File[],
  context: AuthoredLayerCommitContext,
  options?: { signal?: AbortSignal },
): Promise<PrepareReferenceImportBatchResult>;
```

`detectReferenceImportFormat()` recognizes the final filename extension case-insensitively. If no supported extension matches, it **throws** `ReferenceLayerImportError('unsupported-format')` (the return type is non-optional by design; callers that need probe semantics may catch it). MIME is advisory for the picker only and never overrides an unknown/mismatched extension. `.zip` always means Shapefile ZIP; `.kmz` always means KMZ. Do not cross-sniff a failed container into another product format.

`prepareReferenceImportBatch()` is side-effect free with respect to MapScreen, SavedMap, stores, and persistence. It processes top-level files **sequentially in selection order** to bound peak memory. Direct GeoJSON delegates to `readGeoJsonOverlayFile`. Other formats convert to a GeoJSON value, then pass that value directly to #279 `createGeoJsonAuthoredLayer()` using a deterministic source name — `createGeoJsonAuthoredLayer` owns normalization internally (its #222 `normalizeGeoJson` call runs after byte measurement), so Child A must **not** pre-normalize and must not re-run #222 normalization separately for these formats; the mapping table below covers the `GeoJsonOverlayError` that call may throw. Direct `.geojson`/`.json` files are the one exception: they delegate to `readGeoJsonOverlayFile`, which owns its own normalization and error contract. After every file converts successfully, call #279 `prepareAuthoredLayerBatch()` once with the caller's original commit context so aggregate limits, reserved IDs, internal duplicate IDs, order, and canonical output are authoritative. Return no partial `layers` array on failure.

**Throwing prerequisites are wrapped, not leaked.** #222's `normalizeGeoJson()` throws `GeoJsonOverlayError` (codes `invalid`, `invalid-polygon-ring`, `read`, `too-large`, `unsupported`, `unsupported-file`), `readGeoJsonOverlayFile()` throws for all of its codes, and #279 `createGeoJsonAuthoredLayer()` calls `normalizeGeoJson()` un-guarded — it returns `{ok:false}` only for pre-normalization measurement failures and throws for everything else. This module must catch `GeoJsonOverlayError` from those calls and map it into the structured result (note `AuthoredLayerValidationError` is a plain result type, not a class — #279 returns `{ok:false, error}` rather than throwing; `AuthoredLayerValidationThrown` is the only #279 validation throw class and is not produced on this path):

- `invalid` -> `invalid-geojson`;
- `invalid-polygon-ring` -> `invalid-polygon-ring`;
- `read` -> `read-failed`;
- `too-large` -> `source-too-large`;
- `unsupported` -> `no-supported-geometry`;
- `unsupported-file` -> `unsupported-format`;
- #279 `{ok:false, error}` results -> `kind:'canonical'` failures carrying the structured `AuthoredLayerValidationError`.

The rule "a conversion that produces no geometry accepted by #222 normalization returns `no-supported-geometry`" is realized through this mapping: #222's thrown `GeoJsonOverlayError('unsupported')` becomes a structured `no-supported-geometry` failure, never an escaping exception. Every input file yields exactly one canonical layer or one structured failure; only caller cancellation (below) throws.

Content/format failures return structured results. Caller cancellation is the one exceptional control-flow case: if `options.signal` is aborted, throw its `Error` reason or a normalized `DOMException('Reference import cancelled', 'AbortError')`. Check before reading, between every async/expensive phase, after synchronous DOM/converter calls, and before returning canonical output. Stream readers are canceled when abortable; `DOMParser`/`shpjs` synchronous work is not force-interrupted, but hard resource bounds plus the post-call abort check prevent stale data from entering state.

### Layer naming

- GeoJSON/KML/KMZ/GPX: use the top-level basename with the supported extension removed.
- Shapefile ZIP: use the selected `.shp` dataset stem, not the ZIP filename.
- Trim surrounding whitespace. If the resulting name is empty, fall back to the original filename.
- Pass this value through #279 `createGeoJsonAuthoredLayer(..., { name, visible: true })`; never persist an external feature/dataset ID as `AuthoredLayer.id`.

## Global source and canonical-output bounds

- Every top-level file is rejected before parsing when `File.size > 5 MiB`. This intentionally preserves #222's conservative mobile/main-thread source cap for direct files and bounds compressed containers.
- Converted data has **no parallel #247 model cap**. #279's canonical bounds are authoritative after conversion, including its 6 MiB layer JSON cap, 50,000-feature cap, JSON string/depth/node caps, render bounds, and aggregate authored-layer limits.
- Generator conversion enforces the feature cap **as a hard failure with the converter-side error code `too-many-features` (member of `ReferenceLayerImportErrorCode`), not silent truncation**. Committing a truncated layer the user believes is complete is a data-integrity failure. Because #279 enforces 50,000 features on the **post-normalization** collection and #222's normalizer flattens KML MultiGeometry/GeometryCollections into one feature per member, the converter-side pre-normalization counter cannot exactly predict the post-normalization count. The converter therefore stops at 50,000 pre-normalization features as an early tripwire (counting yielded features after the GroundOverlay/NetworkLink marker drops, so dropped presentation constructs never consume the budget), and a post-normalization overflow still surfaces through the `kind:'canonical'` failure path from #279 — discriminated by `error.issues[].code === 'MAX_AUTHORED_VECTOR_FEATURES_EXCEEDED'`, which Child B maps to the same too-many-features UI state. Both stops are hard failures; neither silently truncates.
- A conversion that produces no geometry accepted by #222 normalization returns `no-supported-geometry` and no layer.

## Safe ZIP boundary for KMZ and Shapefile

Use `ZipReader.from(new BlobSource(file))` from the existing streaming ZIP package, importing `BlobSource` from its subpath export `@gmaclennan/zip-reader/blob-source` (it is not re-exported from the package index), or reuse the existing local random-access-source pattern from `src/lib/map/smp-serve.ts` instead. The import boundary additionally enforces:

- compressed top-level `File.size <= 5 MiB` before opening;
- classic single-disk ZIP only; reject ZIP64 (the reader exposes `isZip64`) and encrypted entries (`ZipEntry.isEncrypted`);
- STORE (`0`) and DEFLATE (`8`) only (`ZipEntry.compressionMethod`);
- no more than 64 archive entries, counting files and directories — the reader exposes no entry-count accessor, so perform a **full metadata pass over the central directory via the `[Symbol.asyncIterator]()`** (each iteration re-parses; the iterator is re-runnable) to count entries, check per-entry/aggregate declared sizes, compression methods, encryption, ZIP64, and nesting **before** any body is materialized, then run a second pass to read only the selected bodies;
- no declared or actual uncompressed entry above 10 MiB;
- no declared or actual aggregate uncompressed data above 20 MiB;
- no nested `.zip` or `.kmz` file entry; V1 nesting depth is exactly one container;
- keep the ZIP reader's CRC32, declared-size, safe-filename/path-traversal, source-bounds, and unique-entry-offset validation enabled;
- inspect metadata and aggregate declared sizes before materializing selected entry bodies (guaranteed by the two-pass structure above);
- while reading a selected entry stream, count actual emitted bytes before retaining each chunk and stop at the same per-entry/aggregate limits even if metadata lies;
- cancel/release stream readers on failure/abort using bounded cleanup; never use `Response(stream).arrayBuffer()` or another unbounded whole-entry inflate helper.

Directories, `__MACOSX` metadata, dotfiles, and unrelated resources may be ignored for dataset selection, but they still count toward archive entry and uncompressed-byte safety budgets. Never extract files to disk/OPFS as part of this issue.

## XML/KML/GPX boundary

### Text decoding and pre-DOM checks

V1 accepts UTF-8 XML only, with an optional UTF-8 BOM. Decode with `new TextDecoder('utf-8', { fatal: true })`; invalid UTF-8 is `xml-invalid`. If an XML declaration explicitly names a different encoding, reject it as `xml-invalid` rather than silently interpreting replacement characters. Non-UTF-8 XML can be a focused compatibility follow-up if field evidence requires it.

Before calling `DOMParser`:

- scan case-insensitively for `<!DOCTYPE` or `<!ENTITY`; any occurrence is `xml-forbidden-doctype`;
- perform an O(n) lexical scan counting `<` markup openings and reject on token 200,001. This is a conservative pre-DOM memory guard, not an XML validator;
- never interpolate or inject XML into application HTML.

Parse with native `new DOMParser().parseFromString(text, 'application/xml')`. A returned `parsererror` is `xml-invalid`. Then iteratively walk the parsed document before conversion and reject if it exceeds 100,000 elements or depth 64. Do not recursively traverse with unbounded call-stack depth.

The document root `localName` must be `kml` for KML/KMZ or `gpx` for GPX; otherwise fail as invalid for that format.

### KML conversion

Dynamically import `kmlGen` from `@tmcw/togeojson` and call it with `{ skipNullGeometry: true }`. Accumulate yielded features in `kmlGen`'s emission order — it iterates `Placemark`, then `GroundOverlay`, then `NetworkLink`, so features are grouped by element type rather than strict document order. Count toward the 50,000 tripwire only features surviving the GroundOverlay/NetworkLink marker drops, and stop before retained feature 50,001.

- Point/MultiPoint, LineString/MultiLineString, Polygon/MultiPolygon and KML MultiGeometry normalize through the existing #222 geometry rules; GeometryCollections are flattened by that canonical normalizer.
- Preserve ordinary useful converter properties such as names, descriptions, ExtendedData/SimpleData, timestamps, and non-executing scalar style metadata as ordinary GeoJSON properties.
- **Drop `GroundOverlay` features** identified by the converter's `"@geometry-type": "groundoverlay"` property marker before canonicalization. The current reference renderer cannot represent their image semantics; do not turn an image footprint into an apparently ordinary authored polygon and do not persist/fetch its icon URL.
- Never resolve/fetch `NetworkLink`, icon hrefs, linked schemas, external styles, or any other URL. `NetworkLink` elements are marked by the converter with `"@geometry-type": "networklink"` and are ignored (dropped, like GroundOverlay); if the file contains no locally supported geometry after drops, return `no-supported-geometry` with UI copy explaining linked KML content is not imported.

### GPX conversion

Dynamically import and iterate `gpxGen`. Preserve supported waypoint/route/track geometry and the converter's ordinary GPX properties (`name`, `cmt`, `desc`, `link`, `time`, `keywords`, `sym`, `type`, supported Garmin route/track extensions, `_gpxType`) as GeoJSON properties. Styles remain metadata only; the canonical CoMapeo authored-layer renderer owns visual styling.

GPX is first-class V1 support, not a follow-up.

## Deterministic KMZ selection

After the safe archive preflight:

1. List non-directory `.kml` entries case-insensitively using safe normalized ZIP names.
2. If exactly one **root-level** entry has basename `doc.kml` case-insensitively, select it even if other `.kml` entries exist.
3. Otherwise, if exactly one `.kml` entry exists anywhere, select it.
4. Zero `.kml` entries => `kmz-no-kml`.
5. More than one candidate without a unique root `doc.kml` => `kmz-ambiguous-kml`.

Only the selected KML body is read for conversion. Other archive resources remain inert and are never resolved, but still count toward archive limits.

## Shapefile dataset boundary

V1 accepts **one ZIP containing exactly one Shapefile dataset**. Loose `.shp/.dbf/.prj/...` picker workflows are out of scope.

### Dataset discovery

- Locate non-directory `.shp` entries case-insensitively after archive safety preflight.
- Exactly one `.shp` is required. Zero is `shapefile-missing-components`; more than one is `shapefile-ambiguous-dataset`.
- The dataset key is the selected `.shp` entry's safe directory + basename without extension. Companions match that same key with case-insensitive extension.
- `.dbf` and `.prj` are mandatory. Report the exact missing set through `missingComponents`.
- `.shx` is accepted in the archive but ignored: the selected `shpjs` object API does not require it. Its absence is not an error.
- `.cpg` is optional and passed to `shpjs` when present.
- More than one matching component of the same required/optional extension (including case-only duplicates) is an ambiguous dataset error.
- `.prj` and `.cpg` must each be <=64 KiB before reading.

### DBF bound and properties

Before invoking `shpjs`, require a structurally readable DBF header and read its little-endian record count. If the declared record count exceeds #279 `MAX_AUTHORED_VECTOR_FEATURES` (50,000), reject before full DBF/SHP conversion. A malformed header becomes `shapefile-invalid`.

Preserve DBF fields as feature properties when the values are canonical JSON-safe primitives/structures accepted by #279. Do not silently stringify arbitrary class instances, binary blobs, functions, or non-finite values, **except for the named DBF date coercion policy**: the pinned `parsedbf` (via `shpjs`) converts DBF type-`D` date columns to JavaScript `Date` instances and the DBF header's last-updated field is also a `Date`; #279's canonical JSON measurement rejects non-plain objects such as `Date`, so a raw pass-through would hard-fail every shapefile containing a date column. The implementation must therefore convert DBF-derived `Date` values to ISO-8601 (`YYYY-MM-DD` for type-`D` fields) **before** canonical validation, as an explicit named coercion — not as part of a general stringify fallback. All other non-canonical values produced by `shpjs` still fail the import through the canonical validation boundary rather than being dropped or stringified without notice.

### CRS rule — fail closed

A `.prj` is mandatory even when coordinates appear to be longitude/latitude. V1 never assumes missing CRS = WGS84.

1. Decode `.prj` as bounded text and construct a `proj4` source projection from its WKT. Failure is `shapefile-unsupported-crs`.
2. Construct the transformation to WGS84 (`EPSG:4326`) locally. No EPSG/network lookup is allowed.
3. Run an app-owned `assertSelfContainedShapefileCrs(prjText, sourceProjection)` guard before conversion. Reject case-insensitive grid-resource constructs including `+nadgrids`, `NADGRIDS`, `PARAMETERFILE`, `NTv2`, and WKT2/PROJJSON-style grid-file transformation references. The **textual scan is the authoritative guard**; additionally, if the pinned proj4's runtime projection object exposes a documented grid/nadgrids list property, reject a non-empty list other than the built-in null-grid sentinel — this runtime check is a defense-in-depth addition, not a dependency: if the pinned proj4 exposes no such property, the textual scan alone is sufficient and the guard must not guess at undocumented internals. This issue registers/fetches no grid files and never catches a missing-grid error by retrying without the grid. Numeric `TOWGS84`/Helmert parameters embedded in the WKT are allowed.
4. Read the Shapefile header bbox as a cheap pre-conversion probe when the shape type provides a normal finite bbox (shape types with a defined extent; null-shape-only archives are rejected downstream by #222 as `no-supported-geometry`). Transform its corners through the same source projection and require finite WGS84 longitude/latitude output. This is a sanity guard, not the final geometry validator.
5. Dynamically import `shpjs` and call **only** its object API with already-bounded buffers: `shp({ shp, dbf, prj, ...(cpg ? { cpg } : {}) })`. Never pass a URL or ZIP buffer to `shpjs`. The returned GeoJSON passes through #279 `createGeoJsonAuthoredLayer`'s internal #222 normalization, which remains authoritative for finite/ranged coordinates, ring structure, supported geometry families, GeometryCollection flattening, and null geometry handling.

The supported CRS promise is therefore "self-contained WKT transformations that the pinned `proj4` path can transform deterministically without external grid data," not "every EPSG code." Permanent fixtures must prove at least:

- WGS84 geographic;
- Web Mercator;
- WGS84 / UTM zone 23S;
- SIRGAS 2000 / UTM zone 23S;

against known expected WGS84 coordinates with absolute longitude and latitude error <= `1e-5` degrees at every control point. Add one unsupported/grid-dependent CRS fixture that fails closed. If the current pinned libraries cannot pass this matrix accurately, implementation hard-stops for a spec/architecture update; do not weaken the CRS rule or silently treat projected numbers as WGS84.

## Privacy/security invariants

- Conversion is fully client-side; no service/Worker endpoint is introduced.
- The module itself performs no `fetch`, XHR, image loading, dynamic URL import, or DOM insertion from imported content.
- `shpjs` is never given a URL or ZIP input; KML resource URLs are never dereferenced.
- No online EPSG lookup, CRS registry call, grid download, KML NetworkLink, icon request, external schema/style request, or cloud conversion is permitted.
- Do not send raw file bytes, XML, coordinates, DBF rows/properties, `.prj` text, or converted GeoJSON to Sentry/telemetry/logging. Diagnostic events may contain stable error code, format, top-level byte counts, archive entry counts, and aggregate sizes. User-visible filename may remain in local UI state but must not be added to telemetry by this issue.
- Original source bytes/file handles are discarded after conversion and never become `AuthoredLayer`/SavedMap/SMP data.

## Performance/compatibility

- Top-level files are processed sequentially; no parallel Shapefile/KML conversion inside one batch.
- Use streaming archive extraction with emitted-byte accounting.
- Use `kmlGen` / `gpxGen` rather than the whole-collection convenience APIs so the 50,000-feature guard is enforced during conversion.
- No Web Worker is required in V1. The 5 MiB source cap, XML token/DOM caps, bounded archive extraction, generator conversion, Shapefile DBF preflight, dynamic imports, and #279 canonical bounds are the V1 responsiveness envelope.
- Required browser behavior is the repository's Playwright Chromium/Firefox/WebKit matrix. If the existing ZIP reader's browser decompression path fails in any supported browser, this child is blocked until a bounded browser-safe replacement is chosen; do not fall back to unbounded JSZip extraction.

## Fixtures

Create `tests/fixtures/reference-import/` with small, repository-owned/generated fixtures plus a README describing how each was produced. Do not add third-party licensed GIS datasets merely to exercise parsers.

Required fixtures include:

- mixed-geometry KML with ExtendedData + MultiGeometry;
- GPX waypoint, route, and track;
- valid KMZ with root `doc.kml`;
- KMZ with one nested KML and no root `doc.kml`;
- ambiguous/no-KML KMZ variants;
- Shapefile ZIP in WGS84 with DBF properties;
- Web Mercator, WGS84/UTM 23S, and SIRGAS 2000/UTM 23S Shapefile variants with known control coordinates;
- missing DBF, missing PRJ, duplicate/multiple dataset, and unsupported CRS variants;
- tiny synthetic archive-limit/malformed fixtures. Prefer metadata-patched tiny archives over checking in huge bomb files.

## Required tests

Add focused unit/integration coverage around the pure module, including:

- extension detection and mismatch/unsupported behavior;
- exact 5 MiB source boundary;
- direct GeoJSON uses the existing #222 parser/normalizer and preserves its failure behavior;
- KML point/line/polygon/MultiGeometry normalization, null-feature skip, property retention, GroundOverlay drop;
- GPX waypoint/route/track conversion and properties;
- malformed XML, wrong root, invalid UTF-8, non-UTF8 declaration, DOCTYPE/ENTITY, markup token limit, DOM element/depth limits;
- `globalThis.fetch` spy remains uncalled, along with `XMLHttpRequest` (constructor + `open`/`send`), `Image`/`new Image()` loading, and dynamic URL import (`import(/* url */)`), for valid/malicious KML, KMZ, GPX, and Shapefile imports, including NetworkLink/icon/schema href content;
- KMZ deterministic `doc.kml`/single/none/ambiguous selection;
- archive max entries/per-entry/aggregate exact boundaries; actual emitted bytes exceeding declared metadata; nested archive; ZIP64; encryption; unsupported compression; bad CRC; path traversal;
- one Shapefile dataset discovery, exact missing companion reporting, duplicate components, `.shx` optional behavior, `.cpg` pass-through, metadata size bound;
- DBF >50,000 records rejected before `shpjs` invocation;
- WGS84, Web Mercator, WGS84 UTM 23S, SIRGAS UTM 23S reprojection accuracy; unsupported/grid-dependent CRS fail closed;
- DBF JSON-safe attribute preservation and canonical rejection of unsupported property values;
- mixed supported geometry output continues through #222 normalization;
- feature 50,001 stops conversion before a larger collection is materialized;
- #279 per-layer/aggregate canonical limit failures are surfaced as `kind:'canonical'`, not reimplemented locally;
- multi-file batch preserves input order, is all-or-nothing, and exposes no partial success array;
- caller abort before read, during archive stream, between files, and after a synchronous converter call; no stale successful result after abort;
- no unhandled promise rejections/resource leaks after failure/cancel;
- dynamic-import/build regression proving converter packages are not statically reachable from the initial app entry and recording actual Vite bundle deltas.

Run repository-required TDD plus targeted tests, full unit/coverage, lint/types/format, build, and relevant cross-browser tests for archive/browser primitives.

## Acceptance criteria

- [ ] `.geojson/.json`, `.kml`, `.kmz`, zipped Shapefile, and `.gpx` each convert locally into one canonical #279 vector `AuthoredLayer` with no new renderer or persistence type.
- [ ] Direct GeoJSON still uses #222's parser/normalizer rather than a replacement path.
- [ ] KML/GPX conversion uses native DOMParser + `@tmcw/togeojson`; KML external resources/NetworkLinks are never fetched and GroundOverlay image features are not misrepresented as ordinary authored polygons.
- [ ] KMZ extraction is bounded and selects KML deterministically; no/ambiguous KML fails clearly.
- [ ] Zipped Shapefile requires one `.shp` dataset plus `.dbf` and `.prj`, preserves safe DBF properties, treats `.shx` as optional for this parser, and never uses `shpjs`' URL/ZIP path.
- [ ] Missing/invalid/unsupported/grid-dependent CRS fails closed; WGS84, Web Mercator, WGS84 UTM 23S, and SIRGAS UTM 23S fixture transforms are correct within documented tolerance.
- [ ] Source, archive, XML, feature, and canonical-model resource bounds are enforced before/while expensive materialization where specified.
- [ ] A failing file or canonical batch produces no partial layer array/state mutation.
- [ ] Import code performs zero network requests and emits no raw geographic/file content to telemetry.
- [ ] Converter dependencies are lazy chunks, not initial-entry dependencies; actual build delta is documented.
- [ ] GeoPackage/FileGDB/loose Shapefile import is not incidentally introduced.
- [ ] All required unit/coverage/lint/type/build/browser gates pass.

## Out of scope

- MapScreen picker/drop UI and user-visible error localization (Child B).
- SavedMap/Dexie persistence and recovery (#280).
- GeoLibre integration (#281/#282).
- GeoPackage, FileGDB, SQLite/sql.js/WASM/GDAL runtimes.
- Loose multi-file `.shp/.dbf/.prj` picker workflow.
- Editing imported geometry.
- KML presentation/style fidelity or GroundOverlay image rendering.
- NetworkLinks or any external-resource resolution.
- Importing GIS features as observations, alerts, cases, or project records.
- Source-file round-tripping/persistence.
- Any new SMP source/persistence representation.

---

# Child B

## feat(map): integrate GIS reference imports into map authoring UI

Status: **spec-reviewed; NOT label-eligible until #280 merges**  
Parent tracker: #247  
Depends on: **Child A merged/green + #280 merged/green** (and therefore #279 transitively). Per the issue-to-spec label rule, #312 stays `lane:spec` with a blocked-on-#280 comment until #280 is merged; only then do `agent:ready-for-implementation` + `lane:implementation` apply.

### Implementation-start gate

Before coding, update from the actual target `origin/main` and verify:

1. Child A exports `REFERENCE_IMPORT_ACCEPT`, `prepareReferenceImportBatch`, `ReferenceLayerImportError`/stable error codes, and its limit constants exactly as reviewed.
2. #280 has replaced long-lived transient `GeoJsonOverlay` draft state with its canonical authored-layer draft/recovery model and exports/owns the append validation context used by Add/import, including `AuthoredLayerDraftEntry` and `buildAuthoredLayerCommitContext` (or the exact merged equivalent named by #280).
3. The normal simple Add/direct GeoJSON path already commits through #279 canonical preparation, not a parallel overlay array.

If any prerequisite is absent or materially renamed on `main`, stop and update this spec against the merged contract. Do not recreate #280's draft model or reintroduce `GeoJsonOverlay[]` solely to make #247 work.

## Objective

Expose Child A's supported formats through the existing **Reference data / Add layer** authoring experience on desktop and mobile, then atomically append successful canonical layers into #280's authoritative draft. After insertion, KML/KMZ/Shapefile/GPX layers behave exactly like direct GeoJSON layers for rendering, visibility, ordering, remove, save/reopen, and SMP packaging.

This issue contains no format parser and no persistence/package implementation.

## UI behavior

### Picker and help

Use Child A `REFERENCE_IMPORT_ACCEPT` on the existing visible file input. Keep `multiple` selection.

Default English copy (message IDs are implementation-owned and extracted to en/pt/es):

- section title: **Reference data**
- add action: **Add reference file**
- loading action/status: **Adding reference data…**
- help: **GeoJSON, KML, KMZ, Shapefile (.zip), or GPX. Files stay on this device.**
- limit help: **Up to 5 MB per file. Compressed archives may expand up to 20 MB.**
- map drop hint: **Drop reference files to add them**

The mobile path always includes the visible picker; drag/drop is additive desktop behavior only.

### Import concurrency and capacity

Only **one reference-import batch may be active at a time**. While a batch is active:

- the file input remains disabled/`aria-busy=true`;
- the label exposes the loading accessible name;
- map drag/drop must not start/queue a second converter batch; `dropEffect` is not offered as copy while busy and no files are silently queued;
- existing map pan/zoom/bounds interactions remain available except for the transient drag overlay itself.

This serialization **retires the existing multi-batch machinery**: the current handler's `referenceOverlayImportsRef` (Set of tokens) and `referenceOverlayReservedSlotsRef` (a numeric slot counter) exist to let concurrent imports share the loading flag and capacity preflight, and they become dead state under the one-batch rule. Child B removes both refs and their accounting rather than leaving a half-migrated dual path, and replaces them with the single batch controller described below.

Retain the existing #222 simple-reference UI cap of **10 authored reference layers**. This UX cap is deliberately smaller than #279's model-safety cap and is not widened by this issue. The cap counts **all draft entries shown in the simple Reference data control — valid layers and invalid recovery placeholders alike** — so the control never displays more than 10 rows; invalid placeholders do not add capacity, they occupy it, and they continue to block Save/Download according to #280. Before conversion begins, compute remaining capacity as `10 − (current valid + invalid draft entries)`; if `files.length > remaining`, reject the whole selection with the existing localized cap error and start no conversion. If #280 has already extracted the legacy 10-layer rule into a named helper/constant, import that exact owner; if it has not, Child B **owns and exports** the constant (promoting the current private `MAX_REFERENCE_OVERLAYS` from `MapScreen.tsx`) rather than leaving a second private copy.

### Atomic draft insertion

For a selection/drop:

1. Capture project/authoring generation identity exactly as the current #222 import flow does so results cannot land after project change/unmount.
2. Build #280 append context from **current unsaved** map fields/draft entries. `minZoom/maxZoom` and reserved IDs must come from #280's canonical helper, not storage or a stale snapshot.
3. Start one `AbortController` owned by the UI batch. Abort it on project change/unmount and ignore the resulting cancellation without showing a file-content error.
4. Call Child A `prepareReferenceImportBatch(files, context, { signal })` once.
5. Re-check project/generation identity before mutation.
6. On `{ ok:true }`, append **all** canonical layers to #280's authoritative `draftEntries` in input order in one state mutation.
7. On `{ ok:false }`, append nothing. Surface the first deterministic failure; the underlying result remains structured for tests/debugging.
8. Do not generate IDs in the UI; Child A/#279 owns new-layer UUIDs.

Visibility/remove/reorder/style handling after insertion is entirely #280/#279 behavior. No format field is persisted on the layer and there are no KML/Shapefile-specific render branches.

### Source names

Display the canonical `AuthoredLayer.name` generated by Child A. Do not append format badges or preserve an additional original-source model in V1. Tooltips/accessibility names may include the same safe layer name. **This is an intentional visible change for the existing direct-GeoJSON path**: today the layer name is the full filename (`name: file.name`); Child A strips the extension, so existing unit-test assertions, Storybook stories, and tracked screenshot baselines that embed the old names must be updated in the Child B PR (expected baseline churn, not drift). Two Shapefile ZIPs each containing `data.shp` will produce two layers both named "data"; that ambiguity is accepted for V1 — users distinguish by visibility/order as with any duplicate layer name.

## Error mapping

Never render raw parser exception text. Map stable Child A/#279 codes to localized actionable copy. **The mapping must cover the full Child A error-code union**, including the two #222-derived codes the existing UI already distinguishes: `invalid-geojson` (existing message `referenceOverlaysInvalid`) and `invalid-polygon-ring` (existing message `referenceOverlaysInvalidPolygonRing`) — a malformed `.geojson` or bad ring must not regress to a generic state, and the existing `MapScreen`/`GeoJsonOverlayControl` tests for those branches are updated, not deleted. At minimum provide distinct states equivalent to:

- unsupported format: **Choose a GeoJSON, KML, KMZ, Shapefile ZIP, or GPX file.**
- source too large: **{name} is larger than 5 MB.**
- read failure: **{name} could not be read.**
- invalid GeoJSON content: preserve the existing localized invalid-GeoJSON state.
- invalid polygon ring: preserve the existing localized invalid-ring state.
- too many features: **This file has more than the supported number of features.**
- archive safety limit: **This archive exceeds safe extraction limits.**
- invalid XML/KML/GPX: **This {format} file could not be read.**
- forbidden/complex XML: **This {format} file is too complex or uses unsupported XML features.**
- no supported local geometry: **This file has no supported geometry to display. Linked KML resources are not imported.**
- KMZ no KML: **This KMZ contains no usable KML file.**
- KMZ ambiguous: **This KMZ contains multiple possible KML files.**
- Shapefile missing companions: **This Shapefile ZIP is missing: {components}.**
- Shapefile multiple datasets: **This ZIP contains more than one Shapefile dataset. Import one dataset per ZIP.**
- Shapefile CRS: **This Shapefile projection could not be safely converted to WGS84.**
- canonical size/complexity failure: **The converted layer is too large or complex to add.**
- too-many-features state: **This file has more than the supported number of features** — discriminated from generic converted-too-large by `error.issues[].code`: `MAX_AUTHORED_VECTOR_FEATURES_EXCEEDED` → too-many-features; `JSON_MAX_BYTES` / `JSON_MAX_DEPTH` / `JSON_MAX_NODES` / `JSON_MAX_STRING_BYTES` / `JSON_UNSUPPORTED_VALUE` → converted-too-large/complex; `MAX_AUTHORED_LAYERS_JSON_BYTES_EXCEEDED` / `MAX_AUTHORED_LAYERS_EXCEEDED` / `ID_COLLISION_RESERVED` / `DUPLICATE_ID_WITHIN_BATCH` → the aggregate/cap state.
- 10-layer cap: preserve the existing localized retained-layer-cap behavior.

`{format}` interpolation is always available for converter failures: Child A populates `format` on every failure once detection has succeeded, and detection failure itself maps to the `unsupported format` state which needs no `{format}`. `missingComponents` may be rendered as the literal file extensions `.dbf` / `.prj`; do not expose internal exception stacks. Preserve the current behavior that an error is visible in controls when controls are open and uses a toast when the mobile settings sheet is closed/unavailable. Later imports must not let an earlier asynchronous UI result overwrite the newest outcome.

**Cancellation discrimination:** Child A signals caller cancellation by throwing with `name === 'AbortError'` (its own `DOMException` or the signal's reason). Child B catches, checks `error.name === 'AbortError'` before deciding anything is a file-content error, and silently ignores cancellation (no toast, no control error state).

## Privacy UX

The help text explicitly says files stay on the device. Do not add a privacy modal or confirmation step: import is local and no source bytes are persisted. #280's existing saved/downloaded-map privacy copy remains authoritative for explaining that the resulting normalized authored layer becomes part of a saved/offline map package.

## S-P2 fix — aggregate draft byte budget owner

#279's `prepareAuthoredLayerBatch` accumulates `aggregateBytes` only across the inputs of a single call, and `AuthoredLayerCommitContext` carries only `minZoom`/`maxZoom`/`reservedIds` — pre-existing draft bytes are invisible to it. The **whole-draft revalidation against the aggregate authored-layer byte budget is owned by #280** (it owns draft state and Save): #280 must validate the full resulting draft after append and before Save/Download. Child B's responsibility ends at the 10-entry UX cap; Child A's ends at per-layer canonical limits. This sentence is recorded here so #280's spec carries the same owner before its implementation starts.

## Compatibility/persistence

- Existing direct GeoJSON picker/drop behavior remains supported through the same control and Child A's direct-GeoJSON delegation.
- Once a successful layer is appended, #280 owns save/reopen/recovery and #279 owns package generation. Child B adds no schema/migration.
- If #280 is present, non-GeoJSON imported layers must persist automatically because they are ordinary `source.type:'geojson'` AuthoredLayers. Original source bytes are unavailable after import by design.
- Existing imported SMP behavior from #128 is untouched.
- Existing GeoLibre work is untouched.

## Component/integration tests

Update the existing Reference data control and MapScreen tests to cover:

- picker accept list includes all Child A supported extensions/MIMEs;
- visible help/loading/limit text and `aria-busy` behavior;
- mobile picker remains available;
- desktop drag/drop forwards identical files to the same import handler;
- drop while busy starts no second batch and does not queue files;
- exact 10-layer capacity preflight including multi-file selection;
- component tests mock Child A to deterministically exercise one successful GeoJSON, KML, KMZ, Shapefile ZIP, and GPX result plus each UI error code; a separate MapScreen integration test imports the real Child A fixtures end-to-end so the mock cannot hide API drift; the two canonical fixtures consumed by E2E steps 2–3 are named in the test plan (`tests/fixtures/reference-import/` KML mixed-geometry fixture and WGS84 Shapefile ZIP fixture) so Child A's fixture list is guaranteed to contain them;
- successful multi-file batch appends all layers in input order in one mutation;
- one failed file/canonical result appends nothing;
- project change/unmount aborts the batch and a late converter result cannot mutate the new project;
- stable error-code-to-i18n mapping for missing Shapefile companions, CRS, ambiguous KMZ, archive limit, invalid XML, converted-too-large, unsupported format;
- no raw exception content is rendered;
- layer visibility/remove/order behavior is the same for GeoJSON and converted formats and calls #280's canonical draft operations;
- no `GeoJsonOverlay[]` parallel state is introduced.

## E2E / human QA

Add/update Playwright coverage in Chromium, Firefox, and WebKit:

1. **Desktop picker + drag/drop:** import KML, KMZ, zipped Shapefile, and GPX; verify each appears as an ordinary reference layer, renders expected geometry, can hide/show/remove, and drag/drop and picker share behavior.
2. **Mobile 375x812:** import the canonical KML fixture and the canonical zipped-Shapefile fixture through the visible picker; verify loading/error text fits, controls retain >=44px touch targets, and drag/drop is not required.
3. **Persistence after #280:** import the canonical KML fixture, save map, leave/reopen authoring, and verify the same canonical geometry/name/visibility/order; generate and preview/activate its SMP through the existing #279/#280 harness with network disabled after package generation and verify it renders like a direct GeoJSON authored layer.
4. **Atomic failure:** select a valid file plus an invalid/ambiguous archive; verify no layer from that batch is appended or saved.
5. **Security failure UX:** missing `.prj`, ambiguous KMZ, and archive-limit fixtures produce the exact actionable localized state without crash.
6. **No import network:** browser request instrumentation during KML/KMZ/Shapefile/GPX import records no import-triggered network request. Basemap traffic must be separately identified/ignored rather than making the assertion impossible.

Add/update Storybook/screenshot fixtures for the Reference data control in normal, loading, archive-limit-error, and Shapefile-CRS-error states. Capture the repository-standard desktop and 375x812 mobile views for the changed control states.

Human QA script accompanying the PR must cover the same primary happy/error paths with fixture filenames and expected visible results so a reviewer can execute it without inventing test data.

## Required validation

Use strict TDD. Run all affected targeted unit/component tests plus repository-required:

- lint / TypeScript / Prettier;
- unit + coverage thresholds;
- i18n extraction/check for en/pt/es;
- Storybook static build and relevant visual/screenshot checks;
- Playwright relevant E2E in Chromium/Firefox/WebKit;
- production build;
- React Doctor/repository PR-cycle checks for changed React surfaces;
- Child A converter/security regressions and #279/#280 shared-contract regressions on the final head/base pair.

## Acceptance criteria

- [ ] The existing Reference data picker visibly supports GeoJSON, KML, KMZ, Shapefile `.zip`, and GPX on desktop and mobile-capable browsers.
- [ ] Desktop drag/drop accepts the same formats through exactly the same batch function; mobile does not depend on drag/drop.
- [ ] Only one converter batch runs at a time and the existing 10-layer simple-reference cap is enforced atomically before conversion.
- [ ] A successful file becomes an ordinary canonical `AuthoredLayer`; no format-specific MapLibre renderer/state/persistence path exists.
- [ ] A multi-file selection is all-or-nothing and preserves input order.
- [ ] Project change/unmount/cancellation cannot append stale results.
- [ ] Missing Shapefile companions, unsupported CRS, malformed XML, ambiguous/no-KML KMZ, archive limits, source limits, unsupported format, and canonical output limits have distinct localized actionable states where specified.
- [ ] Raw parser exceptions/file contents are never rendered or logged.
- [ ] Visibility/remove/reorder/save/reopen/SMP behavior is shared with direct GeoJSON through #279/#280.
- [ ] The canonical KML fixture survives save/reopen and offline SMP preview/activation with no source-file retention.
- [ ] Import itself performs no network requests.
- [ ] en/pt/es messages, desktop/mobile screenshots, E2E, unit/coverage, build, React quality, and repository-required gates pass.

## Out of scope

- Format parsing/conversion internals (Child A).
- Changes to #279 AuthoredLayer/SMP contracts or #280 recovery/storage semantics.
- GeoPackage/FileGDB/loose Shapefile selection.
- KML style fidelity, GroundOverlay image rendering, external KML resources.
- Geometry editing.
- Importing features as observations/alerts/cases/project data.
- Source-file persistence/round trip.
- Changes to SMP import (#128) or GeoLibre (#281/#282).

---

# Critical spec-review findings already resolved

The following ambiguities in the original #247 body were resolved while producing this set:

1. **Issue size/ownership:** split into a converter foundation and UI consumer because they are independently mergeable and #280 owns the long-lived draft migration.
2. **Unmerged prerequisite:** #279 is an explicit implementation-start gate against actual `origin/main`; issue labels/PR existence are insufficient.
3. **Persistence conflict:** #247 never writes a parallel transient/persisted format model; Child B waits for #280.
4. **Conversion libraries:** exact current packages/versions and their allowed APIs are specified; `shpjs` URL/ZIP paths are forbidden.
5. **GeoPackage:** explicitly deferred because the current browser implementation requires sql.js/SQLite WASM and materially heavier dependency surface.
6. **Archive-bomb boundary:** compressed input, entry count, per-entry output, aggregate output, compression type, ZIP64/encryption, nesting, metadata-vs-actual output, CRC/path safety are all bounded.
7. **XML boundary:** UTF-8 policy, pre-DOM token guard, DOCTYPE/entity rejection, DOM element/depth caps, malformed-document detection, and no DOM insertion are explicit.
8. **KMZ ambiguity:** deterministic root `doc.kml` / sole-KML rule replaces arbitrary archive-file selection.
9. **Shapefile dataset semantics:** V1 is one zipped dataset; `.dbf` + `.prj` required, `.shx` explicitly optional for the chosen object parser, `.cpg` optional, multi-dataset ZIP rejected.
10. **CRS:** no missing-CRS assumption, no online lookup/grid fetch, explicit proj4 preflight and fixture matrix including Brazilian SIRGAS/UTM, fail-closed unsupported/grid-dependent behavior.
11. **Presentation constructs:** KML NetworkLinks are never followed; GroundOverlay image features are dropped rather than misrendered as ordinary polygons.
12. **Output/resource ownership:** #279 canonical limits are the only post-conversion model limits; Child A enforces early format-specific guards and then delegates canonical validation.
13. **Batch atomicity/cancellation:** sequential conversion, single canonical batch, no partial success array, AbortSignal contract, and Child B stale-project guard are explicit.
14. **Performance:** dynamic converter chunks, streaming ZIP reads, generator KML/GPX conversion, DBF preflight, no Web Worker V1, and build-delta evidence are explicit.
15. **Privacy:** no upload/fetch/external-resource resolution/telemetry of raw geographic data; source bytes are never persisted.
16. **UX:** exact supported formats, mobile picker requirement, one-batch-at-a-time behavior, 10-layer cap, source naming, actionable stable error mapping, and persistence expectations are explicit.

# Publication/review gate still required in repository

Per the repo skill, do **not** mark these children implementation-ready merely from this local artifact. Publication must still:

1. Re-fetch current `origin/main`, #247/#246/#279/#280 and comments; revalidate the named prerequisite APIs against the actual current #279 state.
2. Create both child issue shells with spec-lane labels.
3. Run the repository-required independent high-risk spec review (Claude Opus 5 under the current `issue-to-spec` skill), fix every P1/P2 and worthwhile P3, and re-review affected seams until terminal P1/P2-clear.
4. Run a final cross-child seam review covering dependency direction, Child A exports consumed by Child B, #280 draft ownership, atomic insertion, resource/privacy boundaries, and no duplicate persistence/render state.
5. Publish the exact reviewed bodies; label **Child A / #311** `agent:ready-for-implementation` + `lane:implementation`. **Child B / #312 stays `lane:spec` with a blocked-on-#280 comment** — it is label-eligible only after #280 merges.
6. Rewrite #247 as the parent tracker above and remove executable/spec-lane labels from the parent.
7. Update #246's dependency graph so it points to the converter child after #279 and the UI child after both converter + #280, rather than treating parent #247 as one executable node.
8. Re-read GitHub bodies/labels/comments after mutation and record concise review evidence.

Until that publication/reviewer gate is actually completed and verified, the GitHub issue set must not be represented as implementation-ready even though the technical decisions above are closed.
