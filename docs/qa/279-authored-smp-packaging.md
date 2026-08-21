# QA Script — Issue #279: Authored layer SMP packaging

PR: #287 — `feat(map): package canonical authored layers offline`

## Scope

This QA validates the authored-layer foundation added by issue #279:

- canonical authored vector and raster layer validation
- vector/raster packaging into Styled Map Package (SMP) archives
- bounded raster fetching and package-size/resource limits
- global/regional SMP merge behavior
- raster TMS-to-XYZ normalization and effective min/max zoom preservation
- bounded ZIP parsing, STORE/DEFLATE reading, CRC verification, and unsafe archive rejection
- SavedMap authored-layer schema scaffolding
- no-authored-layer regression behavior
- raw DEFLATE support in Chromium, Firefox, and WebKit

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

The script must exit with status `0` and all three phases must pass:

1. TypeScript strict type checking.
2. Authored-layer/SMP unit and integration tests.
3. `smp-deflate-raw.e2e.ts` in Chromium, Firefox, and WebKit.

Any failed test, browser assertion failure, uncaught exception, timeout caused by the implementation, or non-zero exit status after prerequisites are satisfied is a QA failure. A browser launch failure that names missing host libraries is an environment-setup failure: install the dependencies or use exact-SHA CI evidence for that browser before deciding product QA.

## Human acceptance checklist

After the automated script passes, review its output and confirm each behavior below is represented by a passing regression test. Do not accept the PR if any listed contract is missing or failing.

### 1. Canonical authored-layer data

- Vector fixtures round-trip through the strict v1 schema without losing valid geometry.
- RFC 7946 geometry `bbox` and foreign members are normalized away before persistence/package preparation.
- Raster render fragments reject unsupported `filter` values.
- SavedMap authored-layer scaffolding rejects collections above 128 layers or 20 MiB aggregate canonical JSON, matching the packaging boundary.
- Invalid, over-sized, cyclic, prototype-polluting, class-instance, and non-finite JSON payloads fail closed.

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
- The legacy `Failed to create download package: ...` error context is preserved when final Blob construction fails.

Relevant tests: `authored-layers-smp.test.ts`, `authored-smp-merge.test.ts`, `authored-style.test.ts`, `authored-writer.test.ts`, `smp-download.test.ts`.

### 4. ZIP/parser hardening

- Unsafe names/path traversal are rejected.
- Duplicate/colliding entries are rejected.
- ZIP64, multi-disk, unsupported flags, malformed EOCD/local ranges, CRC mismatch, and declared-size mismatch fail closed.
- STORE and raw-DEFLATE entries are read under per-entry and aggregate emitted-byte caps.
- A compressed bomb cannot escape the emitted-byte bound even with dishonest headers.

Relevant test: `smp-zip.test.ts`.

### 5. Cross-browser offline primitive

Confirm the Playwright output contains a passing line for:

- `[chromium] ... smp-deflate-raw.e2e.ts`
- `[firefox] ... smp-deflate-raw.e2e.ts`
- `[webkit] ... smp-deflate-raw.e2e.ts`

All three are required. A browser-specific skip or failure is not acceptable for #279.

### 6. No-authored-layer regression

Confirm the download-path tests still cover the existing package behavior when `authoredLayers` is absent/empty. Existing regional/global download behavior must remain unchanged apart from the new authored path being available to future callers.

Relevant test: `smp-download.test.ts`.

## Known limitations / intentionally out of scope

- There is no production UI for adding, editing, persisting, or re-downloading SavedMap authored layers in this PR. That is issue #280.
- GeoLibre integration is not part of this PR (#281/#282).
- `estimateAuthoredPayload` may issue one HEAD request per raster tile up to the explicit 10,000-tile cap; that is the current #279 estimator contract.
- The authored raster phase does not yet surface UI progress because there is no production caller in #279.

These are not failures for this QA unless this PR accidentally introduces the deferred consumer behavior or breaks existing download flows.

## Cleanup

The QA script should not intentionally modify tracked files. If local Playwright/visual tooling leaves generated artifacts, verify them before deleting and restore only incidental generated changes. Never reset unrelated working-tree changes.

## QA result record

Record the following in the PR or handoff note:

- tested commit SHA:
- tester:
- date:
- automated QA script: PASS / FAIL
- Chromium DEFLATE: PASS / FAIL
- Firefox DEFLATE: PASS / FAIL
- WebKit DEFLATE: PASS / FAIL
- human checklist: PASS / FAIL
- notes / defects found:

The implementation is ready to merge only when all applicable items above pass and any discovered defects have been resolved through the normal PR cycle.
