# Security policy

## Reporting a vulnerability

To report a security vulnerability in CoMapeo Cloud, please open a private
security advisory on GitHub (**Security → Advisories → New draft advisory**) so
the maintainers can triage it before public disclosure. Do **not** open a
public issue for suspected security bugs.

## Dependency auditing

Continuous integration runs `bun audit --audit-level=high` on every push and
pull request (see the `audit` job in `.github/workflows/ci.yml`). Any advisory
rated **high** or **critical** that ships to production fails the build.

### Intentionally suppressed advisories

The audit command ignores a small number of advisories via `--ignore`. Each one
is listed below with the affected package, severity, why it is safe to skip, and
where the vulnerable code actually lives. **Never add a new `--ignore` without a
matching entry here**, and re-evaluate every entry on each dependency bump.

| Advisory | Package | Severity | Last reviewed |
| --- | --- | --- | --- |
| [GHSA-gv7w-rqvm-qjhr](https://github.com/advisories/GHSA-gv7w-rqvm-qjhr) | `esbuild` | Withdrawn (was High, CVSS 8.1) | 2026-06-19 |
| [GHSA-hmw2-7cc7-3qxx](https://github.com/advisories/GHSA-hmw2-7cc7-3qxx) | `form-data` | High (CVSS 7.5) | 2026-06-19 |
| [GHSA-96hv-2xvq-fx4p](https://github.com/advisories/GHSA-96hv-2xvq-fx4p) | `ws` | High (CVSS 7.5) | 2026-06-19 |

#### GHSA-gv7w-rqvm-qjhr — `esbuild`

Missing binary-integrity verification in esbuild's Deno module path, which
could allow remote code execution if an attacker controls the `NPM_CONFIG_REGISTRY`
environment variable.

Safe to skip for three independent reasons:

1. **Officially withdrawn.** GitHub withdrew the advisory because the affected
   package was misidentified and is not in a supported ecosystem. It no longer
   appears in `bun audit` output; the `--ignore` is retained defensively in
   case it is ever republished.
2. **Build-time only.** esbuild is used by Vite for minification
   (`vite.config.ts → minify: 'esbuild'`) and is **not** part of the production
   `dist/` bundle. End users are never exposed to it.
3. **Deno-only code path.** The flaw is in esbuild's Deno module
   (`lib/deno/mod`). This application runs on Node/Bun and never executes that
   path.

#### GHSA-hmw2-7cc7-3qxx — `form-data`

CRLF injection via unescaped multipart field names and filenames.

Safe to skip: `form-data` is a transitive dependency (via `axios`) and the flaw
can only be exploited by an attacker who controls the **names** of multipart
form fields or filenames submitted by the client. This application never
constructs `multipart/form-data` requests with user-controlled field names, so
the injection point is unreachable.

#### GHSA-96hv-2xvq-fx4p — `ws`

Denial of service via memory exhaustion from many tiny WebSocket fragments.

Safe to skip: `ws` reaches the dependency tree only through **dev/test tooling**
(`@vitest/browser`, `storybook`, `miniflare`/wrangler). It is never imported in
`src/` and is not present in the production build, so the DoS vector is not
reachable by end users.

## Suppression review checklist

When touching the audit step or bumping a dependency that carries one of the
above advisories:

1. Confirm the advisory still applies to the installed version
   (`bun audit --audit-level=low`).
2. Re-confirm the package is still not shipped to production / the vulnerable
   code path is still unreachable.
3. If any of the above no longer holds, **remove** the `--ignore` and fix or
   upgrade the dependency instead.
4. Update the "Last reviewed" date in the table above.
