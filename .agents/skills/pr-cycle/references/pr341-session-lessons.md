# PR #341 session lessons

These notes capture reusable PR-cycle QA lessons exposed while validating issues #323 and #324. They are process guidance, not feature requirements.

## Treat skipped E2E comments and selectors as historical evidence

- A skipped test's TODO, selector set, or failure explanation can become stale while the product keeps evolving. Do not treat that text as canonical evidence that the production path is broken.
- When temporarily re-enabling a skipped E2E test, inspect its trace/accessibility snapshot/current DOM before classifying a failure. A missing locator can be selector drift even when the user-visible flow completed successfully.
- If the current product flow passes with current locators, keep the implementation PR scoped. Record the stale test as test debt or fix it in a focused follow-up instead of changing production code to satisfy obsolete hooks.

## Pair product-flow QA with direct deployed-artifact probes when boundaries differ

- A UI lifecycle can make an internal race or protocol invariant difficult to reproduce deterministically. In that case, supplement the real UI flow with a direct probe of the exact deployed production artifact rather than replacing product QA with a local mock.
- Bind the probe to the exact deployed asset produced by the reviewed SHA, exercise the real browser primitive (for example a production Web Worker), and assert protocol-level ordering, cancellation, completion, and error behavior.
- Still run the surrounding real UI workflow separately. The direct artifact probe proves the narrow concurrency/protocol invariant; the UI flow proves integration, rendering, state transitions, and user-facing behavior.

## Cross-browser substitution must be exact and explicit

- A local browser launch failure caused by missing host libraries is an environment limitation, not an application verdict.
- When local WebKit or another engine cannot run, exact-SHA CI is valid substitute evidence only if the applicable CI job actually installs that engine and runs the relevant test suite on the same integrated revision.
- Inspect the underlying job outcome when `continue-on-error` or another masking mechanism is present. A green wrapper is not enough if the browser test itself failed.
