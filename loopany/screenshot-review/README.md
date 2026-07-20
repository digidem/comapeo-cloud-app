# Screenshot Diff Review

## Spec
Review the UI for visual regressions whenever rendering code changes.

The **workflow** (pre-stage) gates on git: it compares HEAD + working tree against
the last-reviewed commit (`prev.sha`) and stays silent when no UI-relevant file
(`src/**` .tsx/.ts/.css, `*.screenshots.ts`, tailwind/global CSS) has changed. Only
when UI code changed does it escalate to the agent and advance the cursor. This
avoids regenerating 41 screenshots + LLM-reviewing on every quiet scheduled tick.

When escalated, the **agent** must:
1. Generate screenshots via the **working path** (NOT `npm run dev` — it crashes with
   ENOSPC): `npm run build` then `VITE_PREVIEW=1 npm run test:screenshots`. Output
   lands in `screenshots/screenshot/*.png` (flat, theme-suffixed — Argos layout).
2. Visually review those PNGs by reading them directly and comparing against the
   baseline inventory in Current understanding. Do **not** rely on `npm run review:mobile`
   — it reads the defunct `tests/e2e/screenshots/{mobile,desktop}/` layout and always
   errors. Argos cloud diffing runs separately on CI (needs `ARGOS_TOKEN`).
3. Alert only on genuine app regressions; stay silent / mark clean otherwise.

Products use front-matter: `type: clean | regression`, with `date: YYYY-MM-DD`.

- `clean` — no visual changes detected
- `regression` — visual differences found, flagged for review

## Current understanding
The screenshot pipeline has migrated to **Argos CI**. `npm run test:screenshots`
(`playwright --project=screenshot`) now calls `argosScreenshot()` and writes PNGs to
`screenshots/screenshot/*.png` (+ `.argos.json` sidecars) at repo root — NOT to the old
`tests/e2e/screenshots/{desktop,mobile}/` layout. Visual diffing happens in the Argos
cloud on CI (needs `ARGOS_TOKEN`), not locally.

**Known gotchas (durable):**
1. `npm run review:mobile` (`scripts/review-mobile-visuals.ts`) is DEAD — it reads
   `tests/e2e/screenshots/{mobile,desktop}/` (confirmed absent) and always errors
   "No mobile screenshots found". Don't use it; the agent reviews the PNGs directly.
   (Would need the script re-pointed at flat `screenshots/screenshot/` to revive — a
   repo code change, out of scope for the loop.)
2. `npm run dev` (Playwright webServer) crashes with `ENOSPC: file watchers reached`
   (Vite watches too many files across worktrees). Never generate via dev — use the
   preview path below. Full generation takes ~7 min, so it does NOT fit a workflow
   pre-stage timeout; the workflow now only gates on git and the agent does generation.

**Working generation path:** `npm run build` then
`VITE_PREVIEW=1 npm run test:screenshots` — `vite preview` serves the built `dist/`
with no file watchers, avoiding ENOSPC. Produced 41 PNGs; 65 tests passed, 19 failed
(strict-mode locator issues in `mobile-audit.screenshots.ts` / `home.screenshots.ts`
where a heading matches 2 elements — test-authoring bugs, not app regressions).

**Baseline (41 screenshots, 3 themes cloud/mobile/sentinel):** alert-detail,
alerts-list, create-alert, home, home-project-empty, observation-detail(+lightbox),
observations-list, settings (each ×themes); plus mobile-* audit shots, settings-*
sub-screens, create-project-dialog, language-selector, archive-sidebar, home-skeleton.
No map screen is captured, so the current map-related working-tree edits (attribution
position, storage warnings in MapContainer/MapAuthoringCanvas) are not covered here.
Spot-checked mobile-home-project + observations-list-mobile: render cleanly.

## Timeline
<!-- one dated entry per run, appended below by the loop -->

### 2026-07-19 — first substantive run; pipeline drift found (type: clean, no baseline to diff)
- Workflow fell back to agent (timed out >30s). Root cause: `npm run dev` webServer
  crashes with ENOSPC file-watcher limit; generation also needs ~7 min > 30s timeout.
- Generated 41 screenshots via the preview path (build + `VITE_PREVIEW=1`). Output
  now lands in `screenshots/screenshot/` (Argos), not `tests/e2e/screenshots/`.
- `npm run review:mobile` broken: reads defunct `tests/e2e/screenshots/mobile/`.
- No prior baseline → recorded inventory above as baseline. Spot-check: no regressions.

### 2026-07-19 — evolve pass: rewrote workflow as a git gate + sharpened Spec
- Old workflow was broken: ran `npm run test:screenshots` (→ `npm run dev` ENOSPC
  crash), then dead `review:mobile`, then a bogus `/regression|fail|diff|change/i`
  regex gate (matches "change" in almost any output). Replaced.
- New workflow gates on git: compares HEAD + working tree vs `prev.sha`; silent tick
  when no UI-relevant file changed, else escalates to the agent and advances the sha
  cursor. Reports `changedCount` (declared in schema). Smoke-tested 3 scenarios clean.
- Generation + qualitative review stay with the agent (7-min build, LLM judgment) via
  the working preview path. Spec now documents that path and that `review:mobile` is dead.
