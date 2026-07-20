# Commit Activity Digest

## Spec
Summarize recent git activity: new commits since the last digest (tracked via
`prev.state.lastSha`), open PRs via `gh pr list`, and any notable changes (file
types touched, authors active).

**When to speak:** escalate to a digest only when there are new commits since
the last run, OR the set of open PRs changed (a PR opened/closed/merged since
last run — tracked via `prev.state.openPrNumbers`). A still-open PR with no new
commits is NOT news — stay silent (the workflow returns state only, no message).
This avoids a daily "nothing new" ping and re-reporting the same open PR.

Products use front-matter: `type: digest | quiet`, with `date: YYYY-MM-DD`.

- `digest` — activity found, summary produced
- `quiet` — no new commits since last run

## Current understanding
This is a Conventional Commits repo. The main branch is `main`. Worktrees may
be in use for feature work. The GitHub remote is `digidem/comapeo-cloud-app`.

Active work is concentrated on the map SMP (raster tile) download engine —
tracked in open PR #125 "SMP download engine, progress, and saved maps
management (Phase 1c)". Two contributors active: `github-actions[bot]` and `Terrastories`.

The workflow tracks the cursor in `prev.state` (`lastSha`, `openPrNumbers`) and
emits two chartable metrics per run: `commits` (new commit count) and
`open_prs` (open-PR count). Baseline cursor: `6ba4c07` (was `b71d126` at first
digest).

## Timeline
<!-- one dated entry per run, appended below by the loop -->

### 2026-07-19
First digest. 20 new commits (baseline established), all in one workstream: the
map raster SMP download engine and surrounding map UI polish. Themes:
- **Download engine** (`src/lib/map/smp-download.ts`, `DownloadPanel.tsx`):
  retry-budget handling moved to `handleRetry`, recovery-write retry loops,
  quota/early-return fixes, ELI tile-template normalization, regenerate UI for
  missing blobs, window.open export fallback, Greptile P1 review fixes.
- **Map UI**: attribution moved to top-left (default control disabled),
  mobile toolbar layout via `h-dvh`/flex, off-screen bottom buttons fixed,
  storage-warning render ordering + "Try anyway" bypass.
- **Tests**: AttributionControl added to react-map-gl mocks; smp-download and
  DownloadPanel/MapScreen test coverage expanded.
Net across the span: 13 files, +396/-121. Open PR: #125.
