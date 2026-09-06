---
name: maintaining-agent-knowledge
description: Consolidate, preserve, or promote durable session learnings and agent memory into canonical repository instructions. Use when asked to save lessons, document reusable learnings, update AGENTS.md from a session, consolidate agent memory, or when another workflow identifies durable knowledge that should survive the current task.
---

# Maintaining Agent Knowledge

Promote durable knowledge into one canonical repository home. Do not preserve a session transcript merely because something useful happened during it.

## Core rule

**Chats produce observations. Sessions produce candidate lessons. The repository stores only promoted knowledge.**

Raw session notes are an ingestion format, not a permanent documentation format. Git history and PR discussion already preserve provenance.

## 1. Classify before writing

Classify each candidate lesson by what future work actually needs:

| Candidate | Canonical home |
| --- | --- |
| Transient provider outage, one-off command noise, temporary environment state | Discard |
| Feature- or issue-specific behavior/evidence | Issue/spec, `docs/qa/`, code, or regression test |
| Repository-wide coding, safety, validation, or architecture invariant | Root `AGENTS.md` |
| Path-specific durable rule | Nearest scoped `AGENTS.md` |
| Repeatable agent procedure | Relevant `.agents/skills/<skill>/SKILL.md` |
| Detailed workflow/evidence technique | Relevant skill `references/*.md` |
| Durable architecture decision with meaningful alternatives/consequences | `docs/adr/` |
| Human/operator reference material | Normal repository docs |

Do not promote proposed or unmerged architecture into root or scoped `AGENTS.md`; keep it in the issue/spec until it lands.

## 2. Search before writing

Before adding anything:

1. Search root and nested `AGENTS.md`, relevant skills/references, ADRs, specs, QA docs, code comments, and regression tests for the same invariant.
2. If the lesson is already fully represented, make no documentation change.
3. If the existing canonical statement is incomplete, strengthen that statement instead of adding a parallel copy.
4. Prefer a cross-link when another document owns the details.

One normative rule should have one canonical home.

## 3. Promote, do not append

Rewrite a durable lesson as stable guidance independent of the originating PR/session:

- remove chronology and conversational history;
- remove issue numbers unless the issue is necessary evidence rather than provenance;
- remove temporary provider/tool noise;
- keep the invariant, trigger, failure mode, and verification requirement;
- put detailed examples next to the workflow or subsystem that needs them.

Never create permanent files named like `prNNN-session-lessons.md`, `session-memory.md`, or other chronological memory dumps. If an existing session-note file has been fully absorbed, delete it.

## 4. Prefer progressive disclosure

Keep always-loaded guidance short and high-salience:

- root `AGENTS.md` is the repository constitution/router;
- nested `AGENTS.md` contains only local deltas;
- `SKILL.md` contains the reusable procedure and links directly to one-level references;
- references contain detailed workflow mechanics/evidence;
- ADRs preserve accepted architectural decisions;
- normal docs preserve subsystem truth;
- QA docs preserve issue/PR-specific verification.

Do not create vendor-specific policy forks. Compatibility files should point to canonical shared instructions whenever the client supports that model.

## 5. Validate before deleting source notes

When consolidating existing memory:

1. Enumerate every source heading or distinct durable claim.
2. Record a disposition for each: already canonical, promoted, retained as product evidence, or discarded as non-durable with a reason.
3. Verify the destination exists and is discoverable from the relevant root/scoped instruction or activated skill.
4. Check that no contradictory duplicate remains.
5. Delete the chronological source note only after every durable item is accounted for.

For a non-trivial migration, keep the one-time disposition manifest in the architecture PR/ADR rather than preserving the raw session narrative.

## 6. Scope process changes safely

If promoting lessons would materially widen an already-reviewed application PR, use a focused docs/process follow-up rather than invalidating unrelated implementation evidence. That follow-up follows the normal PR-cycle gate and does not inherit merge authorization from the originating task.

A lessons-only follow-up should not recursively create another lessons PR unless it reveals a genuinely new durable gap.

## 7. Report disposition

At the end, report candidate lessons in four groups:

- **promoted** — canonical destination;
- **already covered** — existing canonical destination;
- **discarded** — why the observation is not durable;
- **deferred** — only when another active spec/issue is the correct authority.

If nothing durable warrants a repository change, say so explicitly rather than creating documentation for its own sake.
