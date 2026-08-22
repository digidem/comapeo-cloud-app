# Bounded execution strategy

Use this when the PR cycle runs through a tool surface with a hard per-command ceiling. CodexPro currently allows at most 180 seconds for one shell invocation.

## General rule

A shell timeout means the invocation was cut off. It does not prove the underlying test, CI job, reviewer, or GitHub operation failed.

Never repeat an identical command that already exceeded the ceiling. Change the execution shape.

## CI waiting

- Do not use long-running watch commands through a bounded shell.
- Use `scripts/pr_wait.py` with a 60–120 second window, then rerun it if the result is `still_pending`. Once the reviewed base tip is known, pass both `--expect-head` and `--expect-base-tip` so the next bounded poll that observes either revision moving stops the wait.
- Once an expected head-SHA or live base-tip change is observed, treat it as a hard stop; all prior review/readiness evidence for that pair is stale.
- A `still_pending` result or long elapsed runtime alone is not evidence that CI is stuck. Before rerunning or cancelling, inspect the live run/job status, current step, timestamps, and available log progress. If GitHub still reports the job `in_progress` on an active step with no failure signal, continue bounded polling instead of creating a duplicate run.
- When duration looks suspicious, compare it with recent successful runs of the same workflow/job before calling it hung. A job still inside or near its observed successful runtime range is evidence to keep polling unless its current step, logs, or GitHub status show a concrete failure/stall signal.
- Rerun only after a terminal failure/cancellation/timeout, or after direct run/job inspection provides concrete evidence that the existing execution is no longer healthy.
- When a run fails, start with failed-job logs rather than downloading the complete run log.

## Local validation

- Run focused tests for changed behavior first.
- Split lint, typecheck, tests, build, and browser checks into separate commands so each gets its own timeout budget.
- If the complete suite normally exceeds the shell ceiling and GitHub CI runs it, rely on CI for the complete signal after focused local checks.
- Do not weaken validation just to fit the timer.

## Hooks

If a hook duplicates a full validation that exceeds the shell ceiling, bypass it only after the same required validation has already been run independently. Never use a hook bypass to hide an unrun or failing required check.

For post-merge remote branch deletion, bypassing a source-validation pre-push hook is appropriate because deleting a remote branch does not publish source changes.

## Independent model reviews

Keep static review separate from live GitHub verification.

- Prefer a reviewer-native detached/resumable execution surface over forcing the review under the shell timeout.
- For Claude Code 2.1.139+, use `scripts/claude_review.py` and the supervisor-backed `--bg` path described in `claude-code-review.md`. Dispatch should return in seconds; review wall-clock time is then independent of CodexPro's shell ceiling.
- For the Kimi K3 fallback, prefer a persistent ACP session (`acpx` with `opencode-go/kimi-k3`) when a synchronous OpenCode Go or Oh My Pi review approaches the shell timeout. Queue the exact-diff review, poll `status`/session history in short windows, and collect the final terminal verdict; partial reasoning, a timed-out foreground command, or a still-running session must not count as approval.
- Use Claude `--safe-mode` on the subscription-backed reviewer path to disable hooks/plugins/MCP/CLAUDE.md/custom startup state while preserving OAuth/keychain authentication. Do not use `--bare` by default because bare mode intentionally skips OAuth/keychain reads and expects API-key-style auth.
- Bind every reviewer run to the exact pushed HEAD SHA and the **current live target-branch tip**, compute the merge-base from those refs, and require a clean PR worktree before dispatch. Do not treat PR `baseRefOid` / REST `base.sha` as the live target tip; they can lag when the base branch advances.
- Ask for blockers, should-fix issues, and nits; do not ask the reviewer to poll CI or own live GitHub verification.
- Poll reviewer state in short bounded windows. `still_running` is normal; a shell timeout around a poll is not a reviewer verdict.
- Fail closed on malformed output, wrong-SHA output, failed/stopped sessions, or sessions needing input.
- Use synchronous print mode only as fallback when detached execution is unavailable. Make that path structured/resumable with `--session-id`, `--output-format json`, and `--json-schema` when supported.
- If the user explicitly required a named reviewer/model, do not silently substitute another reviewer.
- Do not use Ultrareview in this workflow; it is outside the intended subscription review path.

## Status reporting

Report state transitions, not every poll. Surface when CI moves from pending to failing/terminal, when a reviewer becomes done/failed/attention-required, when the reviewed head or live base tip moves, and when the merge-ready gate changes. A healthy `still_pending` or `still_running` probe should usually remain internal unless the user asks for progress.

