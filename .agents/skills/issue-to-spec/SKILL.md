---
name: issue-to-spec
description: Turn a GitHub issue or feature idea into one or more implementation-ready, PR-sized issue specs. Use when asked to spec/refine an issue, make an issue ready for development, split an oversized issue, resolve product/architecture questions before implementation, or review/publish implementation-ready child issues and parent trackers.
---

# Issue to Spec

Produce implementation-ready GitHub issues without drifting into implementation. Read repository `AGENTS.md` first and treat it as higher-specificity policy.

## Core contract

- **One executable implementation issue = one independently mergeable implementation unit.** If the draft naturally says “PR1 then PR2”, has a hard internal merge gate, or contains two independently reviewable objectives that should land separately, split it into child issues before marking anything implementation-ready.
- Keep umbrella/architecture issues as **parent trackers**, not executable work. Parent trackers must not carry `agent:ready-for-implementation` or `lane:implementation`.
- Do not implement code while running this skill unless the user separately asks for implementation after the spec phase.
- Resolve product decisions before finalizing architecture. Ask only the smallest material set of user questions; prefer a clear recommendation when repository/upstream evidence supports one.
- Ground technical decisions in the current codebase and current upstream primary documentation. Re-check unstable upstream APIs/versions before publishing a spec that depends on them.
- A reviewer timeout, provider error, empty output, stale artifact, or partial review is **not approval**. Count only a terminal verdict on the exact current spec.
- If the user explicitly requires a reviewer/model (for example Claude Opus 5), do not silently substitute another model. Alternate provider routes for the **same exact model** are acceptable when the named model is available through them. If every configured route for that exact model is genuinely unavailable after bounded retries/provider checks, mark the review gate **blocked** and report that limitation; do not wait forever and do not manufacture approval from a different model.
- When this skill itself calls for Opus 5 because a spec is high-risk but the user did **not** explicitly require Opus, use the workspace `pr-cycle` reviewer-fallback policy after bounded Opus/provider checks (currently Kimi K3 via OpenCode Go/Oh My Pi when available). The fallback must remain read-only and terminal; never treat unavailable Opus as implicit approval. An explicit user requirement for Opus still follows the stricter blocked rule above.

## 1. Establish current truth

Before drafting:

1. Read the full issue body, comments, linked issues/PRs, labels, and existing dependency notes.
2. Read `AGENTS.md` and relevant workspace skills.
3. Inspect the current implementation surfaces, schemas, tests, fixtures, deployment workflows, and persistence boundaries that constrain the feature.
4. Verify external/upstream capabilities from primary sources when the feature depends on an external API/library/service. Do not invent private integration contracts when a supported/versioned boundary is required.
5. Identify already-decided product behavior separately from technical implementation choices.

Do not ask the user to choose low-level implementation details that the codebase/upstream evidence can resolve safely.

## 2. Start with the simplest product model

For an under-specified feature, first explain the feature in a short user-readable flow and settle product ownership boundaries before writing the full spec.

Good product questions decide things such as:

- what the feature is for;
- what state is durable vs temporary;
- what the user expects on Done/Cancel/failure;
- offline/privacy behavior;
- desktop/mobile expectations;
- which system owns the source of truth.

Ask 1–3 material questions at a time. Record accepted recommendations as decisions and do not repeatedly reopen them without new evidence.

## 3. Decide whether to split before final spec

Treat any of these as a strong split signal:

- the draft contains “PR1 / PR2” or “phase 1 / phase 2” with a merge gate between them;
- one part establishes a reusable persistence/schema/package foundation and another consumes it in product UI;
- one part proves an external bridge/upstream capability while another ships production UX;
- two parts can be implemented/reviewed/merged independently after a shared prerequisite;
- one issue has acceptance criteria that cannot all be satisfied by one coherent PR;
- a safe dependency graph allows parallel work after a foundation lands.

When splitting:

1. Create concise child shells as `agent:spec-in-progress` + `lane:spec` first.
2. Give each child one objective and one clear ownership boundary.
3. Write an explicit acyclic dependency graph.
4. Keep shared canonical types/fixtures/functions owned by exactly one child; downstream children import them rather than recreating compatible-looking local contracts.
5. Give every dependent child an explicit **implementation-start gate** against the merged target base (for example “depends on #279 merged/green” plus named required symbols/tests). A consumer child may be fully spec-reviewed and labeled implementation-ready before its foundation merges, but implementation must not begin until those dependency artifacts exist on the actual target base branch.
6. Convert the original issue into a concise parent tracker only during the final publication stage, after every child spec is terminal P1/P2-clear and the cross-child dependency/interface seam is also clear.

A useful pattern is:

```text
foundation
  ├──> persistence/product substrate
  └──> external bridge/adapter

all prerequisites
  └──> final product integration/rollout
```

## 4. Write each child as a self-contained implementation contract

Each executable child should normally include:

- `Status: implementation-ready` only after review is complete;
- parent tracker and exact dependency gate;
- goal and non-goals;
- product behavior/UX relevant to that child;
- current-code constraints;
- exact ownership boundary and exported/consumed interfaces;
- security/privacy/offline/failure behavior where relevant;
- migration/backward-compatibility rules where relevant;
- key implementation files or module boundaries when they reduce ambiguity;
- deterministic acceptance criteria and required tests;
- explicit hard-stop conditions for a failed technical spike rather than an implicit architecture rewrite.

### Cross-child interface rule

If child B depends on APIs/types owned by child A:

- A is the source of truth and must name/export the concrete symbols;
- B should name the exact imports it consumes;
- when useful for handoff clarity, B may include a **consumer snapshot** of those imported signatures, clearly marked as a snapshot rather than a second runtime definition;
- changes to a shared contract happen in the owning issue first, followed by dependent-spec review.

Never leave phrases such as “translate through the adapter”, “validate context”, or “use the bridge” without a named boundary when the exact handoff controls correctness/data loss/security.

### Atomic update rule

For full-replacement or import/editor flows, specify the sequence through untrusted translation -> canonical validation -> contextual validation -> one atomic state mutation. Explicitly state who owns stable IDs, duplicate detection, order preservation, recovery placeholders, and failure/no-partial-update behavior.

### External integration rule

For a third-party embedded app/library:

- prefer supported/versioned APIs and a pinned/self-hosted artifact when privacy/stability requires it;
- prefer a small generic upstream contribution over copying components or creating a permanent fork;
- if a temporary downstream patch is allowed, bound its exact surface, content-address it, test it, submit the same generic change upstream, and hard-stop if the required change exceeds that boundary;
- record upgrade/patch-retirement procedure and security/profile assumptions.

## 5. Review loop

Review **each executable child independently** before publication. For high-risk architecture/security/data/release work, or whenever the user requests it, use Claude Opus 5.

For each child:

1. Review the exact current artifact.
2. Ask for prioritized P1/P2/P3 findings; `p1_p2_clear=true` only when no unresolved P1/P2 spec gap remains.
3. Fix every P1/P2 finding and worthwhile P3 that improves handoff correctness.
4. Re-run the affected review; a change that modifies a shared interface also requires re-review of the owning child and affected dependent seam.
5. Do not count a timeout/API error/terminated invocation as either a pass or a finding.

Large specs may exceed reviewer transport limits. Split review by **complete semantic sections**, not arbitrary truncation, and follow with a compact cross-section/interface check. A slice reviewer must be told which contracts live in other slices/dependency specs so absence from the slice is not falsely reported as absence from the specification.

After all children are individually clear, run cross-child seam reviews for at least:

- dependency direction/cycles and parallelization;
- exact exported/consumed types/functions/fixtures;
- identity/order/atomic validation ownership;
- raw-recovery vs canonical-data boundaries;
- CI phase/prerequisite markers;
- external bridge vs product/deployment ownership;
- rollout/rollback state if release engineering spans children.

### Failed feasibility / abandoned split

If a required spike proves the specified architecture infeasible or a requested reviewer finds a product/architecture decision that cannot be resolved safely without human input:

- do not promote the affected child to implementation-ready;
- mark it `agent:blocked` (or keep it in spec lane with the repository's needs-info label when a human product decision is the blocker) and put the exact hard-stop evidence in the body/comment;
- update dependent child shells and the parent tracker to show the blocked dependency so an implementation agent cannot start them accidentally;
- if a new architecture supersedes the split, close or explicitly mark superseded child shells after the replacement issues exist—never silently delete or leave ambiguous executable-looking shells behind.

## 6. Publish atomically and label correctly

Do not mark child shells implementation-ready before their exact bodies pass the review loop.

### Workflow label contract

Before the first issue mutation, read the repository's live label taxonomy and require the workflow labels used by this skill to exist. The expected CoMapeo states are:

- drafting child: `agent:spec-in-progress` + `lane:spec`;
- implementation-ready child: `agent:ready-for-implementation` + `lane:implementation`;
- blocked child: `agent:blocked`, or `agent:spec-needs-info` + `lane:spec` when a human product/spec decision is specifically required;
- parent tracker: **no spec/implementation workflow status label and no spec/implementation lane label**. Preserve ordinary classification labels such as `enhancement` and `difficulty:*`.

If the repository's live taxonomy differs or one of those labels is absent, do not silently invent/create a parallel taxonomy. Use the established equivalent when unambiguous; otherwise block the mutation and report the mismatch.

For each reviewed child:

1. Replace the shell body with the exact reviewed spec.
2. Remove `agent:spec-in-progress` and `lane:spec`.
3. Add `agent:ready-for-implementation` and `lane:implementation`.
4. Preserve the appropriate enhancement/difficulty labels.
5. Re-read GitHub and verify body status/dependencies/critical seam text plus labels; do not assume a successful mutation means the body was not truncated or altered.

Then rewrite each umbrella issue as a concise parent tracker containing:

- child checklist;
- dependency graph;
- durable product/architecture decisions;
- explicit “do not implement directly” status.

Do **not** give a parent tracker executable implementation labels.

Immediately before replacing a human-authored umbrella body, add one concise issue comment containing the original body (or, if GitHub size limits make that impractical, a lossless linked/attached snapshot or a content hash plus the repository/GitHub edit-history location). State that the snapshot is the pre-parent-tracker body. This makes the destructive rewrite auditable from the issue thread itself even though GitHub also retains edit history.

Record review evidence in issue comments when it will help future agents distinguish the published reviewed body from earlier drafts. Keep the comment concise and name the reviewer/model plus whether P1/P2 findings remain.

## 7. Readiness gate

Call the spec set ready for implementation only when all of these are true:

- every executable child has one independently mergeable objective;
- every child body is implementation-ready and published;
- every child has `agent:ready-for-implementation` + `lane:implementation` and no spec-in-progress/spec-lane label;
- parent trackers are non-executable and reference all children/dependencies correctly;
- all requested independent reviewer loops are terminal and P1/P2-clear on the current artifacts/deltas;
- cross-child seam review is P1/P2-clear;
- external/upstream facts relied on by implementation have been verified recently enough for the task;
- no unresolved product decision remains;
- implementation order/parallel lanes are explicit.

## Handoff to implementation

Implementation agents should start from a child issue, never the parent tracker. Before coding, verify dependency artifacts against the **actual target base branch**, not issue labels/comments alone. A dependency label saying “done” is not a substitute for required symbols/tests being present in the base commit.
