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
npm run test:e2e      # Run Playwright E2E tests (chromium, firefox, webkit)
npm run test:screenshots  # Generate desktop + mobile screenshots (chromium only)
npm run review:visual # Output JSON manifest of all generated screenshots
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
    review-screenshots.ts # Manifest generator for vision LLM review
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
6. Run `npm run review:visual` to get a JSON manifest for LLM consumption

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

## Cloudflare Deployment

- Target: Cloudflare Pages (static SPA)
- SPA routing: automatic (no `404.html` = SPA mode)
- Security headers: `public/_headers`
- Deploy: `npm run deploy`
- Preview: `npm run deploy:preview`
- Wrangler requires Node >=22
