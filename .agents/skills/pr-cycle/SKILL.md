---
name: pr-cycle
description: Run a pull request through the full autonomous review, fix, CI, merge-readiness, and authorized merge/cleanup lifecycle. Use when the user says "PR cycle", asks to make a PR fully mergeable or merge-ready, asks to address review comments and CI until green, requests repeated frontier-model review/fix loops, or authorizes merging and cleanup of a reviewed PR. Treat a PR-cycle request as authorization to fix, push, and resolve actionable review feedback autonomously, but never merge unless the user explicitly authorizes merge.
---

# PR Cycle

Drive one PR to a defensible merge-ready state without disturbing unrelated work. Apply repository `AGENTS.md` and local instructions as higher-specificity constraints. Reuse generic GitHub skills such as `gh-address-comments`, `gh-fix-ci`, and `yeet` as component workflows when useful.

## Core contract

- Work autonomously through review comments, CI failures, fixes, commits, pushes, and repeated verification once the user requests a PR cycle.
- Never merge merely because the PR is ready. Stop and signal the human unless the user explicitly authorizes merge in the current request.
- Treat explicit language such as "merge when ready" as merge authorization. Do not infer authorization from a prior readiness request.
- Protect unrelated worktrees and dirty working trees. Never reset, clean, stash, stage, commit, or delete unrelated user work.
- Evaluate readiness against the exact pushed head SHA and the current live target-branch tip. Any new push or base-tip movement invalidates the previous final review/readiness verdict.
- Treat command timeouts as execution-surface limits, not automatically as test/review failures. Never retry the same broad long-running command unchanged; switch to bounded polling, narrower validation, or a resumable execution surface. See `references/timeout-strategy.md`.
- Prefer squash merge unless repository policy or the user explicitly requests another strategy.

## 1. Resolve scope and isolate work

1. Resolve repository, PR number or URL, base branch, head branch, and current head SHA.
2. Read repository instructions before editing.
3. Inspect existing worktrees and working-tree state.
4. If implementation or fixes are needed, use an isolated worktree for the PR branch. Reuse an existing clean PR worktree when one already exists.
5. If the main/default worktree is dirty, leave it untouched and never switch its branch for convenience.
6. Snapshot unrelated worktree paths so cleanup can be scoped later.

Use `scripts/pr_snapshot.py` for a conservative GitHub-side state snapshot when `gh` is available. Once a pushed/reviewed head SHA and live target-branch tip are known, pass both with `--expect-head` and `--expect-base-tip` so the snapshot fails if either revision moves during verification. See `references/github-runbook.md` for canonical command patterns.

## 2. Establish current truth

Before changing code, collect all of the following for the current head:

- PR state and draft status
- exact head SHA and live target-branch tip SHA
- mergeability and merge-state status
- complete CI/check rollup, including pending and skipped jobs
- review decision and reviews
- thread-aware unresolved review comments, not only top-level comments
- current branch/worktree cleanliness

Fail closed when required state cannot be read. Do not call a PR merge-ready based on partial GitHub data.

## 3. Run the fix loop

Repeat until there are no actionable findings on the current head:

1. Inspect unresolved review threads with thread-level state. For automated or bot-generated findings, verify the claim against the exact current head before editing. If a finding is a false positive, stale, duplicate, or already satisfied, reply with precise evidence and resolve it without creating code churn; otherwise treat it as actionable.
2. Inspect failed CI logs and relevant external-check details. Fix failures caused by the PR without changing unrelated code to mask unrelated infrastructure failures.
3. Follow repository development rules, including required TDD and validation practices.
4. Run narrow relevant tests first. Split local validation into bounded lint/type/test/build shards when the full command is likely to exceed the tool ceiling; let GitHub CI provide the full-suite signal when repository CI already covers it.
5. Commit and push intentional changes on the PR branch only. If a pre-push hook duplicates already-passed validation and routinely exceeds the execution ceiling, run that validation explicitly in bounded shards, then use `--no-verify` for the push and record what was independently verified; never use this to skip an unrun required check.
6. Once a fix is pushed and validated, reply to addressed actionable threads. Resolve a thread only when its requested change is fully satisfied and the latest thread context does not indicate that reviewer follow-up is still needed; a PR-cycle request authorizes this resolution behavior for addressed feedback.
7. Record the new pushed head SHA. All earlier readiness and reviewer verdicts are now stale.

Do not stop after the first green CI run if unresolved actionable review feedback remains.

## 4. Independent merge-readiness review loops

When the user requests a specific reviewer or model, use it. Otherwise use an available strong independent reviewer when the environment supports one and the change risk justifies it.

For Claude Code, prefer supervisor-backed background review over synchronous `claude -p`: use `pr_snapshot.py` to read the exact pushed head and **live target-branch tip**, explicitly fetch that target branch into its remote-tracking ref, then use `scripts/claude_review.py start` with both SHAs. Do not use PR `baseRefOid` / REST `base.sha` as the live base tip because the target branch can advance while those remain pinned to an older PR base. The helper computes and records the merge-base, requires a clean PR worktree, uses subscription-compatible `--safe-mode --bg`, isolates the initial review from hooks/plugins/MCP/custom startup state, and validates a SHA-bound machine-readable verdict. After any push **or base-tip movement**, treat the prior review as stale; stop a still-running stale review before dispatching a fresh one. Read `references/claude-code-review.md` before using or debugging this path.

When Opus 5 is unavailable because of quota, subscription limits, provider outage, or local Claude tooling failure, and the user did **not** explicitly require Opus, fall back to **Kimi K3 via OpenCode Go** instead of treating the missing Opus review as approval or blocking the cycle indefinitely. Prefer Oh My Pi with `opencode-go/kimi-k3` when a working `pi`/ACP path is available; otherwise use OpenCode Go directly with `opencode-go/kimi-k3`. Keep the fallback review read-only, bind it to the exact head/base-tip pair, require a terminal verdict, and apply the same blocker/should-fix/nit rules as any other reviewer. Read `references/kimi-k3-review.md` before dispatching or debugging this fallback. If the user explicitly required Opus 5, do not substitute Kimi silently. Do not use Ultrareview in the normal PR cycle.

For each independent review:

- Review a fresh view of the exact current pushed head against the exact current target-branch tip; record both revision coordinates.
- Do not prime the reviewer with the desired verdict.
- Ask it to categorize findings into blockers, should-fix issues, and non-blocking nits.
- Fix blockers and should-fix findings, push, refresh the live target-branch tip, then start a fresh review of the new head/base-tip pair.
- Address nits when they materially improve the codebase, including correctness, security, data-loss prevention, maintainability, test quality, clarity, or operability, even when they are non-blocking. Skip purely cosmetic or preference-only nits whose value does not justify another revision cycle. Any pushed nit fix invalidates the reviewed head/base-tip pair, so refresh the live base tip and rerun the exact-SHA review and CI gate. After two consecutive nit-only revision cycles, continue only for newly surfaced nits with clear correctness, security, data-loss, or operability risk or unusually high maintenance/test value; otherwise defer remaining marginal nits rather than creating indefinite review churn.
- Keep static reviewer work separate from live GitHub verification; CI, mergeability, and review-thread state are always verified independently.
- Prefer detached/resumable reviewer execution when supported. A shell timeout around a background dispatch or bounded poll does not imply the reviewer failed; inspect the persisted session state before deciding.
- Count a model verdict only when it is terminal, structurally valid, and tied to the exact reviewed head/base-tip pair. A malformed, missing, stale-revision, failed, or needs-input result is not approval.
- If the user explicitly required a named reviewer/model, do not silently substitute another reviewer. Complete the requested reviewer path or report the tooling limitation.

A final reviewer verdict applies only to the exact head/base-tip pair it reviewed.

## 5. Merge-ready gate

Before the final gate, wait for CI with short probes or `scripts/pr_wait.py`; do not use `gh pr checks --watch` in a bounded shell environment because normal PR suites can legitimately run longer than the shell ceiling.

Declare `MERGE-READY` only when all of these are true simultaneously for one exact head/base-tip pair:

- PR is open and not draft.
- Current GitHub head SHA and current live target-branch tip equal the pair used for final review and verification.
- GitHub reports the PR mergeable and clean, or an explicitly understood repository-equivalent state.
- All required and relevant checks are terminal and green. Treat every skipped or neutral check as requiring explicit adjudication before readiness; only clearly legitimate conditional skips are acceptable. Pending, queued, running, cancelled, timed-out, action-required, or failing relevant checks are not.
- A green wrapper job is not sufficient when a relevant command is masked by `continue-on-error`, soft-fail logic, or equivalent workflow behavior. Determine the pre-mask result: prefer an explicit step `outcome` or equivalent workflow-exported signal; if tooling exposes only the post-mask `conclusion`, inspect logs for the underlying command result. A `conclusion: success` after `continue-on-error` is not enough; explicitly adjudicate the underlying command before treating the check as green. Keep the gate policy here; use `references/github-runbook.md` for the bounded GitHub job/step/log inspection commands.
- GitHub review decision is not `CHANGES_REQUESTED` or `REVIEW_REQUIRED`; a top-level blocking review counts even when it created no inline review thread.
- No unresolved actionable review threads remain.
- No outstanding blocker or should-fix finding remains from requested independent reviewers.
- Local PR worktree is clean after the final push.
- Repository-specific merge gates are satisfied.

Never substitute a reviewer saying "looks good" for this full gate.

If merge is not authorized, stop here and report the exact reviewed head/base-tip pair as ready for human merge authorization.

## 6. Authorized merge

Only after explicit authorization:

1. Re-read live PR state immediately before merging.
2. Confirm both the head SHA and live target-branch tip still equal the reviewed merge-ready pair. If either changed, return to the review/CI loop.
3. Reconfirm terminal-green CI, unresolved thread state, and clean mergeability with a fresh `pr_snapshot.py` check bound to both SHAs.
4. Perform a squash merge with an atomic exact-head guard. If the available GitHub tooling cannot enforce the reviewed head SHA at merge time, do not merge; report the tooling limitation instead. Never bypass repository protections with an administrative override unless the user explicitly authorizes that separate override.
5. Verify GitHub reports the PR merged and capture the resulting merge commit SHA.
6. Do not begin branch/worktree cleanup until merge verification succeeds.

## 7. Scoped cleanup

Clean only resources belonging to the merged PR. Use the exact isolated worktree and local branch captured at cycle start; treat similarly named issue/feature worktrees or branches as unrelated unless exact identity and tip equivalence are proven.

1. Confirm the isolated PR worktree is clean, including no untracked files that need preserving. Never force-remove a PR worktree to bypass a dirty-worktree check.
2. Before deleting any branch, prove the local PR branch has no unpushed commits: if its remote-tracking branch exists, require the local tip to equal that remote tip; if the remote branch is already absent, require the local tip to equal the PR head SHA recorded at verified merge time. If either check fails, preserve the branch and report it instead of cleaning it up.
3. Remove the PR remote branch if it still exists. If a repository pre-push hook runs on branch deletion and only replays validation already satisfied for the verified merged head, it may be bypassed for this cleanup-only delete with `git push --no-verify origin --delete <branch>` after step 2's exact tip-parity proof. Never use this exception to skip validation for a code push or before merge verification. Keep the safety policy here; use `references/github-runbook.md` for the guarded cleanup command pattern.
4. Remove the isolated PR worktree.
5. Remove the PR local branch after the worktree is gone and only after step 2 proved it safe.
6. Verify the remote branch is absent and the worktree is no longer registered.
7. Recheck the default and unrelated worktrees and confirm pre-existing changes remain untouched.

Avoid broad repository cleanup operations unless the user explicitly requests them.

## 8. Session lessons and documentation checkpoint

Before concluding every PR cycle, review the session for durable, reusable lessons exposed by the work: recurring tool limits, CI or reviewer blind spots, cleanup hazards, repository-wide conventions, or contributor-workflow gotchas. Do not document transient provider outages, one-off command noise, or feature-specific details that belong in the issue, spec, or ADR.

When a durable lesson exists, document it in the canonical home:

- `.agents/skills/pr-cycle/` for reusable PR-cycle mechanics, safeguards, helper behavior, and execution-surface workarounds.
- `AGENTS.md` for project-specific agent, coding, validation, architecture, or repository conventions.
- `README.md` only when human contributors or users need the setup, command, or workflow information without reading agent instructions.

Avoid duplicating the same policy across files; keep one canonical statement and cross-link when useful. If documenting a lesson would materially widen an application PR, create a focused follow-up docs/process PR instead of mixing unrelated process changes into the implementation. Run that follow-up through the normal PR-cycle gate, but do not merge it without explicit merge authorization. A lessons-only follow-up should not recursively create another lessons PR unless it uncovers a new material reusable gap.

If lesson documentation is added to the current PR, any push invalidates prior exact-SHA review and CI evidence; rerun the gate on the new head. The final report must state what durable lessons were documented and where, or that no durable documentation change was warranted.

## Status reporting

During long cycles, report meaningful milestones rather than every command: first substantive finding, fixes pushed and new SHA, CI terminal state, independent reviewer verdict, merge completion, and cleanup completion.

A final readiness report should include the PR, exact final head/base-tip pair, CI state, unresolved actionable review count, reviewer verdicts when used, mergeability state, and whether merge authorization is still required.

A final merged report should additionally include the merge commit SHA and confirmation that only the PR branch/worktree were cleaned up.

## Resources

- `scripts/pr_snapshot.py` — read-only, fail-closed GitHub PR state snapshot including live base-tip, CI, and unresolved review-thread data.
- `scripts/pr_wait.py` — bounded CI polling that exits quickly on failure/head movement and returns after a short wait window instead of relying on an unbounded watcher.
- `scripts/claude_review.py` — exact head/base-tip, read-only Claude Code background reviewer dispatch/poll/stop helper.
- `references/github-runbook.md` — canonical GitHub CLI commands and exact-revision merge/cleanup patterns.
- `references/timeout-strategy.md` — bounded execution strategy for CI, local validation, model reviews, and hooks under CodexPro-style command ceilings.
- `references/claude-code-review.md` — subscription-safe Claude Code background review architecture, verdict contract, and foreground fallback.
- `references/kimi-k3-review.md` — Kimi K3 via OpenCode Go / Oh My Pi fallback policy, read-only invocation patterns, and timeout/verdict rules.
