# Dependency Audit

## Spec
Run `npm audit` and `npm outdated` against the project's `package.json`/`lockfile`.
Report any new vulnerabilities (by severity) and major version gaps in dependencies.
Compare against the previous run's findings (via `prev.state`) — only alert the user
when something *changed* (new vuln, newly outdated, or severity upgrade). If nothing
changed, stay silent.

Products use front-matter: `type: audit | clean | alert`, with `date: YYYY-MM-DD`.

- `audit` — vulnerabilities or outdated deps found
- `clean` — all clear
- `alert` — new critical/high vuln since last run

## Current understanding
The project uses npm with a `package-lock.json`. Key dependencies include React 19,
TanStack Query/Router, Vite 8, Tailwind CSS v4, Zustand, Valibot, and Playwright.
Deployment target is Cloudflare Pages.

Baseline as of 2026-07-19: **12 vulnerabilities** (1 critical, 3 high, 7 moderate,
1 low), **52 outdated** packages, **2 major-version gaps** (typescript 6→7,
@types/node 25→26). All critical/high vulns live in **dev/build tooling only** —
none ship in the production SPA bundle:
- CRITICAL: shell-quote@1.8.3 (via npm-run-all) — quote() doesn't escape newlines.
- HIGH: undici (via @sentry/cli, jsdom, wrangler→miniflare) — TLS bypass, header
  injection, DoS. wrangler@4.95.0 and miniflare flagged as its consumers.

State fields tracked for change-detection: `{ totalVulns, critical, high, outdatedCount, majorGaps }`.
The workflow escalates to the agent only when a *vulnerability* field changes (new/removed
vuln or severity shift); pure outdated-count drift is charted but not triaged by the LLM.

**Resolved (do not re-investigate):** the "24 vs 12" vuln-count discrepancy was a workflow bug —
`npm audit` reports `metadata.vulnerabilities` as `{ info, low, moderate, high, critical, total }`,
and the old code summed `Object.values()`, double-counting (severities + `total`). Fixed to read
`.total` directly. `majorGaps` is now computed in the workflow (current major < latest major),
matching the manual baseline count of 2.

## Timeline
<!-- one dated entry per run, appended below by the loop -->

### 2026-07-19 (type: audit)
First recorded exec run. Woke on a workflow "status changed" signal (signal text
cited 24 vulns/52 outdated; direct `npm audit` measures **12** vulns/52 outdated —
signal count was stale, outdated count matches). Established baseline above. No
production-runtime dependency is affected; remediation is optional dev-tooling
hygiene (`npm audit fix`, bump wrangler/@sentry/cli, TS 7 major migration deferred).
Reported `new` to user with the baseline.
