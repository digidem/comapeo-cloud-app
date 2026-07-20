# Doc Drift Sweep

## Spec

Weekly documentation drift detection. Every sweep compares the project's documentation against what the code actually ships, fixes genuine staleness, and opens a PR explaining the drift.

**Documents to audit** (relative to project root):
- `README.md` — project overview, setup instructions, architecture summary
- `AGENTS.md` — AI coding workflow, commands, conventions, architecture
- `DESIGN_OVERVIEW.md` — design system reference
- `SECURITY.md` — security policy
- `WORKFLOW.md` — workflow documentation
- `docs/deployment-runbook.md` — deployment runbook
- `docs/remote-archive-api-spec.md` — API spec
- `docs/superpowers/` — any files in this directory
- `CLAUDE.md` — agent instructions

**Historical documents are not drift.** Dated spec/plan snapshots (notably
`docs/superpowers/specs/YYYY-MM-DD-*.md` and anything under `plans/`) record what
was true when they were written. Their stale paths and line references are
correct as history — never "fix" them, and don't count them as drift.

**Start from the pre-scan.** A workflow runs before this sweep and attaches a
deterministic scan of `origin/main`: the real `src/`/`tests/` structure, the
`package.json` scripts and key dependency versions, per-document broken-path and
unknown-`npm run` candidates, and the files changed since the last sweep. Use it
as the starting point instead of re-deriving it by hand — but its findings are
CANDIDATES, not verdicts: confirm each one in the worktree before changing
anything. If the scan is missing or reports errors, fall back to doing the checks
manually and note it in the sweep file.

**Verification approach** — don't just eyeball the docs:
- Run `npm test` and check output matches what docs claim
- Run `npm run build` and verify it succeeds
- Check that all referenced CLI commands in docs actually exist in `package.json` scripts
- Verify internal doc links point to files that exist
- Try the setup steps a new contributor would follow (clone, install, run)
- Cross-check API endpoint docs against actual route definitions in the codebase
- Verify dependency versions mentioned in docs match `package.json`

**What to fix vs. leave alone**:
- Fix: outdated commands, wrong paths, stale versions, broken links, missing steps, incorrect API docs
- Don't touch: style preferences, rewording for clarity (unless factually wrong), adding new documentation that doesn't exist yet
- If nothing is stale: write a clean sweep summary and stop — don't create work

**Git worktree protocol**:
1. Create worktree at `../doc-drift-sweep-YYYY-MM-DD` (outside loop folder, at repo root level)
2. Branch from `origin/main`
3. Make fixes, commit, push, open PR
4. Clean up the worktree after PR is created
5. If a previous sweep PR (`lastPrNumber` in state) is still open/unmerged, skip PR creation and just report

**State to report** — every sweep must end with:
`loopany report --state '{"driftCount":<n>,"sweepsCompleted":<n>,"lastPrNumber":<n>,"lastCommit":"<sha of origin/main audited>"}'`
`lastPrNumber` drives the skip-if-open rule above and `lastCommit` is the cursor
the pre-scan diffs from — omitting either degrades the next sweep.

**PR format**:
- Title: `docs: weekly drift sweep YYYY-MM-DD`
- Body: summary of what was checked, what was fixed (with bullet list), and drift count

**Dashboard product format** — each sweep writes a markdown file:
```markdown
---
type: sweep
title: Doc Drift Sweep YYYY-MM-DD
date: YYYY-MM-DD
---

# Doc Drift Sweep YYYY-MM-DD

## What was checked
<list of files/areas>

## Drift found
<number of fixes, or "None — clean sweep">

## Fixes applied
<bullet list of changes, or "N/A">

## Notes
<any observations>
```

## Current understanding

The project is a React + TypeScript web dashboard for comapeo-cloud. Documentation lives at the repo root (`README.md`, `AGENTS.md`, `DESIGN_OVERVIEW.md`, `SECURITY.md`, `WORKFLOW.md`, `CLAUDE.md`) and in `docs/`. The docs are generally well-maintained but can drift as code evolves — especially CLI commands, API endpoints, dependency versions, and setup steps.

**Baseline established 2026-07-19.** Health of the docs on `origin/main`:

- Commands, endpoints, versions, coverage thresholds, locales and Node version all verified accurate. `npm test` (1931 tests) and `npm run build` both pass.
- The drift that does appear is concentrated in **hand-maintained structure blocks and path references** — the `src/` tree diagrams in README/AGENTS drifted as directories were added and removed. Check these first each sweep; they are the loop's highest-yield target.
- `docs/`, `SECURITY.md`, `WORKFLOW.md` showed no drift.
- `DESIGN_OVERVIEW.md` was **wrongly** cleared on 2026-07-19; its "Source Files"
  section (lines 118-126) is entirely dead — see below.

**Pre-scan candidate verdicts** (settled 2026-07-20 — don't re-adjudicate):

- NOT drift: `tests/e2e/screenshots/{desktop,mobile}/` (gitignored generated
  artifacts, AGENTS.md says so itself) and `src/screens/ScreenName.stories.tsx`
  (placeholder name in a how-to step, not a link).
- GENUINE, queued: all seven bullets of `DESIGN_OVERVIEW.md`'s "Source Files"
  section point at nothing — no root `DESIGN.md`, no `.stitch/` dir anywhere, no
  `NOTES.md`/`NOTES_1.md`, empty gitignored `plans/`. The doc was authored inside
  an external Stitch workspace's `screens/` folder (line 125 still says "this
  folder") and copied to the repo root in `ff2d626` without rewriting its
  relative paths. **Suggested fix: delete the section** — the Stitch workspace
  isn't part of this repo, so repointing is impossible. In scope (undated
  reference doc, not a historical snapshot). Needs a free PR slot, not a
  maintainer decision.

Environment facts worth carrying forward:

- **`npm ci` fails on `main`** — `package-lock.json` is out of sync with `package.json`. CI never hits this because every job uses `bun install --frozen-lockfile`. Use `npm install` (or bun) when setting up a sweep worktree.
- **Pushing runs a pre-push hook** (`scripts/validate.sh`: lint + types + tests + build), so a push takes several minutes. Run it in the background; a slow push is not a stall. If a push times out, `pkill -f vitest && rm -rf coverage` before retrying — orphaned vitest processes collide on `coverage/.tmp` and fail the next attempt.
- Commit with `git -c core.hooksPath=/dev/null commit` to skip the pre-commit hook; let the pre-push hook do the validation once.
- `design/`, `.claude/`, `.codex/` are gitignored and untracked — doc references into them are broken for every clone. The pre-scan will surface these each sweep; they are genuine drift for a fresh cloner, but decide per case whether to repoint or drop the reference.

**Open items left to the maintainer** (raised 2026-07-19, don't re-fix silently — re-raise only if still unaddressed):
- `package-lock.json` is out of sync; CI uses Bun, so npm's lockfile has rotted unnoticed. Needs a maintainer decision (resync vs. drop npm lockfile).
- AGENTS.md's Zenith section points at `.claude/orchestrator_prompt.md` / `.codex/orchestrator_prompt.md`, which are untracked.

## Timeline
<!-- one dated entry per run, appended below by the loop -->

### 2026-07-19 — baseline sweep, 5 fixes, PR #133

Audited all listed docs against `origin/main` (35c89ab); tests and build green.
All 5 fixes were in the hand-maintained structure/path blocks of README.md and
AGENTS.md (nonexistent `src/types/`, wrong "one folder per screen" claim, stale
store list, untracked `design/prototype/DESIGN.md`, hardcoded dev path superseded
by `dev:tunnel`). See `sweep-2026-07-19.md`. PR #133 — `lastPrNumber` = 133.
Environment gotchas discovered here are folded into Current understanding.

### 2026-07-19 — evolution pass

Added a pre-scan workflow (real `src/`/`tests/` structure, `package.json` facts,
per-doc broken-path and unknown-script candidates, files changed since
`lastCommit`) so sweeps stop re-deriving the mechanical stage by hand. Spec now
requires reporting `lastPrNumber` + `lastCommit`, and rules dated
`docs/superpowers/specs/` and `plans/` snapshots out of scope as historical
records. Dashboard rebound to working attributes.

### 2026-07-20 — no PR (#133 still open), 1 new finding queued

`origin/main` unchanged at `35c89ab`, so no re-audit was possible; PR #133 is
still OPEN, so the skip-if-open rule barred a new PR. Sweep instead adjudicated
the pre-scan's broken-path candidates — first run with the pre-scan available.
Found one genuine item the baseline missed: `DESIGN_OVERVIEW.md`'s "Source
Files" section is entirely dead references to an external Stitch workspace.
Dismissed 3 candidates as intentional prose. Verdicts folded into Current
understanding; details in `sweep-2026-07-20.md`. `npm test`/`npm run build`
deliberately skipped — same commit, verified green 2026-07-19.
