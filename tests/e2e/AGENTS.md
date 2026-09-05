# E2E agent instructions

These are local deltas for Playwright/E2E work under `tests/e2e/`. Root `AGENTS.md` still applies. General PR-cycle evidence interpretation lives in `.agents/skills/pr-cycle/references/qa-evidence.md`.

## General QA evidence

Use `.agents/skills/pr-cycle/references/qa-evidence.md` as the canonical rule set for stale-selector diagnosis, production-boundary probes, browser/environment substitution, engine-appropriate assertions, responsive re-resolution, failure relevance, and masked CI evidence. Keep this file limited to Playwright, screenshot, and visual-harness deltas.

## Screenshot authoring

- Screenshot specs use the `screenshot` Playwright project, which is chromium only for deterministic rendering; normal `.e2e.ts` coverage has chromium, firefox, and webkit projects.
- For a new screen screenshot spec, create `tests/e2e/{screen}.screenshots.ts`, import `VIEWPORTS` and `takeScreenshot` from `./screenshot-utils`, and use `setupMockServer` from `./mock-server` when API mocking is needed.
- Create isolated browser state with `browser.newContext()` and close it in `try/finally` (see existing screenshot specs) so one capture cannot leak state into the next.
- Run `npm run test:screenshots` to generate captures, then `npm run review:mobile` or `npm run pipeline:mobile-review` when the task calls for LLM visual review.

## Visual artifacts and baselines

- `tests/e2e/screenshots/` contains generated review artifacts and is gitignored.
- `takeScreenshot()` may also write tracked Argos artifacts under `screenshots/screenshot/`; restore incidental changes after exploratory runs unless the task intentionally changes baselines.
- Treat tracked Storybook baselines under `tests/e2e/storybook-screenshots-baseline/` as CI-environment artifacts, not as whatever a local browser happens to render.
- Use `npm run storybook:screenshots:check` for comparison. Use `npm run storybook:screenshots:baseline` only when the intended visual change itself requires a baseline update.
- If local baseline generation rewrites unrelated files, restore the pre-existing baselines and keep only intentionally changed/new stories. Do not commit broad browser/font/platform churn.
- The blocking GitHub job is `visual-regression-check`. When it fails, inspect the `visual-regression-diff` artifact and CI-rendered screenshots before changing baselines.
- When the Linux CI runner is authoritative and intended new baselines differ from local rendering, prefer the CI-produced screenshots for those specific baselines while preserving unrelated baseline files byte-for-byte.
- Re-run `visual-regression-check` after an intentional baseline update and never relax thresholds simply to hide platform drift.
