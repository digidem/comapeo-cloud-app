# AGENTS.md — CoMapeo Cloud App

## Project Overview

CoMapeo Cloud App is a web dashboard for the [comapeo-cloud](https://github.com/digidem/comapeo-cloud) server. It provides a UI for environmental monitoring teams to manage projects, view observations, handle alerts, and monitor territory data.

## Architecture

- **Framework**: React + TypeScript (strict mode)
- **Build**: Vite
- **Routing**: TanStack Router (code-based, NOT file-based)
- **Data Fetching**: TanStack Query
- **State**: Zustand (auth, theme, locale)
- **Validation**: Valibot (runtime schema validation for API responses and form inputs)
- **Forms**: React Hook Form + @hookform/resolvers (Valibot resolver)
- **Styling**: Tailwind CSS v4 (CSS-first config via `@tailwindcss/vite`)
- **UI Primitives**: Radix UI (accessible unstyled components)
- **i18n**: react-intl + @formatjs (3 languages: en, pt, es)
- **Testing**: Vitest + Testing Library + MSW (unit), Playwright (E2E)
- **Deployment**: Cloudflare Pages

## AI Coding Workflow (Zenith Default)

For long-running implementation, multi-agent missions, or work where premature completion is a risk, use Zenith as the default harness for both Claude Code and Codex.

Claude Code:

```text
First read .claude/orchestrator_prompt.md and treat it as your primary role, then use Zenith to run this mission.

<task>
```

Codex:

```text
First read .codex/orchestrator_prompt.md and treat it as your primary role, then use Zenith to run this mission.

<task>
```

Use raw one-shot `claude` / `codex exec` only for small bounded jobs or read-only reviews where Zenith would be unnecessary overhead.

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
  screens/      # Route-level page components (one folder per screen)
  components/
    ui/         # Base UI primitives (Button, Input, Card, etc.)
    layout/     # Layout components (AppShell, Topbar, PrimaryNav)
    shared/     # Domain-specific shared components
  hooks/        # Custom React hooks
  lib/
    schemas/    # Valibot schemas for API validation
  stores/       # Zustand stores
  i18n/         # Internationalization setup
  types/        # TypeScript type definitions
tests/
  unit/         # Unit tests (mirrors src/ structure)
  e2e/          # Playwright E2E tests
    screenshots/  # Generated PNG artifacts (gitignored)
    screenshot-utils.ts  # Viewport constants and takeScreenshot helper
    mock-server.ts       # Playwright route intercepts using test fixtures
  fixtures/     # Test data matching real API shapes
  mocks/        # MSW handlers and test utilities
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

## API Client

- Base URL stored in auth Zustand store
- All API calls go through `src/lib/api-client.ts`
- API responses validated with Valibot schemas at the boundary
- MSW mocks in `tests/mocks/handlers.ts` match real API shapes from comapeo-cloud

### Key API Endpoints (from comapeo-cloud)

| Method | Path | Auth | Response Shape |
|--------|------|------|----------------|
| GET | `/info` | No | `{ data: { deviceId, name } }` |
| GET | `/healthcheck` | No | 200 empty |
| GET | `/projects` | Bearer | `{ data: [{ projectId, name? }] }` |
| GET | `/projects/:id` | Bearer | `{ data: { projectId, name? } }` |
| GET | `/projects/:id/observations` | Bearer | `{ data: [{ docId, createdAt, updatedAt, deleted, lat?, lon?, attachments, tags }] }` |
| GET | `/projects/:id/remoteDetectionAlerts` | Bearer | `{ data: [{ docId, createdAt, updatedAt, deleted, detectionDateStart, detectionDateEnd, sourceId, metadata, geometry }] }` |
| POST | `/projects/:id/remoteDetectionAlerts` | Bearer | Body: `{ geometry, metadata?, detectionDateStart?, detectionDateEnd? }` -> 201 empty |
| POST | `/api/invites/encrypt` | None (first-party) | Body: `{ url, token, ttlHours? }` -> `{ code }`; uses Cloudflare Pages Function with `INVITE_KEY` |
| POST | `/api/invites/decrypt` | None (first-party) | Body: `{ code }` -> `{ url, token }`; 410 if expired |

## Design System

Follow `design/prototype/DESIGN.md` for all visual decisions:

- Font: **Inter** (not Rubik)
- Primary: Confident Bright Blue `#1F6FFF`
- Navy: Institutional Navy `#04145C`
- Background: Pale Cool Gray `#F4F6FA`
- Text: Deep Ink Navy `#172033` (never pure black)
- Borders: Soft Silver-Blue `#D9DEE8` (ghost borders at 15% opacity when needed)
- Card radius: 18px, Button radius: 12px, Pill radius: 999px
- Shadows: whisper-soft `0 8px 24px rgba(9, 30, 66, 0.08)`
- No solid borders for sectioning — use tonal nesting

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

## Visual Screenshot Testing

Screenshots are generated at two viewports for vision LLM review:

- **Desktop**: 1440x900 (`tests/e2e/screenshots/desktop/`)
- **Mobile**: 375x812 (`tests/e2e/screenshots/mobile/`)

Pattern for adding new screen screenshots:

1. Create `tests/e2e/{screen}.screenshots.ts`
2. Import `VIEWPORTS`, `takeScreenshot` from `./screenshot-utils`
3. Import `setupMockServer` from `./mock-server` for API mocking
4. Use `browser.newContext()` + `try/finally` pattern (see `app.screenshots.ts`)
5. Run `npm run test:screenshots` to generate PNGs
6. Run `npm run review:mobile` (or `npm run pipeline:mobile-review`) for LLM-based visual review

Screenshots are gitignored (generated artifacts). Each Playwright project
that runs E2E tests uses all 3 browsers; the `screenshot` project uses
chromium only for deterministic rendering.

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

## Dev Server + Cloudflare Tunnel (MANDATORY)

Every time you start development work in any worktree, ALWAYS:

1. **Kill any stale dev servers** - `pkill -f "vite"` or kill old PID
2. **Start the Vite dev server** - `npm run dev` (runs on port 5173)
3. **Expose via Cloudflare Tunnel** - `cloudflared tunnel --url http://localhost:5173`
4. **Capture the tunnel URL** - look for `https://*.trycloudflare.com` in the output
5. **Share the URL with the user** so they have immediate access to the latest UI even before CI/PR previews finish

This ensures the user can always preview the current state of the codebase in real time without waiting for builds or deployments.

### Commands

```bash
# Start dev server (background)
cd /home/coder/comapeo-cloud-app && npm run dev

# Create quick tunnel (background)
cloudflared tunnel --url http://localhost:5173
```

### Notes

- Quick tunnels are ephemeral - they get a new URL each time they're started
- The URL changes on restart, so always share the latest one
- Vite dev server must be running before the tunnel connects
- The tunnel URL is typically reachable within 5-10 seconds of starting cloudflared
