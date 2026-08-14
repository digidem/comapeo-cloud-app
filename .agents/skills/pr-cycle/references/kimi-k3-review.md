# Kimi K3 fallback reviewer

Use this path when Opus 5 is unavailable because of quota, subscription limits, provider outage, or local Claude tooling failure **and the user did not explicitly require Opus**. The fallback is **Kimi K3 via OpenCode Go**. It is a substitute reviewer, not a relaxation of the PR-cycle gate.

## Preconditions

1. Refresh the PR snapshot and record the exact pushed head SHA and current live target-branch tip.
2. Fetch the live target branch and review the exact head/base-tip pair from a clean PR worktree.
3. Confirm `opencode-go/kimi-k3` is actually available before dispatch. Do not infer availability from an ACP adapter alone.
4. Keep the review read-only. Do not let the reviewer edit, commit, push, merge, resolve GitHub threads, or own CI verification.
5. Reuse configured provider authentication without printing or copying credentials into prompts/logs.

If Oh My Pi's ACP adapter is installed but the underlying `pi` executable is missing, Oh My Pi is unavailable. Do not claim that Pi ran; use OpenCode Go directly instead. Do not globally install or mutate the developer environment merely to obtain a reviewer unless the user explicitly asked for that setup change.

## Preferred reviewer order

1. **Oh My Pi + OpenCode Go** when a working Pi path is already present and `opencode-go/kimi-k3` is visible to it.
2. **OpenCode Go direct** with model `opencode-go/kimi-k3` when Pi is unavailable or unhealthy.
3. Another strong independent reviewer only when neither Kimi path is available and the user did not request a specific reviewer.

An explicitly requested Opus 5 review must not be silently replaced by Kimi. Report the Opus limitation instead.

## Review contract

Ask Kimi to review a fresh exact diff for the **exact head/base-tip pair** and return a terminal verdict containing:

- reviewed base-tip SHA
- reviewed head SHA
- verdict (`ready`/`PASS` only when no blocker or should-fix finding remains)
- blockers
- should-fix findings
- non-blocking nits
- file/line evidence and a concrete failure scenario for every actionable finding

Do not prime the model with the desired outcome. Keep CI, mergeability, GitHub review state, and unresolved-thread verification outside the static model review.

A Kimi result **must not count** when it is partial reasoning, malformed, missing either SHA, tied to stale revisions, still running, timed out, provider-failed, or needs input. Any push or live base-tip movement invalidates the prior verdict.

## OpenCode Go path

Use `opencode-go/kimi-k3` explicitly. Prefer a read-only reviewer agent/configuration that cannot edit. If the repository's default OpenCode orchestrator delegates to broken or unrelated subagents, do not count that stalled run. Use a simpler read-only primary reviewer or provide the exact diff directly.

For long reviews under a bounded shell, prefer a persistent ACP session rather than repeatedly killing synchronous `opencode run` commands. A representative shape is:

```bash
acpx --cwd "$PR_WORKTREE" --model opencode-go/kimi-k3 \
  --approve-reads --non-interactive-permissions deny \
  opencode sessions new -s pr-review-kimi

acpx --cwd "$PR_WORKTREE" --model opencode-go/kimi-k3 \
  --approve-reads --non-interactive-permissions deny \
  --timeout 10 opencode -s pr-review-kimi prompt "<SHA-bound read-only review prompt>"

acpx --cwd "$PR_WORKTREE" opencode -s pr-review-kimi status
acpx --cwd "$PR_WORKTREE" opencode sessions read pr-review-kimi
```

The short prompt timeout is only for dispatch/connection. If session status is still running, keep polling bounded state; do not reinterpret the timeout as a verdict.

## Oh My Pi path

When Pi is already available, select the same OpenCode Go model explicitly:

```bash
pi --model opencode-go/kimi-k3 \
  --thinking high \
  --tools read,grep,find,ls \
  --no-session -p "<SHA-bound read-only review prompt>"
```

If a full review is too slow for a synchronous shell, use a persistent `acpx pi` session and poll it just like the OpenCode ACP path. Do not repeatedly restart the same large prompt after timeouts. If needed, split the exact review into focused production-code and test/CI slices, but only combine them into approval when every required slice reaches a terminal no-actionable-findings result.

## Adjudicating findings

- Fix every blocker and should-fix finding that describes a current correctness, security, data-loss, operability, or required-test failure.
- Reclassify only with evidence. Future hypothetical architecture concerns and intentionally accepted product behavior can be nits, but record why they are not current blockers.
- After any fix, push, refresh the live target tip, and start a fresh Kimi review of the new exact pair.
- A terminal Kimi PASS/ready verdict is only one input to the full merge-ready gate; it never substitutes for green CI, clean mergeability, or zero unresolved actionable GitHub threads.
