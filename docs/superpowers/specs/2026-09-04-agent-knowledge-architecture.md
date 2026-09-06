# Agent Knowledge Architecture

Date: 2026-09-04
Status: accepted
Scope: repository-wide agent instructions, skills, references, architecture records, QA records, and session-learning promotion for `digidem/comapeo-cloud-app`

## 1. Problem

The repository has accumulated useful agent/process knowledge through repeated PR-cycle hardening and post-session lesson capture. The information is valuable, but it is beginning to fragment across:

- root `AGENTS.md`, which mixes always-relevant rules with detailed reference material;
- `.agents/skills/pr-cycle/SKILL.md`, which contains both workflow policy and some implementation/tool specifics;
- topical PR-cycle references;
- PR-numbered session-memory files such as `pr287-session-lessons.md` and the proposed `pr341-session-lessons.md` from PR #343;
- issue-specific QA docs and feature specs;
- normal architecture/reference documents;
- compatibility files such as `CLAUDE.md`.

Without a promotion model, every completed session can add another narrative memory file. That creates duplication, stale guidance, excessive always-on context, unclear precedence, and uncertainty about which document is normative.

## 2. Goals

1. Make the repository itself the canonical shared memory for coding agents and humans.
2. Keep always-loaded instructions concise enough to remain salient.
3. Use progressive disclosure: agents load detailed workflow/reference knowledge only when relevant.
4. Give every durable lesson exactly one canonical home.
5. Replace permanent session narratives with a repeatable promotion lifecycle.
6. Preserve all genuinely reusable lessons already captured from prior PR cycles while deleting redundant copies.
7. Keep cross-agent compatibility without maintaining independent policy forks for Claude, Copilot, Codex, or other agents.
8. Make knowledge architecture testable so future sessions cannot silently regress into loose memory accumulation.

## 3. Non-goals

- Do not redesign product architecture or application behavior.
- Do not migrate every product document into agent skills.
- Do not duplicate agent policy into multiple vendor-specific files.
- Do not make session history itself permanent documentation.
- Do not introduce an external knowledge database or RAG system for repository rules.
- Do not rename existing protected CI contexts as part of this work.

## 4. External design basis

The design follows current ecosystem conventions rather than inventing a proprietary memory system:

- GitHub supports repository-wide instructions, path-specific instructions, and `AGENTS.md`, and recommends path scoping to avoid overloading repository-wide instructions: https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions
- GitHub documents that the nearest `AGENTS.md` can take precedence for agent work and that path-specific instructions can coexist with repository-wide instructions: https://docs.github.com/en/copilot/reference/custom-instructions-support
- The AGENTS.md open format recommends a root `AGENTS.md` and nested files for subprojects or narrower scopes: https://agents.md/
- The Agent Skills specification explicitly uses progressive disclosure: metadata at discovery time, `SKILL.md` when activated, and focused `references/` loaded only as needed. It recommends keeping `SKILL.md` bounded and moving details into one-level references: https://github.com/agentskills/agentskills and https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx
- Sentry's public skills repository follows the same pattern: runtime workflow in `SKILL.md`, long material in references, and explicit skill-maintenance conventions: https://github.com/getsentry/skills/blob/main/AGENTS.md
- Claude Code supports `CLAUDE.md` imports, allowing a compatibility file to defer to shared repository instructions rather than duplicating them: https://docs.anthropic.com/en/docs/claude-code/memory

## 5. Canonical knowledge taxonomy

Every durable piece of repository knowledge MUST belong to exactly one primary class.

| Knowledge class | Canonical home | Loaded when | Examples |
| --- | --- | --- | --- |
| Repository constitution | `AGENTS.md` | Broadly / always | TDD, scope boundaries, safety invariants, canonical tool routing |
| Repeatable agent workflow | `.agents/skills/<name>/SKILL.md` | Skill activation | PR cycle, issue-to-spec, knowledge maintenance |
| Detailed workflow technique/reference | `.agents/skills/<name>/references/*.md` | On demand from skill | exact-SHA QA evidence, provider-specific review transport |
| Durable architecture decision | `docs/adr/*.md` | Architecture work | decision context, choice, consequences |
| Current architecture/reference | normal `docs/*.md` | Relevant subsystem work | API contract, deployment, browser-storage design |
| Feature design/spec | `docs/superpowers/specs/*.md` | Feature implementation | implementation design |
| Issue/PR-specific verification | `docs/qa/*.md` | QA/handoff | exact reproducible validation flow |
| Temporary execution coordination | `.ai-bridge/`, PR/issue comments | Current task only | handoffs, run state, temporary evidence |
| Raw session narrative | nowhere permanent | never | chronological "what we learned in PR #X" notes |

The key rule is that **session notes are an ingestion format, not a storage format**.

## 6. Root `AGENTS.md` role

`AGENTS.md` becomes the repository constitution and router. It should contain only information with high expected value across most coding tasks:

- project identity and essential stack summary;
- workflow entry points and which skill owns specialized procedures;
- PR merge authorization invariant;
- human QA handoff invariant;
- issue/PR scope boundaries;
- mandatory TDD and canonical validation commands;
- code conventions with broad applicability;
- high-risk repository invariants whose omission could cause data loss/security/correctness failures;
- links to canonical detailed docs for subsystems.

Material that is already maintained authoritatively elsewhere should be referenced, not restated in detail. Examples to reduce from `AGENTS.md` during this PR:

- the remote-archive portion of the API endpoint table should defer to `docs/remote-archive-api-spec.md`, while first-party app endpoints that are not covered there remain summarized or move to a matching canonical app document; `AGENTS.md` keeps only API-boundary invariants and exact reference links;
- detailed design tokens should defer to `DESIGN_OVERVIEW.md`, while `AGENTS.md` keeps only the requirement to follow it for visual work;
- detailed browser-storage/reset mechanics should move to or be consolidated with `docs/browser-security-and-offline-data.md`, while `AGENTS.md` keeps the high-risk invariant and mandatory-read pointer.

This PR should be conservative: slimming is allowed only where the canonical destination already exists or is created in the same PR and information-loss checks prove coverage.

Use a non-blocking maintenance target of roughly 150–200 lines for root `AGENTS.md`, not a brittle CI hard cap. Sentry's public guidance targets even smaller root instruction files; this repository may legitimately stay larger because it carries several high-risk cross-cutting invariants.

### 6.1 Nested path-specific `AGENTS.md`

Use nested `AGENTS.md` files only when a directory has durable rules that are both important and materially narrower than repository-wide policy. Do not create nested files merely to shorten the root. The closest applicable file may take precedence in supported agents, so every nested file must assume root policy still exists and contain only local deltas.

This consolidation SHOULD add two scoped files because the source lessons already demonstrate durable local rules:

- `tests/e2e/AGENTS.md` — E2E harness/browser guidance: inspect current trace/accessibility tree/DOM before diagnosing a production regression from stale selectors; exercise production boundaries; distinguish host-browser failures from app failures; keep assertion strength engine-appropriate; avoid desktop-only fixture assumptions after responsive resize; scope console-error assertions to the behavior under test when unrelated mocked-network noise is expected.
- `src/lib/map/AGENTS.md` — shipped map/SMP invariants from #287: enforce resource bounds before expensive work; preserve deterministic archive behavior across timezone/input ordering; keep parser compatibility exceptions narrow and regression-tested; preserve the explicit glyph-vs-sprite offline resource contract; maintain cancellation through finalization waits.

The implementation must verify each local rule is already supported by shipped code/tests/spec/QA evidence before promoting it. Proposed or obsolete behavior must not enter nested instructions.

## 7. Compatibility adapters

Vendor-specific instruction files MUST be adapters, not independent policy stores.

### 7.1 Claude

Keep root `CLAUDE.md` minimal and importing `AGENTS.md` via the existing `@AGENTS.md` pattern. Do not duplicate repository policy in `CLAUDE.md`.

### 7.2 GitHub Copilot

Do **not** add `.github/copilot-instructions.md` in this PR. Current GitHub Copilot surfaces support `AGENTS.md`, and adding a second repository-wide instruction file without a demonstrated compatibility gap would create another drift surface.

If a future supported client is proven not to consume the required `AGENTS.md` instruction surface, add the smallest possible compatibility adapter then, with tests preventing duplicated normative policy.

Path-specific `.github/instructions/*.instructions.md` should NOT be added preemptively in this PR. Add them later only when a real path-specific instruction cannot be expressed safely through existing scoped docs/skills and would otherwise bloat root instructions.

### 7.3 Other agents

Do not add additional vendor files unless a concrete supported client requires one. Prefer `AGENTS.md` plus the open Agent Skills structure.

## 8. New `maintaining-agent-knowledge` skill

Create `.agents/skills/maintaining-agent-knowledge/SKILL.md`.

### 8.1 Trigger

Use when a user or workflow asks to:

- save session learnings;
- document reusable lessons;
- consolidate agent memory/instructions;
- update `AGENTS.md` from lessons;
- finish a PR cycle with durable discoveries;
- audit or reorganize repository agent knowledge.

The description should describe only these trigger conditions, not summarize the whole workflow, to preserve proper skill discovery behavior.

### 8.2 Workflow

For every candidate lesson:

1. **Classify durability**
   - transient provider outage/noise -> discard;
   - feature-specific behavior -> issue/spec/QA/code/test;
   - repository-wide invariant -> `AGENTS.md`;
   - repeatable procedure -> relevant `SKILL.md`;
   - detailed procedure/evidence technique -> relevant skill `references/`;
   - durable architecture choice -> ADR;
   - human/operator reference -> normal docs.
2. **Search before writing**
   - locate existing canonical statements and tests;
   - prefer strengthening/updating them rather than adding a parallel copy.
3. **Promote, do not append**
   - rewrite the lesson as a stable rule independent of the originating PR/session;
   - remove chronology, issue-specific anecdote, and provider noise unless necessary as evidence in an ADR/spec.
4. **Deduplicate**
   - if the lesson is already fully represented, make no documentation change;
   - if a session-memory file becomes fully absorbed, delete it.
5. **Validate discoverability and non-loss**
   - relevant skill resource link resolves;
   - future agents can locate the canonical rule from root instructions or skill metadata;
   - no unique durable statement is lost during consolidation.
6. **Report disposition**
   - list promoted, already-covered, discarded, and deferred lessons with destination/reason.

### 8.3 Guardrails

- Never create `prNNN-session-lessons.md` or similarly chronological permanent memory files.
- Never duplicate the same normative policy across `AGENTS.md`, a skill, and a vendor file.
- Do not promote an unmerged/proposed architecture decision to `AGENTS.md`.
- Do not put product architecture facts into a workflow skill merely because they were discovered during a PR cycle.
- Prefer deleting redundant notes over retaining them for provenance; Git history already preserves provenance.

## 9. `pr-cycle` integration

Refactor the current "Session lessons and documentation checkpoint" in `.agents/skills/pr-cycle/SKILL.md` so `pr-cycle` owns only the trigger/checkpoint and delegates classification/promotion to `maintaining-agent-knowledge`.

The PR-cycle skill should continue to require a final learning review, but avoid carrying a second copy of the placement taxonomy.

Expected shape:

- before concluding, identify durable candidate lessons;
- invoke/read `maintaining-agent-knowledge` when candidates exist or when the user explicitly asks to preserve lessons;
- keep implementation-specific docs out of an already-reviewed implementation PR when doing so would widen scope/invalidate evidence;
- report where promoted knowledge landed or that no durable change was warranted.

## 10. Consolidation of existing session memories

### 10.1 `pr287-session-lessons.md`

Perform a line-by-line disposition audit.

Already canonical in current PR-cycle policy/reference/tests and therefore removable as duplicate once verified:

- exact head/live-base-tip truth and invalidation;
- live-target synchronization behavior;
- reviewer/provider failure not being approval;
- bounded liveness probes;
- command-ceiling handling and bounded shards;
- separate docs/process PR for unrelated lesson capture;
- soft-fail/exact-SHA integrated-branch evidence where already covered.

Promote remaining generic QA/review lessons into stable topical references, especially:

- reviewer findings are hypotheses that require adjudication against the normative spec;
- browser host/environment failure must not be misclassified as product failure;
- QA should exercise the actual production boundary, not a weaker mock/primitive;
- assertion strength may legitimately differ across browser engines when the renderer/host makes a pixel oracle unreliable.

Promote shipped product-specific lessons to the scoped `src/lib/map/AGENTS.md` when they are durable instructions for future edits, while keeping the detailed evidence in existing product docs/tests:

- archive-parser compatibility details become a concise "narrow, regression-tested exceptions only" invariant;
- MapLibre glyph/sprite behavior becomes a concise offline-resource contract pointer;
- SMP resource caps become a "bounds before expensive work" invariant rather than repeating numeric details already encoded in tests/specs;
- deterministic archive-generation behavior becomes a cross-timezone/input-order determinism invariant.

For each item, confirm it is already represented in shipped code/docs/spec/tests before promotion. If an item is not stable or is only feature history, do not preserve it as agent policy.

After all unique durable material has a canonical home, delete `pr287-session-lessons.md`.

### 10.2 PR #343 / `pr341-session-lessons.md`

Do not merge PR #343 as a permanent session-note pattern.

Absorb its three durable lessons into stable QA-evidence guidance:

- skipped E2E TODOs/comments/selectors are historical evidence; inspect current trace/accessibility tree/DOM before diagnosing production;
- direct probes of the exact deployed artifact may supplement UI QA for narrow runtime/protocol invariants, but never replace surrounding real product-flow QA;
- exact-SHA CI may substitute for an unavailable local browser engine only when the relevant engine and relevant test actually ran, with masked outcomes inspected.

Then close PR #343 as superseded by the consolidation PR, with a link to the new PR once created.

## 11. Stable topical PR-cycle references

Prefer topic names instead of PR numbers.

Create or consolidate at minimum:

### `references/qa-evidence.md`

Owns reusable rules for:

- production-boundary QA;
- current-DOM/trace diagnosis for stale E2E harnesses;
- direct exact-deployment artifact probes;
- browser-engine substitution via exact-SHA CI;
- engine-specific assertion strength;
- navigation/refresh/mobile/desktop regression matrices when relevant;
- distinguishing environment failures from application failures;
- synchronization between human QA runbooks and executable helpers;
- inspecting masked/soft-fail outcomes (with `github-runbook.md` remaining canonical for GitHub CLI mechanics).

### `references/review-evidence.md`

Owns reusable reviewer-adjudication concepts that are too detailed for the core workflow:

- reviewer findings are hypotheses, not commands;
- adjudicate against issue/spec/current implementation;
- convert confirmed correctness findings to RED tests when practical;
- explain rejected findings using invariants/evidence;
- frozen exact-diff fallback limitations.

Provider-specific transport remains in the existing Claude/Kimi/Qwen references.

Avoid deep reference chains. `SKILL.md` links directly to each relevant reference, consistent with the Agent Skills specification.

## 12. Architecture Decision Records

Introduce a lightweight `docs/adr/README.md` convention for future durable architecture decisions.

Use ADRs only for choices with meaningful alternatives/consequences that future implementers may otherwise reopen. Do not convert every existing design doc into an ADR.

Minimum ADR format:

- title/status/date;
- context;
- decision;
- consequences/trade-offs;
- links to superseded/superseding ADRs when applicable.

Pending/unmerged proposals remain specs/issues and MUST NOT be represented as accepted ADRs or root architecture.

## 13. Automated knowledge-policy tests

Extend the existing `pr-cycle-skill-tests` CI context rather than renaming it.

Add tests covering at least:

1. no tracked `pr[0-9]+-session-lessons.md` or analogous session-memory files under `.agents/skills/`;
2. `pr-cycle/SKILL.md` references `maintaining-agent-knowledge` and does not contain a competing full placement taxonomy;
3. all direct skill resource links used by the affected skills resolve;
4. `CLAUDE.md` remains a minimal adapter importing `AGENTS.md`;
5. no new vendor-wide instruction file is introduced without a documented compatibility need;
6. knowledge-maintenance skill contains the canonical placement classes and prohibition on chronological memory files;
7. session-memory migration audit fixture/check confirms every section of #287 and #341 is classified as promoted/already-covered/product-specific/discarded before source note deletion.

Prefer deterministic text/structure tests over subjective token-count thresholds. A lightweight size guard may warn but should not become a brittle exact line-count contract unless future drift shows it is necessary.

## 14. Migration manifest

During implementation, create a temporary or committed audit artifact that maps every source lesson to its disposition. The final form should be useful for reviewers but should not become another memory dump.

Preferred durable artifact: `docs/adr/0001-agent-knowledge-architecture.md` recording the architecture decision itself, with a concise migration table or linked PR description showing the one-time #287/#341 disposition. The detailed chronological source notes should still be deleted after review confirms non-loss.

## 15. Documentation precedence and conflict rules

When guidance overlaps, use this precedence model:

1. explicit current user instruction;
2. nearest applicable `AGENTS.md` / repository agent instruction according to client semantics;
3. activated skill workflow for the requested task;
4. accepted ADR/current architecture docs for architectural facts;
5. feature spec/issue for that implementation's normative requirements;
6. QA docs for verification procedure;
7. historical Git/PR discussion as evidence only, never canonical instruction.

This model is about canonical placement, not overriding platform-level/system safety rules.

## 16. Proposed implementation sequence

The consolidation can remain one focused docs/process PR because it changes one cohesive concern: agent knowledge architecture.

1. Add the approved design and ADR convention.
2. Add `maintaining-agent-knowledge` skill and tests.
3. Create `qa-evidence.md` and `review-evidence.md` from promoted workflow lessons.
4. Add scoped `tests/e2e/AGENTS.md` and `src/lib/map/AGENTS.md` for verified path-specific invariants.
5. Refactor `pr-cycle` to delegate learning promotion and link topical references.
6. Slim root `AGENTS.md` only where exact canonical destinations are proven.
7. Keep compatibility adapters minimal; do not add a Copilot-specific file without a demonstrated gap.
8. Perform the full #287/#341 migration audit and delete session-memory files.
9. Extend policy tests and validation.
10. Open the consolidation PR.
11. Close #343 as superseded, linking the consolidation PR.
12. Run the normal full PR cycle, independent exact-SHA review, and CI.
13. Do not merge without explicit user authorization.

## 17. Acceptance criteria

The PR is complete only when all of the following hold:

- there is no permanent PR-numbered session-memory file;
- every durable #287 and #341 lesson has an explicit reviewed disposition;
- no reusable lesson is lost;
- all normative workflow rules have exactly one canonical home;
- root `AGENTS.md` is more router/constitution-like and contains less duplicated reference material;
- path-specific E2E and map/SMP rules are discoverable from nested `AGENTS.md` files without duplicating root policy;
- `pr-cycle` remains operationally complete but delegates knowledge promotion;
- `maintaining-agent-knowledge` is discoverable by trigger metadata and has clear placement rules;
- skill references use stable topical names and one-level links;
- existing vendor compatibility files do not fork policy, and no unnecessary new vendor-wide instruction surface is introduced;
- architecture decisions have a lightweight ADR home;
- affected skill/policy tests and formatting checks pass;
- independent review explicitly checks information preservation, precedence, discoverability, and absence of contradictory instructions;
- PR #343 is closed as superseded only after the replacement PR exists;
- merge remains separately authorized.

## 18. Risks and mitigations

### Risk: over-slimming root instructions hides critical invariants
Mitigation: only remove detail when a canonical destination exists, retain high-risk invariant summaries/pointers, and require non-loss review.

### Risk: new knowledge-maintenance skill creates bureaucracy
Mitigation: keep the skill short; most sessions should classify many observations as already-covered or transient and make no docs change.

### Risk: multiple instruction surfaces drift
Mitigation: make vendor files adapters and add policy tests against duplication.

### Risk: session provenance is lost when raw notes are deleted
Mitigation: Git history and PR discussions preserve provenance; canonical docs preserve only reusable knowledge. The accepted ADR records the structural decision, not chronological anecdotes.

### Risk: product-specific knowledge is accidentally moved into agent workflow docs
Mitigation: migration manifest requires explicit classification, and independent review checks placement.

## 19. Final design decision

Adopt a **promotion architecture** based on progressive disclosure:

> Chats produce observations. Sessions produce candidate lessons. The repository stores only promoted knowledge in one canonical home.

`AGENTS.md` is the constitution/router, skills are repeatable workflows, skill references hold detailed workflow knowledge, ADRs preserve durable architecture decisions, normal docs preserve subsystem truth, QA docs preserve issue-specific verification, and raw session narratives are deleted after promotion.
