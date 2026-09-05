# ADR 0001: Promote agent knowledge into canonical scoped homes

- Status: Accepted
- Date: 2026-09-04

## Context

Repeated PR cycles produced useful durable lessons, but some were preserved as PR-numbered session narratives alongside root `AGENTS.md`, workflow skills, QA docs, and product documentation. That made provenance easy to see but created three long-term problems:

1. the same rule could exist in several places with unclear precedence;
2. root or workflow context could grow with details irrelevant to most tasks;
3. every future session could create another chronological memory file instead of improving the canonical instruction that future agents actually read.

The repository already has the right primitives for progressive disclosure: root and nested `AGENTS.md`, Agent Skills with one-level references, normal subsystem docs, QA artifacts, implementation specs, and Git history. We need a placement and promotion policy rather than another memory store.

The alternatives considered were:

- keep PR-numbered lesson files and link them from skills;
- maintain independent vendor-specific instruction files;
- promote durable knowledge into scoped canonical homes and remove the raw session narratives after a non-loss audit.

## Decision

Adopt a promotion architecture:

> Chats produce observations. Sessions produce candidate lessons. The repository stores only promoted knowledge in one canonical home.

The canonical roles are:

- root `AGENTS.md`: cross-cutting repository constitution and knowledge router;
- nearest nested `AGENTS.md`: durable path-specific deltas;
- `.agents/skills/<skill>/SKILL.md`: repeatable agent workflows;
- skill `references/*.md`: detailed workflow/evidence mechanics loaded on demand;
- `docs/adr/`: accepted architecture decisions and their consequences;
- normal `docs/`: current subsystem/operator reference truth;
- `docs/superpowers/specs/`: pending or implementation-specific designs;
- `docs/qa/`: issue/PR-specific verification procedures and evidence;
- code/tests: executable technical invariants closest to the implementation;
- `.ai-bridge/` and PR/issue discussion: temporary execution state and historical evidence, not canonical policy.

The `maintaining-agent-knowledge` skill owns the promotion lifecycle: classify, search existing knowledge, promote into one canonical destination, deduplicate, validate discoverability/non-loss, and report the disposition. Permanent chronological files such as `prNNN-session-lessons.md` are prohibited.

Vendor-specific files remain adapters rather than policy forks. `CLAUDE.md` continues to import root `AGENTS.md`; no new repository-wide Copilot instruction file is added without a demonstrated compatibility gap.

The PR-cycle workflow keeps a durable-knowledge checkpoint but delegates placement rules to `maintaining-agent-knowledge`. Generic QA/reviewer lessons live in stable topical references. E2E and map/SMP invariants that are important only in those paths live in nested `AGENTS.md` files.

## Migration manifest

This table is the one-time non-loss audit for the two chronological lesson sources being consolidated. Git history and the original PR discussions retain provenance after the raw notes are removed.

| Source | Source heading | Disposition | Canonical home / rationale |
| --- | --- | --- | --- |
| PR #287 | Exact-revision truth is the unit of readiness | already canonical | `.agents/skills/pr-cycle/SKILL.md` and `references/github-runbook.md` already require readiness/review on one exact head + live-base-tip pair, invalidate stale evidence, and when synchronization is required merge the verified target tip into the PR branch without rebasing or force-pushing reviewed history. |
| PR #287 | Review findings are hypotheses, not commands | promoted to workflow reference | `.agents/skills/pr-cycle/references/review-evidence.md` owns finding adjudication, invariant-based rejection, and RED regression evidence. |
| PR #287 | Tool and provider failure is not a verdict | already canonical | `pr-cycle/SKILL.md` plus the Claude/Kimi/Qwen references already distinguish unavailable review transport from approval or code failure; `review-evidence.md` cross-links the concept. |
| PR #287 | Local browser limits must be separated from product failures | promoted to workflow reference | `references/qa-evidence.md` owns environment-vs-product evidence; `tests/e2e/AGENTS.md` provides the path-local execution reminder. |
| PR #287 | QA evidence should mirror the actual product boundary | promoted to workflow reference | `references/qa-evidence.md` owns production-boundary QA and helper/runbook equivalence. |
| PR #287 | Determinism requires hostile-environment tests | promoted to scoped AGENTS | `src/lib/map/AGENTS.md` preserves timezone/input-order package determinism; shipped proof remains in authored-map unit tests and `docs/qa/279-authored-smp-packaging.md`. |
| PR #287 | Resource bounds must be enforced before expensive work | promoted to scoped AGENTS | `src/lib/map/AGENTS.md` preserves early bounds and defense-in-depth allocation limits; concrete ceilings stay executable in map code/tests. |
| PR #287 | Archive parser compatibility must be explicit and narrow | promoted to scoped AGENTS | `src/lib/map/AGENTS.md` preserves narrow fail-closed compatibility exceptions; exact ZIP/data-descriptor behavior remains in `smp-zip.ts` and regression tests. |
| PR #287 | MapLibre offline symbols need an explicit resource contract | promoted to scoped AGENTS | `src/lib/map/AGENTS.md` preserves the TinySDF text fallback versus sprite-dependent icon distinction; detailed current behavior remains in map code/tests and QA #279. |
| PR #287 | Command ceilings should shape validation, not weaken it | promoted to workflow reference | `pr-cycle/SKILL.md` and `references/timeout-strategy.md` retain bounded execution policy; `references/qa-evidence.md` now also requires rerunning changed-area validation after formatting/conflict/base synchronization so evidence matches the final tree. |
| PR #287 | Documentation placement | promoted to workflow reference | `.agents/skills/maintaining-agent-knowledge/SKILL.md` is now the canonical placement/promotion workflow; `pr-cycle` delegates to it instead of repeating the taxonomy. |
| PR #341 | Treat skipped E2E comments and selectors as historical evidence | promoted to workflow reference | `references/qa-evidence.md` owns current-trace/DOM diagnosis; `tests/e2e/AGENTS.md` provides the local rule for E2E maintenance. |
| PR #341 | Pair product-flow QA with direct deployed-artifact probes when boundaries differ | promoted to workflow reference | `references/qa-evidence.md` defines exact-deployment probes as narrow supplemental evidence that never replaces real UI integration QA. |
| PR #341 | Cross-browser substitution must be exact and explicit | promoted to workflow reference | `references/qa-evidence.md` defines exact-SHA engine substitution and masked-outcome inspection; `tests/e2e/AGENTS.md` applies it locally. |

No durable #287/#341 heading is discarded. Product-specific details that do not belong in a PR workflow are retained in shipped code/tests/QA rather than copied into generic process prose.

## Consequences

### Positive

- Future agents encounter high-salience rules close to the work they affect instead of scanning chronological session narratives.
- The root instruction file can act as a router while path-specific and workflow detail loads progressively.
- One canonical-home rule reduces contradictory guidance and stale copies.
- Git history preserves provenance without forcing historical narratives into active context.
- Policy tests can prevent regression into PR-numbered memory files, broken skill links, or vendor policy forks.

### Trade-offs

- Consolidating an old session note requires a one-time disposition audit before deletion.
- Some high-level rules are summarized at a router/scoped boundary and detailed elsewhere; maintainers must update the canonical detailed source rather than copying text into every pointer.
- A new nested `AGENTS.md` should be added only for genuinely durable path-specific deltas, not merely to shorten the root file.

### Ongoing rule

At the end of a workflow, preserve only knowledge that will materially improve future work. If the observation is transient, already canonical, or specific to one issue's evidence, do not create new repository memory for it.
