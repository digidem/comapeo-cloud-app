# Claude-Qwen fallback reviewer

Use this path when the preferred independent reviewers are unavailable or exhausted, the user did not explicitly require a different named model, and a `claude-qwen` wrapper is available. Resolve it with `command -v claude-qwen`; if the wrapper is not on `PATH`, check known local install locations such as `/home/coder/.local/bin/claude-qwen` without reading or exposing its credentials. The wrapper routes Claude Code through Alibaba MaaS using **Qwen 3.8** (`qwen3.8-max-preview`), so its quota is distinct from the normal Claude subscription session window.

## Availability and usage preflight

Before declaring reviewer options exhausted, use live usage instrumentation when it is available. Prefer provider-scoped checks so one slow provider does not make an all-provider command hang:

```bash
codexbar usage --provider codex --source cli --json
codexbar usage --provider claude --source cli --json
```

For other providers, use `codexbar usage --provider <provider> --json` only when that provider has a supported source on the current platform. An unsupported-source or fetch-strategy error means the usage state is **unknown**, not exhausted.

If CodexBar cannot report a provider, accept `plan-check json` only when its output includes a parseable observation timestamp that is no older than 15 minutes and no more than 5 minutes in the future at read time. Missing, invalid, future, or stale observation time leaves quota **unknown**, not exhausted even when the usage fields otherwise parse. If `plan-check json` cannot provide a fresh observation, use `~/.hermes/state/quota-heartbeat.json` only when its timestamp is parseable, no older than 15 minutes, and no more than 5 minutes in the future at read time. Anything outside those bounds is stale/invalid historical evidence and leaves quota **unknown**, not exhausted; it must never override a current provider response, a current CLI limit message, or a current successful dispatch.

When quota remains unknown after instrumentation, use at most one bounded provider-specific liveness probe before falling through to the next reviewer. A successful probe establishes availability for the cycle. An explicit quota/auth/429 response establishes unavailability and any stated reset should be recorded. A timeout, hang, or provider error means unavailable for this cycle without claiming quota exhaustion; do not repeatedly probe the same unhealthy harness. `claude-qwen --version` is only a wrapper-liveness check and does **not** prove Qwen quota remains. A real Qwen dispatch may return JSON with `"api_error_status":429` and a `result` explaining that the token-plan quota is exhausted and giving a reset time. Record that reset and **do not repeatedly retry** the provider before the reset unless a newer live quota signal says it is available again.

Never print, copy, grep, or embed the wrapper's credentials or API keys in logs, prompts, PR comments, or reports.

## Exact-revision review contract

1. Refresh `pr_snapshot.py` and record the exact pushed head SHA and current live target-branch tip.
2. Fetch the live target branch and confirm the clean PR worktree is at the exact head.
3. The orchestrator—not Qwen—must construct a sanitized prompt containing only the exact head/base-tip metadata, the frozen diff for that pair, and the review instructions. Do not include environment values, credentials, arbitrary home-directory contents, or unrelated repository files.
4. Before writing the frozen diff, create a private review root using symlink-safe exclusive `mktemp -d` creation and enforce mode 0700. Create `<sanitized-prompt-file>` inside that root with `mktemp`, enforce mode 0600, and create a separate empty isolated working directory inside the root with mode 0700. Write the sanitized prompt only to that private file, never to logs or stdout, and install cleanup that removes the prompt file and private directories on every exit path.
5. Invoke `claude-qwen` from the empty isolated working directory with **no tools**. No reviewer filesystem tools are allowed: use `--tools ""`, do not use `--add-dir`, and do not grant Read/Grep/Glob/Bash/Edit/Write. Feed the complete sanitized prompt through stdin; never place the frozen diff or full prompt in process argv. The combination of `--bare`, an empty working directory, no tools, private prompt transport, and stdin prevents prompt-injection text in the diff from reading local credentials or startup project state.
6. Bind the prompt to the **exact head/base-tip pair** and require a terminal verdict with reviewed head SHA, reviewed base-tip SHA, verdict, blockers, should-fix findings, and nits. Every actionable finding must include file/line evidence and a concrete failure scenario.
7. Count the verdict only when the outer command succeeded, the result is terminal and well formed, both SHAs match, and there is no quota/auth/provider error.

Representative invocation after the orchestrator has resolved `QWEN_BIN` and is ready to write the frozen exact-SHA prompt:

```bash
QWEN_BIN="${QWEN_BIN:-$(command -v claude-qwen)}"
REVIEW_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/claude-qwen-review.XXXXXX")" || exit 1
chmod 700 "$REVIEW_ROOT"
PROMPT_FILE="$(mktemp "$REVIEW_ROOT/prompt.XXXXXX")" || exit 1
chmod 600 "$PROMPT_FILE"
WORK_DIR="$(mktemp -d "$REVIEW_ROOT/cwd.XXXXXX")" || exit 1
chmod 700 "$WORK_DIR"
trap 'rm -f -- "$PROMPT_FILE"; rmdir -- "$WORK_DIR" "$REVIEW_ROOT"' EXIT

# The orchestrator writes only the sanitized exact-SHA review prompt to $PROMPT_FILE.
(
  cd "$WORK_DIR" || exit 1
  "$QWEN_BIN" \
    --bare \
    --permission-mode dontAsk \
    --tools "" \
    --no-chrome --no-session-persistence \
    --output-format json \
    -p < "$PROMPT_FILE"
)
```

Do not use `--add-dir` for this reviewer. Do not replace stdin with `-p "$(cat ...)"` or any other argv expansion of the prompt. The tool-less/private-transport boundary is mandatory, not a compatibility preference: if the wrapper or current Claude Code version cannot enforce `--tools ""`, stdin prompt input, and the isolated working-directory pattern (or equivalents with the same confidentiality properties), treat Qwen as unavailable for this cycle rather than removing the boundary. Other compatibility flags may be removed only when doing so does not expand filesystem/tool access, expose prompt contents, or weaken the exact-SHA contract.

## Fallback semantics

Qwen is a substitute reviewer, not a relaxed gate. Use it after the preferred reviewer paths and other strong configured reviewers are unavailable or exhausted. Do not silently substitute Qwen when the user explicitly required Opus, Kimi, GPT-5.6 Sol, or another named reviewer.

A Qwen `READY` verdict is static-review evidence only. CI, mergeability, GitHub review state, unresolved threads, worktree cleanliness, and live revision coordinates still require independent verification. Any push or live base-tip movement invalidates the Qwen verdict and requires a fresh exact-revision review.
