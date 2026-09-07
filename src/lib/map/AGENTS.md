# Map and SMP agent instructions

These rules are local deltas for work under `src/lib/map/`. Root `AGENTS.md` still applies. Detailed shipped behavior and QA evidence for authored SMP packaging lives in `docs/qa/279-authored-smp-packaging.md` and the matching `tests/unit/lib/map/` regression suites.

## Resource bounds

- Enforce count, byte, node/depth, and output limits **before** avoidable expensive parsing, materialization, network work, or allocation whenever the contract permits early rejection.
- Preserve defense-in-depth bounds at later allocation/output layers even when an earlier validator normally enforces the same ceiling.
- Validation of untrusted JSON-like input must not execute accessors/getters. Use descriptor/reflection-safe reads where the current parser contract does, and convert reflection/proxy failures into bounded structured errors rather than running candidate code.
- Do not mechanically parallelize deliberately serial work when serialization is part of cumulative resource accounting, deterministic ordering, or fail-fast behavior.

## Deterministic packages

- Authored/SMP archive output that is specified as deterministic must remain invariant across wall-clock timezone and semantically equivalent input ordering, not only repeated calls in one process.
- Use canonical UTC-based metadata/timestamps where the format permits them, and keep entry/folder ordering deterministic.

## Parser compatibility

- ZIP/SMP compatibility exceptions must be exact, narrow, fail-closed outside the documented form, and protected by regression tests.
- Validate local-entry structure against central-directory/layout metadata; do not broaden parser tolerance merely to accept malformed packages.

## Offline symbols

- Preserve the explicit text-versus-icon resource distinction: text may use MapLibre browser-local TinySDF glyph fallback when packaged glyphs are unavailable, while authored icons require sprite resources.
- A missing glyph resource must continue to surface as a failed request when that failure is what allows MapLibre to use its local TinySDF fallback; do not turn it into a successful empty PBF that suppresses fallback.
- Until an explicit sprite ownership/packaging contract lands, do not silently accept authored icon properties that would produce syntactically valid but broken offline packages. The current rejection is enforced in `src/lib/schemas/authored-layer.ts`; keep that schema aligned with this offline-resource contract.

## Cancellation

- Cancellation must interrupt terminal/finalization waits as well as active fetch/read/write work. An already-cancelled operation must not remain blocked for a full watchdog/settlement timeout when the current contract provides a bounded abort path.
