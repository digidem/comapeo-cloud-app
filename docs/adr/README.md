# Architecture Decision Records

Use an ADR for a durable repository architecture choice when meaningful alternatives existed and future contributors might otherwise reopen the decision without its context.

Do not use ADRs for temporary implementation plans, issue-specific acceptance criteria, QA procedures, or architecture proposals that have not been accepted. Pending design remains in its issue/spec until the decision is approved; an ADR introduced by a PR becomes repository policy only when that PR lands.

## File naming

Use sequential four-digit identifiers:

```text
0001-short-decision-name.md
0002-next-decision.md
```

Do not renumber existing ADRs.

## Minimum format

Each ADR should contain:

```md
# ADR NNNN: Decision title

- Status: Proposed | Accepted | Superseded
- Date: YYYY-MM-DD
- Supersedes: ADR NNNN, if applicable
- Superseded by: ADR NNNN, if applicable

## Context

Why the decision is needed, including material constraints and alternatives.

## Decision

The chosen architecture and its boundaries.

## Consequences

Positive consequences, trade-offs, migration implications, and constraints future work must preserve.
```

Keep operational commands, detailed QA, and workflow mechanics in their canonical skills/runbooks rather than copying them into an ADR. Link to those sources when useful.

When a later decision replaces an ADR, add the reciprocal `Supersedes` / `Superseded by` links and keep the old ADR for decision history.
