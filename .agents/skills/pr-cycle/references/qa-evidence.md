# QA evidence

Use this reference when validating a PR through browser, deployed-preview, or human-QA evidence. It defines how to interpret evidence; `github-runbook.md` remains canonical for GitHub CLI mechanics and soft-fail inspection commands.

## Diagnose the current product, not an old harness story

- A skipped E2E test's TODO, selector, or old failure comment is historical evidence, not canonical product state.
- When re-enabling or adapting an old test, inspect the current trace, accessibility tree, and DOM before classifying a missing locator as a product regression.
- If the current product flow succeeds with current locators, do not change production code to satisfy obsolete hooks. Fix or defer the stale harness in focused test work.

## Exercise the production boundary

- Prefer the real public/product boundary over a weaker mock or underlying platform primitive when the production path can be exercised directly.
- A QA helper should generate/read/store data through the same implementation boundary users depend on, not a hand-built substitute that bypasses the changed code.
- Keep the human QA runbook synchronized with executable helpers. If a helper cannot run a required phase locally, document the exact substitute evidence and why it is equivalent.

## Direct deployed-artifact probes are supplements

A UI lifecycle can make a narrow runtime invariant difficult to reproduce deterministically. In that case, a direct probe of the exact deployed artifact is valid supplemental evidence when all of these hold:

1. the artifact is demonstrably produced by the reviewed SHA;
2. the probe exercises the real browser primitive or production artifact, not a local rewrite;
3. assertions target the narrow protocol/concurrency invariant being proved;
4. the surrounding real UI workflow is tested separately.

The probe proves the narrow invariant; it does not replace integration, rendering, state-transition, navigation, or user-facing QA.

## Separate environment failures from product failures

- A browser launch failure naming missing host libraries, codecs, GTK/WebKit dependencies, or equivalent runtime prerequisites is an environment limitation, not an application verdict.
- Preserve the failure evidence and use a correctly provisioned environment rather than weakening the product test.
- Exact-SHA CI may substitute for an unavailable local browser engine only when the relevant engine actually ran the relevant test suite on the same integrated revision.
- If the workflow masks failures with `continue-on-error` or similar behavior, inspect the underlying command outcome before counting the browser signal as passing. See `github-runbook.md` for the canonical inspection mechanics.

## Keep assertions as strong as each engine supports

Cross-browser coverage does not require identical low-level assertions when an engine or renderer makes one oracle unreliable.

- Keep strong pixel/canvas assertions where the engine provides a stable oracle.
- Preserve lifecycle, persistence, protocol, and user-visible behavior coverage in engines where pixel sampling is not trustworthy.
- Do not weaken every engine to the weakest common assertion merely for symmetry.

## Responsive QA must re-resolve the UI

When a test changes viewport or responsive mode:

- do not assume a desktop-only control remains mounted/visible after resize;
- reacquire locators and navigation affordances appropriate to the new layout;
- verify the actual mobile/tablet flow rather than driving hidden desktop controls.

## Scope failure assertions to the behavior under test

Mocked preview/E2E environments can intentionally produce unrelated network or console noise. Failure assertions should:

- fail on errors relevant to the feature, route, or invariant under test;
- still surface unexpected uncaught application errors;
- avoid treating known unrelated mock gaps as proof that the changed feature failed.

Do not globally suppress errors to make a test green; make the relevance boundary explicit.
