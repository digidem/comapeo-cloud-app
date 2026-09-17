# QA Result Record — PR #361, docs/qa/280.md

- tested commit SHA: 2b9eef12917b4f64353e47921ca0526ad0ad6a15
- live base-tip SHA: 4787e9b (main at time of QA; re-verify before merge)
- tester/date: Hermes orchestrator (agent-driven live preview), 2026-09-16
- `scripts/qa/280-authored-layer-persistence.sh`: PASS (QA280_EXIT=0; lint/i18n, unit 250/250, build, chromium+firefox 6/6, WebKit 3/3, offline cold-start 6/6, screenshots 2/2)
- Chromium save/reopen: PASS (automated e2e + live preview)
- Firefox save/reopen: PASS (automated e2e)
- WebKit save/reopen: PASS (automated e2e, headed-under-Xvfb workaround)
- Chromium canonical vector offline Preview/activation: PASS
- Chromium canonical raster offline Preview/activation: PASS
- Firefox production offline lifecycle: PASS
- desktop visual review: PASS (screenshots: /tmp/pr361-liveqa/desktop-edit-open.png, desktop-invalid-recovery.png)
- 375×812 visual review: PASS (mobile-with-layer.png; no horizontal clipping, privacy copy readable, actions reachable)
- live PR preview desktop QA: PASS (details below)
- live PR preview mobile QA: PASS (details below)
- notes / defects found: none. Earlier probe found the react-map-gl 8.1.1 / maplibre v6 camera-event crash and the worker-URL 404; both fixed in commit 2b9eef1 and re-verified.

## Live preview walkthrough evidence (agent-driven, chromium via Playwright, prod build on 127.0.0.1:52780)

Checklist item → result:
1. Add GeoJSON → hide/show → reorder with second layer → save → reopen: PASS (order persisted: qa-layer-b.geojson first after move-up; survives save+reopen)
2. Privacy/offline-package copy readable, not clipped: PASS (desktop + mobile; copy renders once a layer exists, by design)
3. Remove + Save → reopen: PASS (removed layer stays absent; 1 entry remains)
4. Future/corrupt row (app-written canonical layer + `{fromTheFuture}` raw entry): PASS — valid layer renders at its position, invalid row shows safe bounded name "Future Layer" + removal guidance, Save AND Download disabled while invalid remains, Cancel leaves stored row byte-for-byte identical
5. Remove invalid → save → reopen: PASS (recovery persists; stored row contains only the canonical layer)
6. Malformed outer row (`layers: "not-an-array"`): PASS — "Map data could not be opened" shown, no partial draft/write (stored row untouched)
7. Imported SMP row: PASS — no "Edit layers" button on imported-origin rows
8. Offline package Preview/activation: PASS (automated stage-8 e2e 6/6; live manual offline walk covered by automated suite)
9. 375×812 repeat: PASS — no horizontal clipping, all actions reachable in bottom sheet, privacy copy readable

Visual review of screenshots (agent vision): desktop edit-open, desktop invalid-recovery, mobile with-layer — all layouts clean, no clipping, actions reachable, error styling correct.

## maplibre v5 → v6 migration QA (addendum)
- prod build emits self-contained `dist/assets/maplibre-gl-worker-*.js`; served HTTP 200 under `vite preview` (worker-asset check in QA logs)
- canvas pixel assertions (`countCanonicalAuthoredColors`) in `map-offline-cold-start.e2e.ts` pass 6/6 on chromium+firefox — a worker 404 or blank canvas fails these (verified: pre-fix runs failed 4/6)
- worker wiring covered by unit tests: `tests/unit/lib/map/maplibre-worker.test.ts` (setWorkerUrl called with the worker URL), plus `smp-serve` / `authored-layers-smp` suites
- react-map-gl 8.1.3 camera-event compatibility verified live: fitBounds/pan flows exercised in the walkthrough above with zero page errors
- WebKit 3/3 e2e pass at final head (headed-under-Xvfb workaround)
