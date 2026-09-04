# AGENTS.md — CoMapeo Cloud App

## Project Overview

CoMapeo Cloud App is a web dashboard for the [comapeo-cloud](https://github.com/digidem/comapeo-cloud) server. It provides a UI for environmental monitoring teams to manage projects, view observations, handle alerts, and monitor territory data.

## Architecture

- **Framework**: React + TypeScript (strict mode)
- **Build**: Vite
- **Routing**: TanStack Router (code-based, NOT file-based)
- **Data Fetching**: TanStack Query
- **State**: Zustand (archive, auth, locale, map, project, theme, view-mode)
- **Validation**: Valibot (runtime schema validation for API responses and form inputs)
- **Forms**: React Hook Form + @hookform/resolvers (Valibot resolver)
- **Styling**: Tailwind CSS v4 (CSS-first config via `@tailwindcss/vite`)
- **UI Primitives**: Radix UI (accessible unstyled components)
- **i18n**: react-intl + @formatjs (3 languages: en, pt, es)
- **Testing**: Vitest + Testing Library + MSW (unit), Playwright (E2E)
- **Deployment**: Cloudflare Pages

## Repository Knowledge Routing

- Root `AGENTS.md` contains cross-cutting repository rules. When a nearer `AGENTS.md` exists for the files you are changing, read it too and treat it as path-specific additions rather than a replacement for root safety policy.
- Use `.agents/skills/issue-to-spec/SKILL.md` for implementation-ready issue specifications and `.agents/skills/pr-cycle/SKILL.md` for PR review/readiness/authorized merge workflows.
- Use `.agents/skills/maintaining-agent-knowledge/SKILL.md` when preserving or consolidating durable session learnings. Do not create chronological session-memory files; promote each durable lesson into its canonical skill, scoped instruction, ADR, QA artifact, code/test, or normal documentation home.
- Accepted architecture decisions live in `docs/adr/`; pending architecture remains in issues/specs until it lands.
- `docs/qa/` is issue/PR-specific verification evidence, not a substitute for durable architecture or workflow policy.

## AI Coding Workflow (Zenith Default)

For long-running implementation, multi-agent missions, or work where premature completion is a risk, use Zenith as the default harness for both Claude Code and Codex.

Claude Code:

```text
If a project-scoped .claude/orchestrator_prompt.md or .codex/orchestrator_prompt.md exists, read it as your primary role; otherwise proceed with this AGENTS.md as your role, then use Zenith to run this mission.

<task>
```

Codex:

```text
If a project-scoped .claude/orchestrator_prompt.md or .codex/orchestrator_prompt.md exists, read it as your primary role; otherwise proceed with this AGENTS.md as your role, then use Zenith to run this mission.

<task>
```

Use raw one-shot `claude` / `codex exec` only for small bounded jobs or read-only reviews where Zenith would be unnecessary overhead.

## PR Merge Authorization Invariant

For any PR merge, follow the workspace `pr-cycle` skill. The execution that issues the merge command must have explicit merge authorization from a user message in its own current task; authorization never transfers across chats, sessions, agents, automations, readiness reports, or shared GitHub credentials. Without that current-task authorization, stop at merge-ready.

## Human QA Handoff Invariant

Any implementation declared ready for human QA must include an implementation-specific QA script at `docs/qa/<issue-or-pr>.md`, and that QA script must be linked from the PR body before readiness is reported. The QA script must state the scope being validated, prerequisites, reproducible test steps, expected results, explicit failure conditions, cleanup/reset steps when relevant, and known limitations or intentionally untestable surfaces. Add a runnable helper under `scripts/qa/` when the important technical checks can be automated without hiding the human verification intent. If the implementation has no production UI surface yet, say so explicitly and make the handoff a technical QA procedure instead of inventing click-through steps.

## Issue and PR Scope Continuity

- Before widening an implementation beyond its issue or PR scope, search the existing GitHub backlog and related PRs for overlapping or follow-up work.
- Keep substantial intentionally out-of-scope work in focused follow-up issues instead of silently expanding the current PR. Link those issues to the shipped predecessor and the relevant architecture chain.
- In follow-up specs, explicitly reuse the canonical implementation, data model, or integration path that already exists; avoid parallel state, parsers, renderers, or persistence models unless an architectural decision requires them.
- Do not promote proposed or unmerged follow-up designs into project-wide `AGENTS.md` architecture. Document durable architecture here only after it lands; keep pending design decisions in their issue/spec/ADR.

## Issue Specification and Execution Boundaries

Use `.agents/skills/issue-to-spec/SKILL.md` when turning an idea/issue into implementation-ready work.

- **One executable issue must map to one independently mergeable implementation unit.** If a spec naturally requires “PR1 then PR2”, a hard internal merge gate, or independent foundation/consumer phases, split it into child issues before marking implementation-ready.
- Parent/umbrella issues are tracking/architecture records only. Mark their body `parent tracker — do not implement directly` and never apply `agent:ready-for-implementation` or `lane:implementation` to them.
- The skill owns the detailed label lifecycle, dependency/base verification, shared-contract ownership, reviewer fallback/timeout rules, publication/audit behavior, and cross-child review gate. Do not duplicate those policies here.

## TDD Workflow (MANDATORY)

Every feature MUST follow this cycle:

1. **Write a failing test first** — describe the expected behavior
2. **Run the test** — confirm it fails with a clear error
3. **Write the minimum implementation** — make the test pass
4. **Run all tests** — ensure no regressions
5. **Refactor** — clean up while keeping tests green

### Commands

```bash
npm test              # Run all unit tests once
npm run test:watch    # Run tests in watch mode during development
npm run test:coverage # Run tests with coverage report (enforces 80% threshold)
npm run test:e2e      # Run Playwright E2E tests (chromium, firefox, webkit) — uses --reporter=list to avoid HTML report server blocking
npm run test:screenshots  # Generate desktop + mobile screenshots (chromium only) — uses --reporter=list
npm run review:mobile # Run LLM visual review of mobile screenshots
npm run extract-messages  # Extract i18n messages from source to en.json
npm run format        # Format all files with Prettier
```

### Coverage Thresholds

All source files must maintain 80% coverage across lines, functions, branches, and statements.

## File Organization

```
src/
  app/          # App entry, providers, router, global styles
  screens/      # Route-level page components (flat files; a folder when a screen has sub-parts)
  components/
    ui/         # Base UI primitives (Button, Input, Card, etc.)
    layout/     # Layout components (AppShell, Topbar, PrimaryNav)
    shared/     # Domain-specific shared components
  hooks/        # Custom React hooks
  lib/
    schemas/    # Valibot schemas for API validation
  stores/       # Zustand stores
  i18n/         # Internationalization setup
tests/
  unit/         # Unit tests (mirrors src/ structure)
  e2e/          # Playwright E2E tests
    screenshots/  # Generated review PNG artifacts (gitignored)
    screenshot-utils.ts  # Viewport constants and takeScreenshot helper
    mock-server.ts       # Playwright route intercepts using test fixtures
  fixtures/     # Test data matching real API shapes
  mocks/        # MSW handlers and test utilities
screenshots/
  screenshot/   # Tracked Argos visual artifacts (*.png, *.argos.json)
```

## Code Conventions

### Naming

- Components: PascalCase (`ObservationCard.tsx`)
- Hooks: camelCase with `use` prefix (`useProjects.ts`)
- Stores: camelCase with `use` prefix (`useAuthStore.ts`)
- Schemas: camelCase with `Schema` suffix (`projectSchema.ts` -> `projectSchema`)
- Test files: mirror source path (`src/app/App.tsx` -> `tests/unit/app/App.test.tsx`)
- Underscore prefix for unused params: `_event`, `_index`

### Imports

Managed by Prettier via `@trivago/prettier-plugin-sort-imports`:

1. `react` imports
2. `@tanstack` imports
3. `@/` alias imports
4. Relative imports (`./`, `../`)

### Patterns

- Use named exports (not default exports)
- Use `function` declarations for components (not arrow functions)
- Use Valibot schemas to validate all API responses at runtime
- Use React Hook Form with Valibot resolver for all forms
- Use `@/` path alias for src imports, `@tests/` for test imports
- Use `tests/mocks/test-utils.tsx` `render` in all component tests (wraps providers)

### Storage reset safety invariants

Changes that touch browser persistence or full local-data reset MUST preserve these data-loss guardrails:

- Route app-owned `localStorage` writes that create or update persisted state through the fenced helpers/Zustand adapter in `src/lib/comapeo-local-storage.ts`, so stale callbacks cannot recreate data during reset. Destructive removals used for cleanup are allowed; the durable reset coordination marker managed by `src/lib/storage-reset-coordinator.ts` is an intentional control-plane exception.
- Once a tab is quiesced for reset, ordinary app database paths must not create/reopen databases or enqueue new writes until the reset lifecycle explicitly resumes them or the page reloads. Reset-only isolated connections used by owner/recovery cleanup are the intentional exception and must remain scoped to reset cleanup.
- Register reset coordination before app mount. When Web Locks are available, mount waits for the tab's shared activity lock; destructive reset requires cross-tab locking and must fail safely when that coordination is unavailable.
- The reset owner must finish database, auth, and app-owned preference cleanup while holding the exclusive activity barrier before publishing `complete`. Delayed receiver tabs quiesce and reload; they must not perform their own destructive sweep after observing terminal completion.
- Backup format v1 intentionally preserves its historical `comapeo-*` key scope even though full-reset ownership is broader. Do not silently broaden v1 import/export semantics; use a future backup version for a contract change.
- Changes to these invariants require adversarial regression coverage for multi-tab, stale-owner/recovery, delayed-write, and partial-failure behavior—not only happy-path component tests.

## API Client

- Base URL stored in auth Zustand store
- All API calls go through `src/lib/api-client.ts`
- API responses validated with Valibot schemas at the boundary
- MSW mocks in `tests/mocks/handlers.ts` match real API shapes from comapeo-cloud

### API references

- Treat `docs/remote-archive-api-spec.md` as the detailed remote `comapeo-cloud` API reference; do not duplicate endpoint schemas here.
- The first-party `/api/invites/{encrypt,decrypt}` routes are Cloudflare Pages Functions and remain governed by the `INVITE_KEY`/rotation contract in the Cloudflare Deployment section below.

## Design System

Follow `DESIGN_OVERVIEW.md` as the canonical source for visual tokens, typography, spacing, component shape, borders, shadows, and sectioning. Do not copy token values into agent instructions; update the design source of truth instead.

## Guardrails Summary

| Layer | Tool | When |
|-------|------|------|
| Type checking | TypeScript strict + noUncheckedIndexedAccess | `npm run lint:types` |
| Linting | ESLint 10 flat config | `npm run lint:eslint` |
| Formatting | Prettier + import sorting | `npm run lint:prettier` |
| Pre-commit | Husky + TruffleHog + lint-staged | On `git commit` |
| Unit tests | Vitest + Testing Library + MSW | `npm test` |
| Coverage | @vitest/coverage-v8 (80% threshold) | `npm run test:coverage` |
| E2E tests | Playwright (chromium, firefox, webkit) | `npm run test:e2e` |
| Visual screenshots | Playwright (chromium only, 2 viewports) | `npm run test:screenshots` |
| i18n extraction | @formatjs/cli | `npm run extract-messages` |
| Runtime validation | Valibot schemas on API boundaries | At runtime |
| CI | GitHub Actions (lint, types, coverage, E2E, screenshots, i18n check, deploy) | On push/PR |
| React quality | React Doctor advisory changed-file gate + full reconciliation smoke | On PR |
| React tech-debt audit | React Doctor full scan + rate-limited GitHub issue reconciliation | Monday 06:00 UTC / manual |
| Secret scanning | TruffleHog (pre-commit + CI) | On `git commit` + CI |
| Screen back buttons | Arrow icon + page name | Every detail screen |
| Skeleton loading | Skeleton component while data loads | Every screen with async data |

## Screen Conventions

### Back navigation

All detail screens (ObservationDetail, AlertDetail) MUST use an arrow-back icon (← SVG chevron) with the page name ("Data") instead of text like "Back to Data". The link must have `min-h-[44px]` for mobile touch target.

### Skeleton loading

Every screen that loads async data MUST show a Skeleton placeholder while data is pending. Use the `<Skeleton>` component from `@/components/ui/skeleton`. At minimum show:

- A title skeleton (h24, w200)
- 1-2 card skeletons (h100-200)

## E2E and Visual Testing

For Playwright, responsive, browser-engine, screenshot, Argos, and visual-baseline work, read `tests/e2e/AGENTS.md`. It owns the path-specific harness and evidence rules; the commands above remain the root entry points.

## Commit Messages

Use Conventional Commits format:

```
type(scope): description

feat(observations): add photo gallery viewer
fix(auth): handle expired token redirect
test(projects): add unit tests for project list
chore(deps): update TanStack Query
```

Types: `feat`, `fix`, `test`, `refactor`, `chore`, `docs`, `style`, `ci`

## Storybook

Visual component explorer using `@storybook/tanstack-react`. Stories live alongside their components (`*.stories.tsx`).

### Commands

```bash
npm run build-storybook  # Static build to storybook-static/ (exits cleanly — use this for agents/CI)
npm run storybook        # Dev server on :6006 (interactive only — long-running, does NOT exit)
```

### For agents (non-interactive)

`storybook dev` is a long-running dev server that blocks until Ctrl+C. **Never run it directly.** Instead:

```bash
# 1. Build static Storybook (exits cleanly)
npm run build-storybook

# 2. Serve the static build in background
npx serve storybook-static -l 6006 -s &

# 3. Take screenshots / interact with http://localhost:6006

# 4. Kill the server when done
kill %1
```

### Mock architecture

Stories use Vite aliases (`.storybook/main.ts`) to redirect module imports to mocks in `src/screens/stories/__mocks__/`:

- `stores.ts` — Zustand stores with controllable state
- `hooks.ts` — TanStack Query hooks returning fixture data (projects, observations, alerts)
- `api-client.ts`, `data-layer.ts`, `invite-url.ts`, `geojson-export.ts` — API/utility stubs

The `@tanstack/react-router` is NOT mocked — the `@storybook/tanstack-react` framework provides its own router decorator that wraps all stories in a memory router context.

### Adding stories

1. Create `src/screens/ScreenName.stories.tsx` alongside the component
2. Import from `@storybook/tanstack-react` (not `@storybook/react`)
3. Use `useProjectStore.setState()` in decorators to control store state
4. Set `parameters: { layout: 'fullscreen' }` for screen-level stories

## Cloudflare Deployment

- Target: Cloudflare Pages (static SPA)
- SPA routing: automatic (no `404.html` = SPA mode)
- Security headers: `public/_headers`
- Deploy: `npm run deploy`
- Preview: `npm run deploy:preview`
- Wrangler requires Node >=22

### Required secret: `INVITE_KEY`

The `/api/invites/{encrypt,decrypt}` Pages Functions require a 32-byte AES-GCM key (base64 encoded) bound as `INVITE_KEY`.

- Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- Set in Pages: `npx wrangler pages secret put INVITE_KEY --project-name comapeo-cloud-app`
- Local dev: add `INVITE_KEY=<base64>` to `.dev.vars` (gitignored).
- Rotation: bump the version prefix in `src/lib/invite-crypto.ts` (currently `v1.`) AND add a parallel decrypt path that still accepts the old prefix. Keep the old prefix alive for at least one TTL window (24h) before removing it, so in-flight invites aren't invalidated mid-use.

## Dev Server + Cloudflare Tunnel (when remote preview is needed)

Start the Vite dev server for every development session. Exposing a Cloudflare Tunnel is **optional** and only needed when the task requires a remote preview (e.g. sharing the live UI with a reviewer). For local-only work — unit tests, running the app in a local browser, type-checking — just run `npm run dev` and skip the tunnel.

1. **Kill this worktree's stale dev server** — port-scoped (worktrees use distinct ports): `kill "$(lsof -t -i:5173)" 2>/dev/null || true`
2. **Start the Vite dev server** - `npm run dev` (runs on port 5173)
3. **Expose via Cloudflare Tunnel** — only when a remote preview is needed: `cloudflared tunnel --url http://localhost:5173`
4. **Capture the tunnel URL** - look for `https://*.trycloudflare.com` in the output
5. **Share the URL with the user** so they have immediate access to the latest UI even before CI/PR previews finish

This ensures the user can always preview the current state of the codebase in real time without waiting for builds or deployments.

### Commands

```bash
# Preferred: starts Vite, waits for it to be ready, then opens the tunnel
npm run dev:tunnel        # optional port arg, e.g. npm run dev:tunnel -- 5174

# Manual equivalent, from the repo root
npm run dev                                          # dev server on :5173
cloudflared tunnel --url http://localhost:5173       # quick tunnel
```

### Notes

- Quick tunnels are ephemeral - they get a new URL each time they're started
- The URL changes on restart, so always share the latest one
- Vite dev server must be running before the tunnel connects
- The tunnel URL is typically reachable within 5-10 seconds of starting cloudflared
