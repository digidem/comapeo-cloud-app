# GitHub PR-cycle runbook

Use these patterns as guarded examples. Substitute the real repository, PR number, branch, worktree path, and reviewed head SHA.

## Read current PR state

```bash
gh pr view <pr> --repo <owner/repo> --json state,isDraft,headRefName,headRefOid,baseRefName,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,reviews,comments,url
```

Prefer the bundled snapshot helper when available:

```bash
python3 .agents/skills/pr-cycle/scripts/pr_snapshot.py --repo <owner/repo> --pr <pr> --expect-head <reviewed-sha>
```

The helper exits non-zero when GitHub state could not be read completely or when the PR head does not match `--expect-head`. The expected SHA may be a 7-40 character hexadecimal prefix. Treat incomplete output as not merge-ready.

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

## Inspect CI

```bash
gh pr checks <pr> --repo <owner/repo>
```

For a failed GitHub Actions run:

```bash
gh run view <run-id> --repo <owner/repo> --json name,workflowName,conclusion,status,url,event,headBranch,headSha
gh run view <run-id> --repo <owner/repo> --log
```

Wait until relevant checks are terminal. Treat every `SKIPPED` or `NEUTRAL` result as requiring explicit adjudication before readiness; only clearly legitimate conditional skips are acceptable. Queued, pending, in-progress, cancelled, timed-out, action-required, and failing relevant checks are not green.

## Exact-head discipline

Capture the pushed head SHA after every push. A reviewer verdict and readiness decision are valid only for that SHA.

Immediately before an authorized merge, fetch PR state again and compare `headRefOid` with the reviewed SHA. If they differ, do not merge; restart verification on the new head.

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

## Scoped cleanup after verified merge

Perform cleanup only for the merged PR branch and its isolated worktree.

1. Confirm the PR worktree has no local changes, including untracked files that need preserving. Never use a forced worktree removal to bypass this check.
2. Prove there are no unpushed branch commits before deleting anything. If the remote-tracking branch still exists, require the local branch tip to equal it. If the remote branch is already absent, require the local branch tip to equal the PR head SHA captured when the merge was verified. Preserve and report the branch on any mismatch.
3. Remove the PR branch from the remote if it still exists.
4. Remove the isolated PR worktree.
5. Remove the local PR branch only after step 2 proved it safe and the worktree is gone.
6. Verify the remote branch is absent and the PR worktree is not registered.
7. Recheck unrelated/default worktrees and preserve all pre-existing changes.

Avoid broad cleanup or pruning commands during normal PR cleanup.
