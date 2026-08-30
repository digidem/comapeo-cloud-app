# PR #287 session lessons

These notes capture durable PR-cycle and validation lessons that emerged while hardening issue #279. They are intended as reusable guidance for future long-running PR cycles, not as a substitute for the issue/spec itself.

## Exact-revision truth is the unit of readiness

- Treat readiness as a property of one exact `(head SHA, live base-tip SHA)` pair. A push or a target-branch advance invalidates the previous independent-review verdict and final readiness snapshot, even when the diff that changed appears unrelated.
- Read the live remote target tip, not only the PR's historical base OID. If the target branch moves and synchronization is required, merge the verified target tip into the PR branch without rebasing or force-pushing already-reviewed history unless repository policy explicitly says otherwise.
- Do not keep waiting on CI or a reviewer for a stale pair. Stop/pivot as soon as head or base movement is observed and restart the exact-pair gate.

## Review findings are hypotheses, not commands

- Adjudicate every automated/model finding against the normative issue/spec and current implementation before changing code. A reviewer can be technically plausible yet wrong for the product contract.
- Reject findings that directly contradict an explicit spec decision, and record why. Examples from #279 included proposals to add DNS/private-IP resolution preflight, change the specified basemap-estimator heuristic, or impose a deadline that would make the required per-tile HEAD estimator incomplete.
- Convert confirmed findings into RED tests before patching when practical. This was especially effective for hostile getters/proxies, raw GeoJSON preflight, ZIP descriptors, cancellation during finalization, deterministic output, and final MapLibre-style validity.
- For bot findings that are intentional design tradeoffs, reply with concrete invariants rather than generic "false positive" language. In #279, sequential ZIP-read/materialization loops were deliberately serial because parallelizing them would defeat shared cumulative byte/memory accounting and deterministic fail-fast behavior.

## Tool and provider failure is not a verdict

- A reviewer timeout, malformed wrapper result, sandbox failure, quota error, or `needs_input` result is not approval and not a code failure. Classify it as a transport/provider limitation and switch to the next allowed review path.
- When repository-tool access is unreliable but the model itself is available, a frozen exact-diff review is a valid fallback only if the diff is complete, revision coordinates are explicit, the reviewer is forbidden from assuming missing repository context, and every lane returns a terminal verdict.
- Prefer one bounded liveness probe for an unknown provider. Repeated failed probes waste quota and time without increasing confidence.

## Local browser limits must be separated from product failures

- A browser launch failure that names missing host libraries is an environment failure, not an application failure. Preserve the failure text, use exact-SHA CI on a correctly provisioned runner as the authoritative engine result, and do not weaken the product test to make a broken host pass.
- Browser screenshot pixels are not equally reliable across headless engines. In #279, Chromium provided a stable WebGL pixel oracle while Firefox reliably exercised the same offline package lifecycle but not the same canvas color sampling. Keep the strong pixel assertion where it is trustworthy and preserve lifecycle coverage in the other engine rather than replacing both with a weaker generic assertion.
- Browser compatibility tests should exercise the production path, not merely the underlying platform primitive. The useful raw-DEFLATE proof transpiles/runs the exact production `smp-zip.ts` reader in Chromium/Firefox/WebKit instead of only calling `DecompressionStream('deflate-raw')` on toy bytes.

## QA evidence should mirror the actual product boundary

- A QA helper is valuable only when it exercises the same boundary the implementation exposes. For #279, the offline round-trip test was strengthened from a hand-built ZIP fixture to actual `buildSmpBlob()` output stored in the real app package tables and reopened after the browser was switched offline.
- Keep the human QA runbook synchronized with the executable helper. If the helper cannot locally run an engine because of host dependencies, the runbook must say which exact-SHA CI result substitutes for that local phase.
- Do not claim a full integration proof from mocked internals when a public API and production reader can be exercised directly.

## Determinism requires hostile-environment tests

- Fixed timestamps are not deterministic if they are constructed in local time. Cross-timezone tests should prove the serialized bytes are invariant; use a canonical UTC instant when an archive format permits it.
- Determinism tests should vary both wall-clock context and semantically equivalent input ordering. Object/source iteration order must not influence output folder assignment or archive entry order.
- Deterministic archive generation must also cover fixed metadata and entry timestamps, not only sorted filenames.

## Resource bounds must be enforced before expensive work

- Collection count/size limits should be checked before per-entry parsing, reflection, normalization, Writer construction, or network work. A validation that eventually rejects can still be unsafe if it performs thousands of operations first.
- Structured validation should not execute untrusted getters. Use descriptor/reflection-safe access and turn proxy/reflection failures into bounded structured errors.
- Enforce defense-in-depth caps at each layer that can allocate work. The Writer path still checks the 10,000-tile maximum even when earlier enumeration already enforces it.
- Cancellation must interrupt terminal waits as well as active fetches. Finalization/watchdog waits should race the same fatal/caller-abort signal so an already-cancelled operation does not remain stuck until the full cleanup timeout expires.

## Archive parser compatibility must be explicit and narrow

- Validate local headers and data descriptors against central-directory metadata rather than trusting one side of the archive.
- Data descriptors without the optional signature are ambiguous when CRC32 numerically equals `0x08074b50`; parse both legal 12-byte and 16-byte interpretations and accept only the one consistent with central metadata and layout.
- Compatibility exceptions for a pinned Writer should be exact, regression-tested, and bounded. #279 accepts only the observed eight-zero-byte Writer extension in the precise positions produced by `styled-map-package-api@5.0.0-pre.5`; arbitrary padding remains rejected.
- Include descriptor/extension bytes in local-entry range accounting so overlap detection cannot be bypassed by bytes the parser ignores.

## MapLibre offline symbols need an explicit resource contract

- Text labels and icons are not the same offline-resource problem. Text can fall back to MapLibre's browser-local TinySDF rendering when glyph ranges are unavailable, but icons require sprite resources.
- If the feature has no sprite ownership/packaging contract, reject sprite-dependent authored icon properties rather than producing packages that are syntactically valid but silently broken offline.
- An SMP server should not turn a missing glyph into a successful empty PBF if that prevents MapLibre's local fallback. Missing glyph resources should surface as a failed request so the renderer can use its built-in fallback path.

## Command ceilings should shape validation, not weaken it

- A local full-suite or coverage command killed by the execution ceiling is not a test failure and not a pass. Do not rerun the identical broad command unchanged. Use bounded shards locally and exact-SHA CI as the terminal full-suite signal when CI already covers the canonical command.
- Always rerun the narrow changed-area suite after formatting or conflict/base synchronization, because the final published tree—not the pre-format/pre-merge tree—is what matters.

## Documentation placement

- Put feature-specific behavioral constraints in the issue/spec/QA documentation.
- Put reusable PR-cycle mechanics in `.agents/skills/pr-cycle/`.
- If documenting process lessons would widen an application PR, use a separate docs/process branch or PR rather than invalidating the implementation PR's exact-SHA gate for unrelated documentation.
