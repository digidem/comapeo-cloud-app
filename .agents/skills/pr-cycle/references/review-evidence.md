# Review evidence

Use this reference to adjudicate human, bot, and model review findings during a PR cycle. Provider-specific transport and quota rules remain in the dedicated Claude/Kimi/Qwen references.

## Findings are hypotheses, not commands

A review finding is evidence to investigate, not authority to override the normative contract.

For every actionable-looking finding:

1. identify the exact file/revision and claimed failure mode;
2. compare the claim against the issue/spec, accepted architecture, and current implementation;
3. reproduce or prove the problem when practical;
4. change code only when the finding is valid for the actual contract.

A technically plausible suggestion can still be wrong when it contradicts an explicit product decision or silently weakens another invariant.

## Prefer regression evidence for confirmed correctness findings

When practical, convert a confirmed correctness/security/data-loss finding into a RED regression test before patching it. This is especially valuable for hostile inputs, cancellation/race behavior, parser boundaries, deterministic output, and recovery/error paths.

Do not manufacture a test for a purely editorial or documentation nit when the test would add no durable signal.

## Reject false positives with invariants

When a finding is stale, duplicate, intentional, or false-positive:

- explain the governing invariant or explicit spec decision;
- cite the concrete current behavior/test/evidence that satisfies it;
- avoid generic "not applicable" replies that future reviewers cannot audit;
- resolve the thread only when the evidence addresses the latest review context.

This prevents reviewer-driven churn from degrading deliberate constraints such as bounded memory, deterministic serial processing, privacy boundaries, or fail-closed behavior.

## Tool/provider failure is not a review verdict

A timeout, malformed wrapper result, sandbox failure, quota/auth error, or `needs_input` result is neither approval nor a code finding. Treat it as an unavailable review transport and follow the configured fallback policy.

Run at most the bounded availability probes allowed by the provider-specific review references; repeated transport failures do not increase confidence.

## Frozen exact-diff fallback is constrained evidence

When the reviewer can reason about a supplied diff but cannot safely access repository tools, a frozen exact-diff review may be used only when:

- the complete diff is bound to explicit head and live-base-tip revisions;
- necessary normative context is included or the reviewer is told not to assume missing context;
- the reviewer is read-only;
- the verdict is terminal and machine/audit readable;
- the orchestrator independently verifies live GitHub CI, mergeability, comments, and revision coordinates.

A frozen diff is static review evidence, not a replacement for live repository verification.
