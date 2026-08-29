# QA Script — Issue #279: Authored layer SMP packaging

PR: #287 — `feat(map): package canonical authored layers offline`

## Scope

This QA validates the authored-layer foundation added by issue #279:

- canonical authored vector and raster layer validation
- vector/raster packaging into Styled Map Package (SMP) archives
- bounded raster fetching and package-size/resource limits
- global/regional SMP merge behavior
- raster TMS-to-XYZ normalization and effective min/max zoom preservation
- bounded ZIP parsing, STORE/DEFLATE reading, data-descriptor/CRC verification, and unsafe archive rejection
- deterministic and cancelable final SMP archive generation
- SavedMap authored-layer schema scaffolding
- no-authored-layer regression behavior
- production SMP ZIP-reader raw DEFLATE support in Chromium, Firefox, and WebKit
- real `buildSmpBlob()` output stored and reopened through the production offline PWA path in Chromium and Firefox

This PR intentionally does **not** expose authored-layer creation or persistence in the production UI. That consumer is deferred to issue #280. Human QA for #279 is therefore technical/package QA, not a preview click-through flow.

## Prerequisites

1. Check out PR #287 (or the exact candidate commit being evaluated).
2. Use Node.js 22+ and Bun 1.3.14 as declared by `package.json`.
3. Install dependencies with `bun install --frozen-lockfile` if needed.
4. Ensure Playwright's three browser engines and required host libraries are installed. On a Linux QA machine with package-install privileges, the simplest setup is:

   ```bash
   npx playwright install --with-deps chromium firefox webkit
   ```

   If the QA machine cannot install OS-level WebKit dependencies, use the exact candidate SHA's green GitHub Actions `build-e2e` cross-browser step as the WebKit acceptance evidence instead of treating a missing-host-library launch error as an implementation defect.

## Automated QA

From the repository root run:

```bash
bash scripts/qa/279-authored-smp-packaging.sh
```

### Expected result

The script must exit with status `0` and all five phases must pass:

1. TypeScript strict type checking.
2. Authored-layer/SMP unit and integration tests.
3. Production PWA build.
4. `smp-deflate-raw.e2e.ts` in Chromium, Firefox, and WebKit, executing the exact production `src/lib/map/smp-zip.ts` parser against raw-DEFLATE input and corruption.
5. `map-offline-cold-start.e2e.ts` in Chromium and Firefox, using actual `buildSmpBlob()` output stored in IndexedDB and reopened after the browser is switched fully offline. Chromium additionally asserts rendered authored polygon, line, point, and raster pixels.

Any failed test, browser assertion failure, uncaught exception, timeout caused by the implementation, or non-zero exit status after prerequisites are satisfied is a QA failure. A browser launch failure that names missing host libraries is an environment-setup failure: install the dependencies or use exact-SHA CI evidence for that browser before deciding product QA.

## Human acceptance checklist

After the automated script passes, review its output and confirm each behavior below is represented by a passing regression test. Do not accept the PR if any listed contract is missing or failing.

### 1. Canonical authored-layer data

- Vector fixtures round-trip through the strict v1 schema without losing valid geometry.
- RFC 7946 geometry `bbox` and foreign members are normalized away before persistence/package preparation.
- Raster render fragments reject unsupported `filter` values.
- SavedMap authored-layer scaffolding rejects collections above 128 layers or 20 MiB aggregate canonical JSON, matching the packaging boundary.
- Invalid, over-sized, cyclic, prototype-polluting, class-instance, accessor-backed, proxy-hostile, and non-finite JSON payloads fail closed.
- Raw GeoJSON is structurally bounded before normalization, so hostile/oversized candidates cannot force unbounded normalization work.
- MapLibre-invalid base, prospective, authored-only, or post-Writer final styles fail closed.

Relevant tests: `authored-layers.test.ts`, `saved-map.test.ts`.

### 2. Raster network and resource safety

- Anonymous authored raster sources require HTTPS.
- Requests omit credentials, use `no-referrer`, reject redirects, and pin the final response URL.
- Raster enumeration is capped at 10,000 tile requests.
- Individual raster responses are capped at 4 MiB.
- Aggregate authored raster bytes are capped at 96 MiB.
- Cancellation and timeout paths clean up without masking the primary failure.

Relevant tests: `authored-raster.test.ts`, `authored-payload-estimate.test.ts`, `authored-writer.test.ts`.

### 3. SMP construction and merge correctness

- Vector-only authored packages work without requiring raster Writer output.
- Raster Writer output is merged into the final package with deterministic authored folders.
- TMS sources request the flipped TMS URL but are written using the XYZ tile tuple expected by SMP.
- Effective raster `minzoom`/`maxzoom` survives replacement of the online source with Writer output.
- Global overview merging does not mutate caller-owned nested `smp:sourceFolders` metadata.
- Global/regional bounds metadata remains coherent and no `undefined` metadata is serialized.
- Equivalent inputs produce byte-identical merged SMP output regardless of wall-clock time or source ZIP entry ordering.
- Cancellation during final ZIP generation returns promptly without waiting for complete archive materialization.
- The legacy `Failed to create download package: ...` error context is preserved when final Blob construction fails.

Relevant tests: `authored-layers-smp.test.ts`, `authored-smp-merge.test.ts`, `authored-style.test.ts`, `authored-writer.test.ts`, `smp-download.test.ts`.

### 4. ZIP/parser hardening

- Unsafe names/path traversal are rejected.
- Duplicate/colliding entries are rejected.
- ZIP64, multi-disk, unsupported flags, malformed EOCD/local ranges, CRC mismatch, declared-size mismatch, corrupted data descriptors, and unexplained local-region padding fail closed.
- The pinned `styled-map-package-api@5.0.0-pre.5` Writer data-descriptor form remains readable without accepting arbitrary padding.
- STORE and raw-DEFLATE entries are read under per-entry and aggregate emitted-byte caps.
- A compressed bomb cannot escape the emitted-byte bound even with dishonest headers.

Relevant test: `smp-zip.test.ts`.

### 5. Cross-browser production SMP ZIP reader

Confirm the Playwright output contains a passing line for:

- `[chromium] ... smp-deflate-raw.e2e.ts`
- `[firefox] ... smp-deflate-raw.e2e.ts`
- `[webkit] ... smp-deflate-raw.e2e.ts`

This test executes the exact production `src/lib/map/smp-zip.ts` implementation in each browser, reads a real raw-DEFLATE ZIP entry through the bounded parser, and proves corrupted compressed input is rejected. All three engines are required. A browser-specific skip or product failure is not acceptable for #279.

### 6. Production package offline round trip

Confirm `map-offline-cold-start.e2e.ts` passes in Chromium and Firefox. The fixture must be produced by the public `buildSmpBlob()` boundary, persisted in the real app package tables, reopened after the browser context is switched offline, and complete without external requests. Chromium additionally proves authored polygon fill, line, point-circle, and raster pixels appear on the real MapLibre canvas. Firefox proves the same generated package and offline lifecycle; its headless WebGL screenshot surface is not used as a pixel oracle.

### 7. No-authored-layer regression

Confirm the download-path tests still cover the existing package behavior when `authoredLayers` is absent/empty. Existing regional/global download behavior must remain unchanged apart from the new authored path being available to future callers.

Relevant test: `smp-download.test.ts`.

## Known limitations / intentionally out of scope

- There is no production UI for adding, editing, persisting, or re-downloading SavedMap authored layers in this PR. That is issue #280.
- GeoLibre integration is not part of this PR (#281/#282).
- `estimateAuthoredPayload` may issue one HEAD request per raster tile up to the explicit 10,000-tile cap; that is the current #279 estimator contract.
- The authored raster phase does not yet surface UI progress because there is no production caller in #279.
- Authored text labels remain offline-capable, but if their `text-font` stack is absent from packaged SMP glyph resources MapLibre falls back to browser-local TinySDF glyph rendering; metrics can therefore differ from the packaged basemap font.

These are not failures for this QA unless this PR accidentally introduces the deferred consumer behavior or breaks existing download flows.

## Engineering lessons for follow-on authored-layer work

- Keep authored-layer limits at the earliest safe boundary. Count/size checks must happen before deep parsing, normalization, Writer construction, or network allocation; eventual rejection is not enough if expensive work already happened.
- Treat canonical JSON as hostile input. Do not execute accessors while measuring/validating, and convert proxy/reflection failures into bounded structured errors.
- Preserve the distinction between text and icon symbols. Text can remain offline-capable through MapLibre's local TinySDF fallback, while icons require a future explicit sprite ownership/packaging contract.
- Keep archive compatibility exceptions exact and pinned. The current Writer's descriptor/zero-extension behavior is regression-tested; do not generalize it into permissive padding acceptance.
- Test deterministic archives across timezone and input-order changes, not only repeated calls in one process. Canonical timestamps must be UTC-based.
- Cancellation must race terminal Writer/ZIP finalization waits as well as fetches. A caller abort should not wait for the full watchdog timeout.
- Cross-browser acceptance should exercise production code paths. Raw-DEFLATE support is proven through the production SMP ZIP reader; package round-trip is proven from `buildSmpBlob()` through persisted offline reopening rather than a hand-built fixture.
- Preserve explicit #279 contracts when reviewing future optimizations. The existing basemap estimator inputs and the per-tile HEAD behavior were deliberate issue decisions, not accidental implementation details.

## Cleanup

The QA script should not intentionally modify tracked files. If local Playwright/visual tooling leaves generated artifacts, verify them before deleting and restore only incidental generated changes. Never reset unrelated working-tree changes.

## QA result record

Record the following in the PR or handoff note:

- tested commit SHA:
- tester:
- date:
- automated QA script: PASS / FAIL
- Chromium production-reader DEFLATE: PASS / FAIL
- Firefox production-reader DEFLATE: PASS / FAIL
- WebKit production-reader DEFLATE: PASS / FAIL
- Chromium `buildSmpBlob()` offline PWA round trip/render: PASS / FAIL
- Firefox `buildSmpBlob()` offline PWA round trip: PASS / FAIL
- human checklist: PASS / FAIL
- notes / defects found:

The implementation is ready to merge only when all applicable items above pass and any discovered defects have been resolved through the normal PR cycle.
