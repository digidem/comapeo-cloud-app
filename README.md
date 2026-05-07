<div align="center">

<img src="public/favicon.svg" alt="CoMapeo Cloud App" width="80" />

# CoMapeo Cloud App

**Web dashboard for [CoMapeo Cloud](https://github.com/digidem/comapeo-cloud) servers**

A desktop-first monitoring workspace for environmental and territorial teams — browse archive servers, manage projects, review field observations, manage alerts, and coordinate multi-device deployments.

[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Cloudflare Pages](https://img.shields.io/badge/Deployed_on-Cloudflare_Pages-F38020?logo=cloudflare&logoColor=white)](https://pages.cloudflare.com/)
[![Node](https://img.shields.io/badge/Node-%3E%3D22-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Conventional Commits](https://img.shields.io/badge/Conventional_Commits-1.0.0-FE5196?logo=conventionalcommits&logoColor=white)](https://www.conventionalcommits.org/)
[![i18n](https://img.shields.io/badge/i18n-EN%20%7C%20PT%20%7C%20ES-4B9CD3)](src/i18n/)
[![Playwright](https://img.shields.io/badge/E2E-Playwright-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev/)
[![Vitest](https://img.shields.io/badge/Tests-Vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)

</div>

---

## What It Does

CoMapeo mobile users collect observations in disconnected field environments. These sync to self-hosted **CoMapeo Cloud** servers. This app gives coordinators a centralized workspace to:

- **Navigate** between archive servers and their projects
- **Review** geolocated field observations with photos and metadata
- **Manage alerts** — create, track, and resolve environmental threat events
- **Monitor territory** via map layers and GIS data
- **Configure** server connections and team access

## Tech Stack

| Concern | Library |
|---|---|
| Framework | React 19 + TypeScript (strict) |
| Build | Vite 8 |
| Routing | TanStack Router (code-based) |
| Data fetching | TanStack Query |
| State | Zustand |
| Validation | Valibot (runtime schema validation) |
| Forms | React Hook Form + Valibot resolver |
| Styling | Tailwind CSS v4 (CSS-first config) |
| UI primitives | Radix UI (accessible, unstyled) |
| Localisation | react-intl + FormatJS (EN / PT / ES) |
| Unit tests | Vitest + Testing Library + MSW |
| E2E tests | Playwright (Chromium, Firefox, WebKit) |
| Deployment | Cloudflare Pages |

## Getting Started

### Prerequisites

- **Node.js** ≥ 22
- A running [comapeo-cloud](https://github.com/digidem/comapeo-cloud) server (for a real API) — or use the built-in MSW mocks for local development

### Install & Run

```bash
git clone https://github.com/digidem/comapeo-cloud-app.git
cd comapeo-cloud-app
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and point the app at your CoMapeo Cloud server URL.

### Build for Production

```bash
npm run build        # type-check + Vite build → dist/
npm run preview      # preview the production build locally
```

### Deploy to Cloudflare Pages

```bash
npm run deploy           # build + deploy to production
npm run deploy:preview   # build + deploy to preview channel
```

> Requires Wrangler authenticated with your Cloudflare account and Node ≥ 22.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (HMR) |
| `npm run build` | Type-check + production build |
| `npm run lint` | Run ESLint + Prettier check + type-check in parallel |
| `npm run format` | Format all files with Prettier |
| `npm test` | Run unit tests once |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run test:coverage` | Unit tests with coverage report (80% threshold) |
| `npm run test:e2e` | Playwright E2E across Chromium, Firefox, WebKit |
| `npm run test:screenshots` | Generate desktop (1440×900) + mobile (375×812) screenshots |
| `npm run review:visual` | Output JSON manifest of screenshots for vision LLM review |
| `npm run extract-messages` | Extract i18n keys from source to `src/i18n/messages/en.json` |

## Project Structure

```
src/
  app/          # Entry point, providers, router, global styles
  screens/      # Route-level page components (one folder per screen)
  components/
    ui/         # Base primitives (Button, Input, Card …)
    layout/     # AppShell, Topbar, PrimaryNav
    shared/     # Domain-specific shared components
  hooks/        # Custom React hooks
  lib/
    schemas/    # Valibot schemas for API validation
  stores/       # Zustand stores (auth, theme, locale)
  i18n/         # Internationalisation setup + message files
  types/        # Shared TypeScript types
tests/
  unit/         # Vitest unit tests (mirrors src/ structure)
  e2e/          # Playwright E2E tests + screenshot utilities
  fixtures/     # Test data matching real API shapes
  mocks/        # MSW handlers and test utilities
```

## API

All requests go through `src/lib/api-client.ts` and responses are validated at runtime with Valibot schemas. The server base URL is stored in the auth Zustand store.

Key endpoints from [comapeo-cloud](https://github.com/digidem/comapeo-cloud):

| Method | Path | Auth |
|---|---|---|
| `GET` | `/info` | — |
| `GET` | `/healthcheck` | — |
| `GET` | `/projects` | Bearer |
| `GET` | `/projects/:id` | Bearer |
| `GET` | `/projects/:id/observations` | Bearer |
| `GET` | `/projects/:id/alerts` | Bearer |
| `POST` | `/projects/:id/alerts` | Bearer |

## Contributing

1. Fork the repo and create a branch: `git checkout -b feat/your-feature`
2. Follow the **TDD workflow** — write a failing test first, then implement
3. Ensure `npm test` and `npm run lint` pass
4. Use [Conventional Commits](https://www.conventionalcommits.org/) for your commit messages
5. Open a pull request

> See [AGENTS.md](AGENTS.md) for detailed conventions, design system tokens, and guardrails.

---

<div align="center">
Built by <a href="https://www.digital-democracy.org/">Digital Democracy</a> · Part of the <a href="https://comapeo.app/">CoMapeo</a> ecosystem
</div>
