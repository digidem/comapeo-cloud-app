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

Use the atomic exact-head guard. If the installed GitHub tooling cannot enforce the reviewed SHA, stop instead of merging unguarded. Do not use an administrative merge override unless the user separately and explicitly authorizes bypassing repository protections:

```bash
gh pr merge <pr> --repo <owner/repo> --squash --match-head-commit <reviewed-sha>
```

Then verify the merge before cleanup:

```bash
gh pr view <pr> --repo <owner/repo> --json state,mergedAt,mergeCommit,headRefName,headRefOid,url
```

Require `state` to be `MERGED` and record the merge commit SHA.

## Ordered multi-PR merge sequences

When the user explicitly authorizes multiple already-reviewed PRs to merge in a required order, treat each merge as a new target-branch boundary rather than one aggregate operation:

1. Merge only the first PR with the exact-head guard and verify its merge commit.
2. Fetch the target branch and capture the resulting live tip.
3. Re-read the next PR against that tip. Because the previous merge moved the base, re-gate the next PR against that exact new base tip before issuing its guarded merge; do not rely on the previous mergeability, CI, or reviewer snapshot merely because the diffs appear disjoint.
4. Repeat serially. Do not overlap merge commands or assume the remaining PRs stayed merge-ready while the base moved.

After the final merge, fetch the target branch again, capture its exact SHA, and inspect the branch-triggered workflow runs for that SHA. The final target-branch CI is the integration truth for the combined state: require all repository-applicable post-merge checks such as full browser E2E, deployment, production smoke, Lighthouse, or visual regression to reach an acceptable terminal result before declaring the ordered sequence complete. PR CI and human QA establish confidence in each change independently but do not replace the final integrated-branch signal.

A bounded way to locate the final target-branch run is:

```bash
git fetch origin <base>:refs/remotes/origin/<base>
git rev-parse refs/remotes/origin/<base>
gh run list --repo <owner/repo> --branch <base> --limit 20 \
  --json databaseId,workflowName,status,conclusion,headSha,url,event
```

Select only runs whose `headSha` equals the captured final target SHA, then inspect those run IDs with `gh run view`. If the target branch moves again before verification finishes, repeat against the new live tip rather than attributing an older run to the current branch state.

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
