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
- Evaluate readiness against the exact pushed head SHA. Any new push invalidates the previous final review/readiness verdict.
- Prefer squash merge unless repository policy or the user explicitly requests another strategy.

## 1. Resolve scope and isolate work

1. Resolve repository, PR number or URL, base branch, head branch, and current head SHA.
2. Read repository instructions before editing.
3. Inspect existing worktrees and working-tree state.
4. If implementation or fixes are needed, use an isolated worktree for the PR branch. Reuse an existing clean PR worktree when one already exists.
5. If the main/default worktree is dirty, leave it untouched and never switch its branch for convenience.
6. Snapshot unrelated worktree paths so cleanup can be scoped later.

Use `scripts/pr_snapshot.py` for a conservative GitHub-side state snapshot when `gh` is available. Once a pushed/reviewed head SHA is known, pass it with `--expect-head` so the snapshot fails if the PR moves during verification. See `references/github-runbook.md` for canonical command patterns.

## 2. Establish current truth

Before changing code, collect all of the following for the current head:

- PR state and draft status
- exact head SHA
- mergeability and merge-state status
- complete CI/check rollup, including pending and skipped jobs
- review decision and reviews
- thread-aware unresolved review comments, not only top-level comments
- current branch/worktree cleanliness

Fail closed when required state cannot be read. Do not call a PR merge-ready based on partial GitHub data.

## 3. Run the fix loop

Repeat until there are no actionable findings on the current head:

1. Inspect unresolved review threads with thread-level state. Separate actionable requests from informational, duplicate, outdated, or already-resolved comments.
2. Inspect failed CI logs and relevant external-check details. Fix failures caused by the PR without changing unrelated code to mask unrelated infrastructure failures.
3. Follow repository development rules, including required TDD and validation practices.
4. Run narrow relevant tests first, then repository-required lint, type, test, and build checks when practical.
5. Commit and push intentional changes on the PR branch only.
6. Once a fix is pushed and validated, reply to addressed actionable threads. Resolve a thread only when its requested change is fully satisfied and the latest thread context does not indicate that reviewer follow-up is still needed; a PR-cycle request authorizes this resolution behavior for addressed feedback.
7. Record the new pushed head SHA. All earlier readiness and reviewer verdicts are now stale.

Do not stop after the first green CI run if unresolved actionable review feedback remains.

## 4. Independent merge-readiness review loops

When the user requests a specific reviewer or model, use it. Otherwise use an available strong independent reviewer when the environment supports one and the change risk justifies it.

For each independent review:

- Review a fresh view of the exact current pushed head and PR diff.
- Do not prime the reviewer with the desired verdict.
- Ask it to categorize findings into blockers, should-fix issues, and non-blocking nits.
- Fix blockers and should-fix findings, push, then start a fresh review of the new head.
- Treat nits as optional unless they reveal correctness, security, data-loss, or operability risk.
- If the reviewer cannot access live GitHub/CI, use it for static review only and independently verify live state.

A final reviewer verdict applies only to the SHA it reviewed.

## 5. Merge-ready gate

Declare `MERGE-READY` only when all of these are true simultaneously for one exact head SHA:

- PR is open and not draft.
- Current GitHub head SHA equals the SHA used for final review and verification.
- GitHub reports the PR mergeable and clean, or an explicitly understood repository-equivalent state.
- All required and relevant checks are terminal and green. Treat every skipped or neutral check as requiring explicit adjudication before readiness; only clearly legitimate conditional skips are acceptable. Pending, queued, running, cancelled, timed-out, action-required, or failing relevant checks are not.
- GitHub review decision is not `CHANGES_REQUESTED` or `REVIEW_REQUIRED`; a top-level blocking review counts even when it created no inline review thread.
- No unresolved actionable review threads remain.
- No outstanding blocker or should-fix finding remains from requested independent reviewers.
- Local PR worktree is clean after the final push.
- Repository-specific merge gates are satisfied.

Never substitute a reviewer saying "looks good" for this full gate.

If merge is not authorized, stop here and report the exact reviewed head SHA as ready for human merge authorization.

## 6. Authorized merge

Only after explicit authorization:

1. Re-read live PR state immediately before merging.
2. Confirm the head SHA still equals the reviewed merge-ready SHA. If it changed, return to the review/CI loop.
3. Reconfirm terminal-green CI, unresolved thread state, and clean mergeability.
4. Perform a squash merge with an atomic exact-head guard. If the available GitHub tooling cannot enforce the reviewed head SHA at merge time, do not merge; report the tooling limitation instead. Never bypass repository protections with an administrative override unless the user explicitly authorizes that separate override.
5. Verify GitHub reports the PR merged and capture the resulting merge commit SHA.
6. Do not begin branch/worktree cleanup until merge verification succeeds.

## 7. Scoped cleanup

Clean only resources belonging to the merged PR:

1. Confirm the isolated PR worktree is clean, including no untracked files that need preserving. Never force-remove a PR worktree to bypass a dirty-worktree check.
2. Before deleting any branch, prove the local PR branch has no unpushed commits: if its remote-tracking branch exists, require the local tip to equal that remote tip; if the remote branch is already absent, require the local tip to equal the PR head SHA recorded at verified merge time. If either check fails, preserve the branch and report it instead of cleaning it up.
3. Remove the PR remote branch if it still exists.
4. Remove the isolated PR worktree.
5. Remove the PR local branch after the worktree is gone and only after step 2 proved it safe.
6. Verify the remote branch is absent and the worktree is no longer registered.
7. Recheck the default and unrelated worktrees and confirm pre-existing changes remain untouched.

Avoid broad repository cleanup operations unless the user explicitly requests them.

## Status reporting

During long cycles, report meaningful milestones rather than every command: first substantive finding, fixes pushed and new SHA, CI terminal state, independent reviewer verdict, merge completion, and cleanup completion.

A final readiness report should include the PR, exact final head SHA, CI state, unresolved actionable review count, reviewer verdicts when used, mergeability state, and whether merge authorization is still required.

A final merged report should additionally include the merge commit SHA and confirmation that only the PR branch/worktree were cleaned up.

## Resources

- `scripts/pr_snapshot.py` — read-only, fail-closed GitHub PR state snapshot including CI and unresolved review-thread data.
- `references/github-runbook.md` — canonical GitHub CLI commands and exact-head merge/cleanup patterns.
