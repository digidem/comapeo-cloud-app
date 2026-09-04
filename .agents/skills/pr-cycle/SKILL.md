---
name: pr-cycle
description: Run a pull request through the full autonomous review, fix, CI, merge-readiness, and authorized merge/cleanup lifecycle. Use when the user says "PR cycle", asks to make a PR fully mergeable or merge-ready, asks to address review comments and CI until green, requests repeated frontier-model review/fix loops, or authorizes merging and cleanup of a reviewed PR. Treat a PR-cycle request as authorization to fix, push, and resolve actionable review feedback autonomously, but never merge unless the user explicitly authorizes merge.
---

# PR Cycle

Drive one PR to a defensible merge-ready state without disturbing unrelated work. Apply repository `AGENTS.md` and local instructions as higher-specificity constraints. Reuse generic GitHub skills such as `gh-address-comments`, `gh-fix-ci`, and `yeet` as component workflows when useful.

## Core contract

- Work autonomously through review comments, CI failures, fixes, commits, pushes, and repeated verification once the user requests a PR cycle.
- Never merge merely because the PR is ready. Stop and signal the human unless the user explicitly authorizes merge in the current request.
- Never declare an implementation ready for human QA without an implementation-specific QA script that follows repository instructions and is linked from the PR body.
- Treat explicit language such as "merge when ready" as merge authorization. Do not infer authorization from a prior readiness request.
- Merge authorization is execution-local and non-transferable. The execution that runs the merge command must be able to point to an explicit user message in its own current conversation/task authorizing that merge. Never inherit merge authorization from another chat/session/agent, a previous task, a PR/issue comment, an automation, a readiness report, or the fact that GitHub actions run under the user's authenticated account. If this execution cannot identify its own authorizing user message, merging is prohibited.
- Protect unrelated worktrees and dirty working trees. Never reset, clean, stash, stage, commit, or delete unrelated user work.
- Evaluate readiness against the exact pushed head SHA and the current live target-branch tip. Any new push or base-tip movement invalidates the previous final review/readiness verdict.
- Track the last remote PR head observed and the last head intentionally pushed by this execution. If the remote head changes to a SHA this execution did not just push, treat that as a concurrent writer. Preserve the other writer's commits, invalidate all prior review/CI evidence, and do not reset, force-push, or claim exclusive ownership of the branch. Re-establish current truth before any further mutation. A concurrent writer never grants merge authority; the authorized-merge checkpoint below still requires this execution's own explicit user authorization.
- Treat command timeouts as execution-surface limits, not automatically as test/review failures. Never retry the same broad long-running command unchanged; switch to bounded polling, narrower validation, or a resumable execution surface. See `references/timeout-strategy.md`.
- Prefer squash merge unless repository policy or the user explicitly requests another strategy.
- If the PR claims to implement a GitHub issue, verify that issue is an **executable child**, not a parent/tracking issue. A body/status such as “parent tracker — do not implement directly”, a child checklist, or absence of `agent:ready-for-implementation` + `lane:implementation` is a stop signal: do not treat the parent as the implementation scope. Resolve the actual child issue and its dependency gate before coding/reviewing scope. Never make a PR merge-ready by silently implementing multiple reviewed child issues behind one parent tracker unless the user explicitly asks to recombine them and the specs are re-reviewed for that scope.

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

If the live target-branch tip advances after review or CI evidence has been collected, immediately invalidate the old head/base-tip evidence and stop waiting on that stale pair. Refresh the live target tip and determine whether the PR branch itself must be synchronized because of conflicts, mergeability, an up-to-date branch policy, required checks, or the chosen workflow. When synchronization is required, merge the verified target tip into the PR branch without rebasing or force-pushing reviewed history, resolve conflicts while preserving both current target behavior and PR intent, run focused conflict/affected validation, then push and record the new head. In every case, restart independent review and live GitHub gates on the new exact head/base-tip pair; only use a different history strategy when repository policy or explicit user direction requires it.

## 4. Independent merge-readiness review loops

When the user requests a specific reviewer or model, use it. Otherwise use an available strong independent reviewer when the environment supports one and the change risk justifies it. Before declaring reviewer paths exhausted, consult **live usage instrumentation** when available instead of learning every quota state through expensive failed reviews. Prefer provider-scoped `codexbar usage` only when the selected source is documented to perform a fresh provider query at read time; if it can return cached state, accept it only with a provider-specific observation timestamp that is no older than 15 minutes and no more than 5 minutes in the future at read time. If CodexBar cannot prove freshness for that provider, accept `plan-check json` output only when the selected provider's own usage record includes a parseable provider-specific observation timestamp that is no older than 15 minutes and no more than 5 minutes in the future at read time; a fresh global file timestamp is not sufficient. If `plan-check json` cannot provide that fresh provider-specific observation, consult `~/.hermes/state/quota-heartbeat.json` only when the selected provider entry itself has a parseable provider-specific observation timestamp that is no older than 15 minutes and no more than 5 minutes in the future at read time; again, a fresh heartbeat-file timestamp alone is not enough. Treat unsupported usage sources, parser failures, cached/unproven observations, and invalid/future/stale provider timestamps as unknown rather than exhausted. For a provider whose quota remains unknown, run at most one bounded provider-specific liveness probe before moving on: a successful probe means available; an explicit quota/auth/429 response means unavailable and any stated reset should be recorded; a timeout, hang, or provider error means unavailable for this cycle without claiming quota exhaustion. A direct current provider limit/429 with a reset time is authoritative; avoid repeated probes until the reset unless newer live usage data shows availability. Read `references/claude-qwen-review.md` for the detailed availability rules that also apply to fallback selection.

For Claude Code, prefer supervisor-backed background review over synchronous `claude -p`: use `pr_snapshot.py` to read the exact pushed head and **live target-branch tip**, explicitly fetch that target branch into its remote-tracking ref, then use `scripts/claude_review.py start` with both SHAs. Do not use PR `baseRefOid` / REST `base.sha` as the live base tip because the target branch can advance while those remain pinned to an older PR base. The helper computes and records the merge-base, requires a clean PR worktree, uses subscription-compatible `--safe-mode --bg`, isolates the initial review from hooks/plugins/MCP/custom startup state, and validates a SHA-bound machine-readable verdict. After any push **or base-tip movement**, treat the prior review as stale; stop a still-running stale review before dispatching a fresh one. Read `references/claude-code-review.md` before using or debugging this path.

When Opus 5 is unavailable because of quota, subscription limits, provider outage, or local Claude tooling failure, and the user did **not** explicitly require Opus, fall back first to **Kimi K3 via OpenCode Go** instead of treating the missing Opus review as approval or blocking the cycle indefinitely. Prefer Oh My Pi with `opencode-go/kimi-k3` when a working `pi`/ACP path is available; otherwise use OpenCode Go directly with `opencode-go/kimi-k3`. If Kimi is unavailable, use another configured strong reviewer whose live quota is available, including GPT-5.6 Sol through Codex when usable. If those preferred paths are exhausted or unavailable, fall back to **Qwen 3.8 via `claude-qwen`** as a final independent-review option. On this workstation `claude-qwen` is a zsh alias loaded from `~/.zshrc`, not a standalone executable; verify alias presence without printing its secret-bearing body, then check Qwen's own token-plan quota before dispatching a full review. Prefer fresh provider-specific quota telemetry when available; otherwise use at most one bounded tool-less Qwen probe. An explicit 429/quota response with a reset time makes Qwen unavailable until that reset unless newer live evidence proves otherwise. Keep every fallback read-only, bind it to the exact head/base-tip pair, require a terminal verdict, and apply the same blocker/should-fix/nit rules. Read `references/kimi-k3-review.md` and `references/claude-qwen-review.md` before dispatching or debugging these fallbacks. If the user explicitly required a named reviewer, do not silently substitute another model. If the preferred Claude Code transport is blocked but an authorized alternate provider exposes the **same exact requested Opus model**, that transport may be used only after a direct access probe and only with the same read-only, exact-revision, working-directory verification requirements documented in `references/claude-code-review.md`; record the provider and exact model id in the final report. Do not use Ultrareview in the normal PR cycle.

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

Before the final gate, wait for CI with short probes or `scripts/pr_wait.py`; once the reviewed live base tip is known, pass both `--expect-head` and `--expect-base-tip` so polling stops at the next bounded poll that observes either revision moving. Do not use `gh pr checks --watch` in a bounded shell environment because normal PR suites can legitimately run longer than the shell ceiling.

Declare `MERGE-READY` only when all of these are true simultaneously for one exact head/base-tip pair:

- PR is open and not draft.
- Current GitHub head SHA and current live target-branch tip equal the pair used for final review and verification.
- GitHub reports the PR mergeable and clean, or an explicitly understood repository-equivalent state.
- All required and relevant checks are terminal and green. Treat every skipped or neutral check as requiring explicit adjudication before readiness; only clearly legitimate conditional skips are acceptable. Pending, queued, running, cancelled, timed-out, action-required, or failing relevant checks are not.
- A green wrapper job is not sufficient when a relevant command is masked by `continue-on-error`, soft-fail logic, or equivalent workflow behavior. Determine the pre-mask result: prefer an explicit step `outcome` or equivalent workflow-exported signal; if tooling exposes only the post-mask `conclusion`, inspect logs for the underlying command result. A `conclusion: success` after `continue-on-error` is not enough; explicitly adjudicate the underlying command before treating the check as green. Keep the gate policy here; use `references/github-runbook.md` for the bounded GitHub job/step/log inspection commands.
- GitHub review decision is not `CHANGES_REQUESTED` or `REVIEW_REQUIRED`; a top-level blocking review counts even when it created no inline review thread.
- No unresolved actionable review threads remain.
- No outstanding blocker or should-fix finding remains from requested independent reviewers.
- The implementation-specific QA script required by repository instructions is present, accurate for the final implementation, and linked from the PR body.
- Local PR worktree is clean after the final push.
- Repository-specific merge gates are satisfied.

Never substitute a reviewer saying "looks good" for this full gate.

If merge is not authorized, stop here and report the exact reviewed head/base-tip pair as ready for human merge authorization.

## 6. Authorized merge

Only after explicit authorization:

1. Perform an authorization-provenance checkpoint before any merge command. Record the exact current-task user message that authorizes merging this PR (for example, "merge", "merge and cleanup", or "merge when ready"). A request to run a PR cycle, make the PR merge-ready, review it, or report readiness is not merge authorization. If the authorizing message came from another session/agent/task or cannot be identified in this execution, stop without merging.
2. Re-read live PR state immediately before merging.
3. Confirm both the head SHA and live target-branch tip still equal the reviewed merge-ready pair. If either changed, return to the review/CI loop.
4. Confirm the current remote head is either a pre-existing head this execution reviewed and accepted, the head this execution intentionally pushed, or a concurrently produced head that this execution subsequently reviewed and accepted. Never interpret another writer's push, GitHub actor identity, or completed readiness work as authorization to merge.
5. Reconfirm terminal-green CI, unresolved thread state, and clean mergeability with a fresh `pr_snapshot.py` check bound to both SHAs.
6. Before issuing a merge, require a server-side merge mechanism that **atomically guards both the reviewed head and the exact gated base tip**, or an equivalent merge-queue/server-side proof that the merge can execute only against that reviewed pair. A head-only guard such as `--match-head-commit` is insufficient because the base can move after the final snapshot. If the available GitHub tooling or repository merge path cannot enforce both revision coordinates atomically, **do not issue the merge**; report the tooling limitation instead. Never bypass repository protections with an administrative override unless the user explicitly authorizes that separate override.
7. Verify GitHub reports the PR merged and capture the resulting merge commit SHA. If the PR became merged without this execution issuing the merge command, report it as an external/concurrent merge and do not claim that this execution performed or was authorized to perform it. For squash or merge-commit methods used by this workflow, verify the resulting commit's **first parent** equals the exact gated base tip. Treat first-parent equality as post-merge **audit evidence, not a substitute for the pre-merge atomic base guard**; a mismatch is concurrent movement and must stop any subsequent ordered merge.
8. Do not begin branch/worktree cleanup until merge verification succeeds.

When current-task authorization covers an ordered merge sequence of multiple PRs, execute the sequence serially. After each verified merge, fetch and re-read the live target branch, then re-establish the merge gate for the next PR against the new target tip before issuing its guarded merge. Never overlap merges or carry forward mergeability, CI, or reviewer evidence from before the previous merge. Before **each** merge in the sequence, require the same server-side mechanism that atomically guards both the reviewed head and exact gated base tip; a post-merge parent check alone is insufficient. If the selected merge method cannot provide that atomic two-revision guard or an equivalent server-side/merge-queue proof, do not issue the merge and stop for a repository-specific safe merge mechanism.

After the final PR in an authorized sequence lands, use the merge commit SHA returned by verification of that final merge as the exact post-sequence target SHA and keep that immutable SHA as the integration subject. Fetch the target branch, require `git rev-parse <exact-post-sequence-sha>^1` to equal the **exact gated base tip** for the final merge, and require `git merge-base --is-ancestor <exact-post-sequence-sha> refs/remotes/origin/<base>` to succeed; object presence or ancestry alone is not enough. Do not redefine the sequence result from a later moving branch tip. Derive the expected post-merge signal set from branch protection/rulesets plus applicable workflow definitions, then enumerate paginated exact-SHA GitHub Checks check-runs and commit status contexts in addition to workflow runs. Verify the complete repository-applicable set of target-branch runs/checks for the exact post-sequence target SHA is the integration truth for the combined state. One passing workflow is never sufficient when other applicable deployment, smoke, browser, visual, audit, external check, status-context, or CI signals are expected; every expected workflow/check must have an exact-SHA terminal result or an explicitly adjudicated legitimate non-applicability. Individual PR CI and human QA remain important evidence, but they do not replace validation of the integrated branch after the sequence. If the target branch moves again, report and optionally validate the newer tip as separate concurrent evidence; do not replace that integration subject with a newer unrelated tip. Apply the same terminal-state and soft-fail rules from the merge-ready gate to post-merge checks: required/relevant checks must be terminal green, skipped or neutral results require explicit conditional adjudication, cancelled/timed-out/action-required/failing checks are unacceptable, and any `continue-on-error` or equivalent masking requires inspection of the pre-mask outcome. Diagnose any final-branch failure or missing expected check against the exact post-sequence target SHA before declaring the sequence complete.

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

A final readiness report should include the PR, exact final head/base-tip pair, CI state, unresolved actionable review count, reviewer verdicts when used, mergeability state, the QA script path or link, and whether merge authorization is still required.

A final merged report should additionally include the merge commit SHA and confirmation that only the PR branch/worktree were cleaned up.

## Resources

- `scripts/pr_snapshot.py` — read-only, fail-closed GitHub PR state snapshot including live base-tip, CI, and unresolved review-thread data.
- `scripts/pr_wait.py` — bounded CI polling that exits quickly on failure or expected head/base-tip movement and returns after a short wait window instead of relying on an unbounded watcher.
- `scripts/claude_review.py` — exact head/base-tip, read-only Claude Code background reviewer dispatch/poll/stop helper.
- `references/github-runbook.md` — canonical GitHub CLI commands and exact-revision merge/cleanup patterns.
- `references/timeout-strategy.md` — bounded execution strategy for CI, local validation, model reviews, and hooks under CodexPro-style command ceilings.
- `references/claude-code-review.md` — subscription-safe Claude Code background review architecture, verdict contract, and foreground fallback.
- `references/kimi-k3-review.md` — Kimi K3 via OpenCode Go / Oh My Pi fallback policy, read-only invocation patterns, and timeout/verdict rules.
- `references/claude-qwen-review.md` — Qwen 3.8 via `claude-qwen` last-resort reviewer, live usage/quota preflight, exact-revision contract, and 429 cooldown rules.
- `references/pr287-session-lessons.md` — concrete lessons from a long-running exact-SHA PR cycle: reviewer adjudication, browser/CI evidence, production-path QA, determinism, resource bounds, archive parsing, and documentation placement.
- `references/pr341-session-lessons.md` — reusable QA lessons about stale skipped-E2E evidence, deployed-artifact probes for hard-to-reach runtime invariants, and exact-SHA cross-browser substitution.
