# Claude-Qwen fallback reviewer

Use this path when the preferred independent reviewers are unavailable or exhausted, the user did not explicitly require a different named model, and a `claude-qwen` wrapper is available. Resolve it with `command -v claude-qwen`; if the wrapper is not on `PATH`, check known local install locations such as `/home/coder/.local/bin/claude-qwen` without reading or exposing its credentials. The wrapper routes Claude Code through Alibaba MaaS using **Qwen 3.8** (`qwen3.8-max-preview`), so its quota is distinct from the normal Claude subscription session window.

## Availability and usage preflight

Before declaring reviewer options exhausted, use live usage instrumentation when it is available. Prefer provider-scoped checks so one slow provider does not make an all-provider command hang:

```bash
codexbar usage --provider codex --source cli --json
codexbar usage --provider claude --source cli --json
```

For other providers, use `codexbar usage --provider <provider> --json` only when that provider has a supported source on the current platform. An unsupported-source or fetch-strategy error means the usage state is **unknown**, not exhausted.

If CodexBar cannot report a provider, try `plan-check json`. If that command fails, times out, or cannot parse current usage, do not treat its result as authoritative. A further fallback is `~/.hermes/state/quota-heartbeat.json`, but first inspect its timestamp: stale heartbeat state is historical evidence only and must never override a current provider response, a current CLI limit message, or a current successful dispatch.

`claude-qwen --version` is a safe liveness probe for the resolved wrapper, but it does **not** prove Qwen quota remains. A real Qwen dispatch may return JSON with `"api_error_status":429` and a `result` explaining that the token-plan quota is exhausted and giving a reset time. Record that reset and **do not repeatedly retry** the provider before the reset unless a newer live quota signal says it is available again.

Never print, copy, grep, or embed the wrapper's credentials or API keys in logs, prompts, PR comments, or reports.

## Exact-revision review contract

1. Refresh `pr_snapshot.py` and record the exact pushed head SHA and current live target-branch tip.
2. Fetch the live target branch and confirm the clean PR worktree is at the exact head.
3. Create or otherwise expose a read-only review bundle containing the exact diff for that head/base-tip pair. Do not let a moving branch ref redefine the reviewed diff after dispatch.
4. Invoke `claude-qwen` in non-interactive, read-only mode. Prefer `--safe-mode` or `--bare`, `--permission-mode dontAsk`, and only read/search tools. Do not grant Edit/Write or unrestricted Bash merely for convenience.
5. Bind the prompt to the **exact head/base-tip pair** and require a terminal verdict with reviewed head SHA, reviewed base-tip SHA, verdict, blockers, should-fix findings, and nits. Every actionable finding must include file/line evidence and a concrete failure scenario.
6. Count the verdict only when the outer command succeeded, the result is terminal and well formed, both SHAs match, and there is no quota/auth/provider error.

Representative invocation when the exact diff bundle is already available to the reviewer:

```bash
QWEN_BIN="$(command -v claude-qwen)"
"$QWEN_BIN" \
  --safe-mode --bare \
  --permission-mode dontAsk \
  --tools Read,Grep,Glob \
  --add-dir <bundle-path> \
  --no-chrome --no-session-persistence \
  --output-format json \
  -p "Read <bundle-path>/diff.patch and review only that frozen diff for HEAD <head-sha> against live base tip <base-tip-sha>. Read-only. Return reviewed_head_sha, reviewed_base_tip_sha, verdict READY or NOT_READY, blockers, should_fix, and nits."
```

If the wrapper or current Claude Code version rejects a compatibility flag, remove only that unsupported flag while preserving the read-only tool boundary and exact-SHA contract.

## Fallback semantics

Qwen is a substitute reviewer, not a relaxed gate. Use it after the preferred reviewer paths and other strong configured reviewers are unavailable or exhausted. Do not silently substitute Qwen when the user explicitly required Opus, Kimi, GPT-5.6 Sol, or another named reviewer.

A Qwen `READY` verdict is static-review evidence only. CI, mergeability, GitHub review state, unresolved threads, worktree cleanliness, and live revision coordinates still require independent verification. Any push or live base-tip movement invalidates the Qwen verdict and requires a fresh exact-revision review.
