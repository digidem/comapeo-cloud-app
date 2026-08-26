# GitHub PR-cycle runbook

Use these patterns as guarded examples. Substitute the real repository, PR number, branch, worktree path, and reviewed head SHA.

## Read current PR state

```bash
gh pr view <pr> --repo <owner/repo> --json state,isDraft,headRefName,headRefOid,baseRefName,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,reviews,comments,url
```

Prefer the bundled snapshot helper when available. It reads both the PR head and the **live target-branch tip** from GitHub:

```bash
python3 .agents/skills/pr-cycle/scripts/pr_snapshot.py \
  --repo <owner/repo> --pr <pr> --expect-head <reviewed-head-sha>
```

Record `pull_request.base_tip_sha` from that snapshot before independent review. Do not substitute the PR payload's `baseRefOid` / REST `base.sha`: those can remain at the PR's recorded base commit after the target branch advances.

Before a local static review, fetch the target branch explicitly into its remote-tracking ref:

```bash
git fetch origin <base>:refs/remotes/origin/<base>
```

For the final gate, bind the snapshot to **both** reviewed coordinates:

```bash
python3 .agents/skills/pr-cycle/scripts/pr_snapshot.py \
  --repo <owner/repo> --pr <pr> \
  --expect-head <reviewed-head-sha> \
  --expect-base-tip <reviewed-base-tip-sha>
```

The helper exits non-zero when GitHub state could not be read completely, either revision does not match, or the head/base branch changes during the snapshot. Expected SHAs may be 7-40 character hexadecimal prefixes. Treat incomplete output as not merge-ready.

## Inspect thread-aware review state

Flat PR comments are not sufficient. Query review threads so `isResolved` and inline context are preserved.

```bash
gh api graphql \
  -f owner=<owner> \
  -f name=<repo> \
  -F number=<pr> \
  -f query='query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){nodes{id isResolved isOutdated path line comments(last:100){totalCount nodes{author{login} body url}}}}}}}'
```

If more than 100 threads exist, paginate rather than assuming the first page is complete.

## Inspect and wait for CI

Use short status reads:

```bash
gh pr checks <pr> --repo <owner/repo>
```

In bounded execution environments, do **not** use `gh pr checks --watch`: a healthy PR suite can outlive the shell timeout. Prefer the bundled bounded poller and rerun it if it reports `still_pending`:

```bash
python3 .agents/skills/pr-cycle/scripts/pr_wait.py \
  --repo <owner/repo> --pr <pr> \
  --expect-head <head-sha> \
  --expect-base-tip <live-base-tip-sha> \
  --wait-seconds 120
```

Once a reviewed live base tip is known, always pass it to the poller. Each poll re-reads the PR base branch and its live tip, so a target-branch advance stops the wait at the next bounded poll that observes it instead of spending more CI wall time on stale review evidence.

For a failed GitHub Actions run, inspect metadata first and fetch only failed logs by default:

```bash
gh run view <run-id> --repo <owner/repo> --json name,workflowName,conclusion,status,url,event,headBranch,headSha
gh run view <run-id> --repo <owner/repo> --log-failed
```

Use a full `--log` only when the failed-log slice is insufficient and the run is small enough to stay bounded.

Wait until relevant checks are terminal. `pr_wait.py` exits 0 only for a fully terminal-green rollup. A terminal rollup containing `SKIPPED`, `NEUTRAL`, or no usable checks returns `terminal_requires_adjudication` with a non-zero exit so callers cannot accidentally treat it as green. Only clearly legitimate conditional skips are acceptable after explicit adjudication. Queued, pending, in-progress, cancelled, timed-out, action-required, and failing relevant checks are not green.

A successful wrapper job can still hide a failing underlying command when a workflow intentionally uses `continue-on-error`, soft-fail shell logic, or an equivalent masking mechanism. GitHub distinguishes the pre-mask step `outcome` from the post-mask `conclusion`: a failed `continue-on-error` step can end with `conclusion: success`. Do not inspect every successful job step by default, but when a relevant readiness signal is known to be soft-failed, determine the pre-mask result before counting it as green.

Use the job JSON to locate the relevant job and step. If the workflow exports an explicit step `outcome`, prefer that. If the available tooling exposes only the post-mask conclusion, inspect the bounded job log for the underlying command's exit/result:

```bash
gh run view <run-id> --repo <owner/repo> --json jobs
gh run view <run-id> --repo <owner/repo> --job <job-id> --log
```

If the underlying command failed, adjudicate it explicitly as a real PR issue or a justified advisory/non-blocking condition; the green wrapper or post-mask conclusion alone is not evidence of success.

## Exact-revision discipline

Capture the pushed head SHA after every push and the live target-branch tip before every independent review. A reviewer verdict and readiness decision are valid only for that exact head/base-tip pair.

If the live target branch advances during the cycle, discard prior reviewer and CI/readiness evidence for the old pair and refresh the exact live tip. Synchronize the PR branch only when conflicts, mergeability, an up-to-date branch policy, required checks, or the chosen workflow require it. When synchronization is required, merge the verified target tip into the PR branch without rebasing or force-pushing reviewed history, resolve conflicts while preserving both sides, run focused validation for conflict/affected paths, and push the result. Restart the gates on the resulting exact head/base-tip pair.

Immediately before an authorized merge, run the snapshot helper with both `--expect-head` and `--expect-base-tip`. If either differs, do not merge; restart verification and independent review on the new pair.

## Authorized squash merge

Before issuing any single-PR merge, require a **server-side** mechanism that **atomically guards both** the reviewed head SHA and the **exact gated base tip**, or an equivalent merge-queue/server-side proof that the merge can execute only against that reviewed pair. A head-only merge guard is insufficient. If the repository's available merge path cannot provide this two-revision guarantee, **do not issue the merge**; stop and report that a repository-specific safe merge mechanism is required. Do not use an administrative merge override unless the user separately and explicitly authorizes bypassing repository protections.

For this repository, the accepted non-queue mechanism is a protected target branch with **strict required status checks**, at least one required check context, and protection **enforced for administrators**. GitHub's strict status-check mode requires the PR branch to be up to date with the live base before the server permits merging; pairing that server-side base-freshness guard with `--match-head-commit` guards the reviewed head coordinate. Immediately before merge, verify the protection is still active:

```bash
gh api repos/<owner/repo>/branches/<base>/protection \
  --jq '{strict:.required_status_checks.strict,contexts:.required_status_checks.contexts,enforce_admins:.enforce_admins.enabled}'
```

Require `strict == true`, a non-empty `contexts` array, and `enforce_admins == true`. Then, only while the final exact head/base snapshot is still current and all PR-cycle gates are satisfied, issue:

```bash
gh pr merge <pr> --repo <owner/repo> --squash --match-head-commit <reviewed-sha>
```

Do not use that command if the protection preflight is missing or weaker. If the base advances after the final snapshot, strict protection must reject the merge until the PR is updated and its required checks pass again; if the head changes, `--match-head-commit` must reject it. This pair of server-side base freshness plus exact-head matching is the repository's supported two-coordinate merge guard.

After the guarded merge succeeds, verify it before cleanup:

```bash
gh pr view <pr> --repo <owner/repo> --json state,mergedAt,mergeCommit,headRefName,headRefOid,url
```

Require `state` to be `MERGED` and record the merge commit SHA. For squash or merge-commit methods used by this workflow, verify the resulting commit's first parent equals the exact gated base tip. Treat first-parent equality as post-merge **audit evidence, not a substitute** for the pre-merge atomic head+base guard.

## Ordered multi-PR merge sequences

When the user explicitly authorizes multiple already-reviewed PRs to merge in a required order, treat each merge as a new target-branch boundary rather than one aggregate operation:

1. Before the first merge, require a **server-side** merge mechanism that **atomically guards both** the reviewed head SHA and the exact gated base tip, or an equivalent merge-queue/server-side proof that the merge can execute only on that pair. A head-only guard does not close the base-movement race. If the available merge path cannot provide this two-revision guarantee, **do not issue the merge**.
2. Merge only after that atomic head+base precondition is established, then verify the resulting merge commit. For squash or merge-commit methods, check `git rev-parse <merge-commit>^1` equals the **exact gated base tip** used for that merge; this first-parent check is audit evidence, not a substitute for the pre-merge atomic base guard. A mismatch means concurrent movement occurred despite the expected guard: stop the ordered sequence immediately and never continue to another merge.
3. Fetch the target branch and capture the resulting live tip.
4. Re-read the next PR against that tip. Because the previous merge moved the base, re-gate the next PR against that exact new base tip before issuing its guarded merge; do not rely on the previous mergeability, CI, or reviewer snapshot merely because the diffs appear disjoint.
5. Repeat serially. Do not overlap merge commands or assume the remaining PRs stayed merge-ready while the base moved. Re-establish the same atomic head+base precondition before every subsequent merge. If the repository's selected merge method cannot expose that pre-merge server-side guarantee, do not issue the merge and stop for a repository-specific safe merge mechanism.

After the final merge, use the merge commit SHA returned by verification of that final merge as the exact post-sequence target SHA and keep that immutable SHA as the integration subject. Fetch the target branch; require `git rev-parse <exact-post-sequence-sha>^1` to equal the **exact gated base tip** for the final merge, and require `git merge-base --is-ancestor <exact-post-sequence-sha> refs/remotes/origin/<base>` to succeed. Merely having the commit object locally, or proving ancestry without the first-parent equality, does not prove the final PR landed on the reviewed base. Do not derive the sequence result from a later moving branch tip.

Before evaluating results, derive the expected signal set from the repository's branch protection/rulesets and applicable workflow definitions for the target branch. Then enumerate **all** exact-SHA GitHub Checks check-runs and commit status contexts with pagination, plus the relevant workflow runs needed for logs/step-level soft-fail inspection. The complete repository-applicable set of target-branch runs/checks for the exact post-sequence target SHA is the integration truth for the combined state: one successful Actions run is insufficient when other expected CI, full browser E2E, deployment, production smoke, Lighthouse, visual regression, audit, external check, status-context, or repository-specific signals apply. Every expected workflow/check must be accounted for by an exact-SHA terminal result or explicit adjudication that it is legitimately non-applicable. Apply the same terminal-state and soft-fail rules as the merge-ready gate: required/relevant checks must be terminal green; skipped or neutral results require explicit adjudication as legitimate conditional behavior; cancelled, timed-out, action-required, or failing checks are unacceptable; and a workflow/job that masks failures with `continue-on-error` or equivalent logic requires inspection of the pre-mask step outcome or logs. PR CI and human QA establish confidence in each change independently but do not replace the final integrated-branch signal.

A bounded exact-SHA verification pattern is:

```bash
git fetch origin <base>:refs/remotes/origin/<base>
git rev-parse <exact-post-sequence-sha>^1
git merge-base --is-ancestor <exact-post-sequence-sha> refs/remotes/origin/<base>
gh api --paginate "repos/<owner/repo>/commits/<exact-post-sequence-sha>/check-runs?per_page=100"
gh api --paginate "repos/<owner/repo>/commits/<exact-post-sequence-sha>/statuses?per_page=100"
gh api --paginate "repos/<owner/repo>/actions/runs?branch=<base>&head_sha=<exact-post-sequence-sha>&per_page=100"
gh api "repos/<owner/repo>/rules/branches/<base>"
```

Treat branch-protection/ruleset reads that require unavailable permissions according to repository policy: if you cannot determine the expected required set from branch protection/rulesets plus applicable workflow definitions, fail closed rather than assuming the visible subset is complete. Require the first-parent command to equal the exact gated base tip and the ancestry command to return zero. Map the paginated check-runs and statuses plus workflow runs against every expected workflow/check for the target branch; one matching success must not hide a missing or failing expected workflow or external status. If the target branch moves again before verification finishes, report the newer tip as concurrent movement and optionally validate it as additional evidence, but do not replace the exact post-sequence target SHA as the integration subject or attribute the newer run to the authorized sequence.

## Scoped cleanup after verified merge

Perform cleanup only for the merged PR branch and its isolated worktree.

1. Confirm the PR worktree has no local changes, including untracked files that need preserving. Never use a forced worktree removal to bypass this check.
2. Prove there are no unpushed branch commits before deleting anything. If the remote-tracking branch still exists, require the local branch tip to equal it. If the remote branch is already absent, require the local branch tip to equal the PR head SHA captured when the merge was verified. Preserve and report the branch on any mismatch.
3. Remove the PR branch from the remote if it still exists.
4. Remove the isolated PR worktree.
5. Remove the local PR branch only after step 2 proved it safe and the worktree is gone.
6. Verify the remote branch is absent and the PR worktree is not registered.
7. Recheck unrelated/default worktrees and preserve all pre-existing changes.

Some repositories run pre-push hooks even for a remote branch deletion. If step 3 is blocked or times out solely because such a hook is replaying validation that was already satisfied for the verified merged head, and step 2 already proved exact local/remote tip parity, retry the cleanup-only deletion without hooks:

```bash
git push --no-verify origin --delete <head-branch>
```

This exception is only for post-merge branch deletion. Never use it to skip validation on a code push or before merge verification.

Avoid broad cleanup or pruning commands during normal PR cleanup.
