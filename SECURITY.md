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

There are currently **no intentionally suppressed high- or critical-severity
advisories**. The CI audit runs without `--ignore` flags, so any high or critical
finding reported by Bun fails the audit job.

If a future suppression is unavoidable, document it here in the same change
that adds the `--ignore`, including the affected package, current dependency
path, upstream owner/status, why the vulnerable code is not exploitable here,
and the date it was last reviewed. Prefer upgrading or refreshing the dependency
graph instead of adding a suppression whenever a compatible fix exists.

## Suppression review checklist

Before adding or retaining an audit suppression:

1. Confirm the advisory applies to the installed version and record the live
   dependency path (`bun audit --audit-level=low` and `bun why <package>`).
2. Confirm no compatible dependency update or lockfile refresh removes it.
3. Document the upstream owner/status and why the vulnerable code path is not
   exploitable in this project.
4. Remove the `--ignore` as soon as the dependency graph resolves to a patched
   version.
