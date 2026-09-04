# E2E agent instructions

These are local deltas for Playwright/E2E work under `tests/e2e/`. Root `AGENTS.md` still applies. General PR-cycle evidence interpretation lives in `.agents/skills/pr-cycle/references/qa-evidence.md`.

## Diagnose the current UI

- Treat skipped-test TODOs, selectors, and old failure comments as historical evidence, not canonical product state.
- Before classifying a missing locator as a production regression, inspect the current trace, accessibility tree, DOM, and user-visible result.
- If the current product flow works and only an old locator has drifted, update/follow up the harness instead of changing production code to satisfy obsolete hooks.

## Exercise production boundaries

- Prefer the actual public/product path over a weaker mock or raw platform primitive when the production implementation can be exercised directly.
- Direct probes of an exact deployed artifact may supplement UI QA for a narrow runtime/protocol invariant, but they never replace the surrounding real UI flow.

## Browser evidence

- Distinguish browser-host dependency failures from application failures. Missing GTK/WebKit/GStreamer/codecs or equivalent launch prerequisites are environment limitations.
- Exact-SHA CI may substitute for a locally unavailable engine only when that engine ran the relevant test on the same integrated revision; inspect masked/`continue-on-error` outcomes rather than trusting a green wrapper.
- Keep the strongest reliable assertion per engine. Stable pixel/canvas assertions may remain engine-specific while other engines preserve lifecycle, persistence, protocol, and user-visible behavior coverage.

## Responsive flows

- After changing viewport/layout, reacquire controls for the current responsive UI. Do not assume a desktop-only element remains mounted or visible after resize.
- Drive the actual mobile/tablet navigation path rather than hidden desktop controls.

## Failure relevance

- Scope console/network failure assertions to errors relevant to the behavior under test while still surfacing unexpected uncaught application failures.
- Known unrelated mock-server gaps are not evidence that the changed feature failed; fix the mock when it belongs to the tested boundary, otherwise make the relevance boundary explicit.
- Never globally suppress errors merely to make a test green.

## Visual artifacts

- `tests/e2e/screenshots/` contains generated review artifacts and is gitignored.
- `takeScreenshot()` may also write tracked Argos artifacts under `screenshots/screenshot/`; restore incidental changes after exploratory runs unless the task intentionally changes baselines.
- Storybook visual baselines are CI-environment artifacts. Use `npm run storybook:screenshots:check`; update baselines only for intended visual changes, inspect `visual-regression-diff` on CI failures, and never relax thresholds simply to hide platform drift.
