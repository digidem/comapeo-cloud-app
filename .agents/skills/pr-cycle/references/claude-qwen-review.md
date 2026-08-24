# Claude-Qwen fallback reviewer

Use this path when the preferred independent reviewers are unavailable or exhausted and the user did not explicitly require a different named model. On this workstation, `claude-qwen` is a **zsh alias** defined in `/home/coder/.zshrc`, not a standalone executable. The alias supplies the Alibaba MaaS Anthropic-compatible endpoint and credentials, selects **Qwen 3.8** (`qwen3.8-max`), and invokes `claude`. Do not use `command -v claude-qwen` as an executable-resolution test, and do not start a normal interactive `zsh -ic` merely to discover the alias: that would source `.zshrc` before tracing can be disabled. Use the protected no-RC bootstrap below, which disables tracing first, sources the fixed trusted `/home/coder/.zshrc` with startup output suppressed, disables tracing again, and only then inspects the alias without printing its body.

## Availability and usage preflight

Before declaring reviewer options exhausted, use live usage instrumentation when it is available. Prefer provider-scoped checks so one slow provider does not make an all-provider command hang:

```bash
codexbar usage --provider codex --source cli --json
codexbar usage --provider claude --source cli --json
```

Accept CodexBar as current only when the selected provider/source is documented to perform a **fresh provider query at read time**. If that source may return cached state, require a **provider-specific observation timestamp** in the returned record that is no older than 15 minutes and no more than 5 minutes in the future at read time. For other providers, use `codexbar usage --provider <provider> --json` only when that provider has a supported source on the current platform and the same freshness rule can be established. Unsupported-source, fetch-strategy, cached-without-provider-timestamp, and parser errors leave usage **unknown**, not exhausted.

If CodexBar cannot prove freshness for a provider, accept `plan-check json` only when the selected provider's own usage record contains a parseable **provider-specific observation timestamp** that is no older than 15 minutes and no more than 5 minutes in the future at read time. A fresh global output/file timestamp does not make a stale provider record current. If `plan-check json` cannot provide that provider-specific freshness proof, use `~/.hermes/state/quota-heartbeat.json` only when the selected provider entry itself contains a parseable **provider-specific observation timestamp** that is no older than 15 minutes and no more than 5 minutes in the future at read time. A fresh heartbeat-file timestamp alone is insufficient. Anything outside those bounds is stale/invalid historical evidence and leaves quota **unknown**, not exhausted; it must never override a current provider response, a current CLI limit message, or a current successful dispatch.

Alias availability does **not** prove Qwen quota. If no fresh provider-specific Qwen quota telemetry is available, run at most **one bounded provider-specific liveness probe** through the alias before attempting a review. The probe prompt is intentionally non-sensitive, so it may be supplied directly:

```bash
timeout --kill-after=5s 60s zsh -f -c '
  unsetopt XTRACE VERBOSE
  source /home/coder/.zshrc >/dev/null 2>&1
  unsetopt XTRACE VERBOSE
  [[ ${+aliases[claude-qwen]} -eq 1 ]] || exit 1
  alias_body="${aliases[claude-qwen]}"
  alias_words=("${(@z)alias_body}")
  (( ${#alias_words} >= 4 )) || exit 1
  [[ ${alias_words[-1]} == claude ]] || exit 1
  base_url_count=0
  api_url_count=0
  model_count=0
  for word in "${(@)alias_words[1,-2]}"; do
    [[ "$word" =~ '"'"'^[A-Za-z_][A-Za-z0-9_]*='"'"' ]] || exit 1
    case "$word" in
      ANTHROPIC_BASE_URL=*)
        (( ++base_url_count == 1 )) || exit 1
        value=${word#*=}
        value=${(Q)value}
        [[ "$value" == https://token-plan.ap-southeast-1.maas.aliyuncs.com/apps/anthropic ]] || exit 1
        ;;
      ANTHROPIC_API_URL=*)
        (( ++api_url_count == 1 )) || exit 1
        value=${word#*=}
        value=${(Q)value}
        [[ "$value" == https://token-plan.ap-southeast-1.maas.aliyuncs.com/apps/anthropic ]] || exit 1
        ;;
      ANTHROPIC_MODEL=*)
        (( ++model_count == 1 )) || exit 1
        value=${word#*=}
        value=${(Q)value}
        [[ "$value" == qwen3.8-max ]] || exit 1
        ;;
    esac
  done
  (( base_url_count == 1 && api_url_count == 1 && model_count == 1 )) || exit 1
  unset alias_body alias_words word value base_url_count api_url_count model_count
  eval '\''claude-qwen --bare --permission-mode dontAsk --tools "" --no-chrome --no-session-persistence --output-format json -p "Reply only QWEN_OK"'\''
'
```

A successful probe establishes Qwen availability for the cycle. The GNU `timeout --kill-after=5s 60s` wrapper bounds the whole probe: send TERM at 60 seconds and force KILL five seconds later if the provider process does not exit. A response with `"api_error_status":429` or another explicit token-plan quota/auth error establishes unavailability; record any reset time from the provider and **do not repeatedly retry** before that reset unless a newer live signal proves availability. A timeout, hang, or provider error without an explicit quota response means unavailable for this cycle without claiming quota exhaustion. `claude-qwen --version`, alias existence, and ordinary Claude subscription quota do not prove Alibaba token-plan quota.

Never print, copy, grep, or embed the alias body, credentials, or API keys in logs, prompts, PR comments, or reports. In particular, do not run a command that prints `alias claude-qwen` or the `aliases[claude-qwen]` value. The alias body is allowed to be inspected only inside the trusted local zsh process for non-output validation. This path necessarily trusts the user's `~/.zshrc` as the local credential/configuration source; if that shell configuration is not trusted or the alias shape cannot be validated, treat Qwen as unavailable.

## Exact-revision review contract

1. Refresh `pr_snapshot.py` and record the exact pushed head SHA and current live target-branch tip.
2. Fetch the live target branch and confirm the clean PR worktree is at the exact head.
3. The orchestrator—not Qwen—must construct a sanitized prompt containing only the exact head/base-tip metadata, the frozen diff for that pair, and the review instructions. Do not include environment values, credentials, arbitrary home-directory contents, or unrelated repository files.
4. Before writing the frozen diff, create a private review root using symlink-safe exclusive `mktemp -d` creation, validate that it matches the intended private-template prefix, install cleanup **before any later allocation**, and make every permission change fail closed. Enforce mode 0700 on the root; create `<sanitized-prompt-file>` inside it with `mktemp` and enforce mode 0600; then create a separate empty isolated working directory inside the root with mode 0700. Cleanup must recursively remove only the exact validated review root so partial startup artifacts cannot prevent removal. Write the sanitized prompt only to that private file, never to logs or stdout.
5. Start zsh with `-f` so it does **not** source user startup files automatically. Disable `XTRACE` and `VERBOSE` before any user shell configuration is loaded, source the fixed trusted `/home/coder/.zshrc` with both stdout and stderr suppressed, then disable `XTRACE` and `VERBOSE` again before reading or expanding the alias. This prevents either inherited options or options enabled by `.zshrc` from exposing the secret-bearing alias body. Then validate without printing the value that `aliases[claude-qwen]` exists and parses as shell words where every token before the command matches the exact plain-assignment form `NAME=value`; alternate assignment operators or forms such as `+=` or indexed assignments are forbidden by that fail-closed check. `ANTHROPIC_BASE_URL`, `ANTHROPIC_API_URL`, and `ANTHROPIC_MODEL` must each appear **exactly once**; every occurrence decodes immediately to the expected Alibaba token-plan endpoint or `qwen3.8-max`; and the final/only command token is exactly `claude`. Any duplicate required assignment, alternate required assignment form, or wrong required value must fail closed, even if an earlier occurrence was valid. If validation fails, treat Qwen as unavailable rather than guessing or reconstructing credentials.
6. Invoke `claude-qwen` with **no tools**. No reviewer filesystem tools are allowed: use `--tools ""`, do not use `--add-dir`, and do not grant Read/Grep/Glob/Bash/Edit/Write. Feed the complete sanitized prompt through stdin; never place the frozen diff or full prompt in process argv. The combination of `--bare`, an empty working directory, no Claude tools, private prompt transport, and stdin prevents prompt-injection text in the diff from reading repository or credential files through Claude Code.
7. Bind the prompt to the **exact head/base-tip pair** and require a terminal verdict with reviewed head SHA, reviewed base-tip SHA, verdict, blockers, should-fix findings, and nits. Every actionable finding must include file/line evidence and a concrete failure scenario.
8. Count the verdict only when the outer command succeeded, the result is terminal and well formed, both SHAs match, and there is no quota/auth/provider error.

Representative invocation after the orchestrator has written the frozen exact-SHA prompt:

```bash
REVIEW_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/claude-qwen-review.XXXXXX")" || exit 1
case "$REVIEW_ROOT" in
  "${TMPDIR:-/tmp}"/claude-qwen-review.*) ;;
  *) rmdir -- "$REVIEW_ROOT"; exit 1 ;;
esac
cleanup() { rm -rf -- "$REVIEW_ROOT"; }
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
chmod 700 "$REVIEW_ROOT" || exit 1
PROMPT_FILE="$(mktemp "$REVIEW_ROOT/prompt.XXXXXX")" || exit 1
chmod 600 "$PROMPT_FILE" || exit 1
WORK_DIR="$(mktemp -d "$REVIEW_ROOT/cwd.XXXXXX")" || exit 1
chmod 700 "$WORK_DIR" || exit 1

# The orchestrator writes only the sanitized exact-SHA review prompt to $PROMPT_FILE.
(
  cd "$WORK_DIR" || exit 1
  timeout --kill-after=15s 300s zsh -f -c '
    unsetopt XTRACE VERBOSE
    source /home/coder/.zshrc >/dev/null 2>&1
    unsetopt XTRACE VERBOSE
    [[ ${+aliases[claude-qwen]} -eq 1 ]] || exit 1
    alias_body="${aliases[claude-qwen]}"
    alias_words=("${(@z)alias_body}")
    (( ${#alias_words} >= 4 )) || exit 1
    [[ ${alias_words[-1]} == claude ]] || exit 1
    base_url_count=0
    api_url_count=0
    model_count=0
    for word in "${(@)alias_words[1,-2]}"; do
      [[ "$word" =~ '"'"'^[A-Za-z_][A-Za-z0-9_]*='"'"' ]] || exit 1
      case "$word" in
        ANTHROPIC_BASE_URL=*)
          (( ++base_url_count == 1 )) || exit 1
          value=${word#*=}
          value=${(Q)value}
          [[ "$value" == https://token-plan.ap-southeast-1.maas.aliyuncs.com/apps/anthropic ]] || exit 1
          ;;
        ANTHROPIC_API_URL=*)
          (( ++api_url_count == 1 )) || exit 1
          value=${word#*=}
          value=${(Q)value}
          [[ "$value" == https://token-plan.ap-southeast-1.maas.aliyuncs.com/apps/anthropic ]] || exit 1
          ;;
        ANTHROPIC_MODEL=*)
          (( ++model_count == 1 )) || exit 1
          value=${word#*=}
          value=${(Q)value}
          [[ "$value" == qwen3.8-max ]] || exit 1
          ;;
      esac
    done
    (( base_url_count == 1 && api_url_count == 1 && model_count == 1 )) || exit 1
    unset alias_body alias_words word value base_url_count api_url_count model_count
    eval '\''claude-qwen \
      --bare \
      --permission-mode dontAsk \
      --tools "" \
      --no-chrome --no-session-persistence \
      --output-format json \
      -p'\''
  ' < "$PROMPT_FILE"
)
```

The full review is also hard-bounded: `timeout --kill-after=15s 300s` sends TERM after five minutes and forces KILL fifteen seconds later if needed. A timeout or partial result is not a verdict; treat Qwen as unavailable for this cycle and move to the next allowed reviewer path rather than extending the bound ad hoc. Do not use `--add-dir` for this reviewer. Do not replace stdin with `-p "$(cat ...)"` or any other argv expansion of the confidential review prompt. Do not copy the alias body into a script, environment variable exported by the orchestrator, issue comment, or log. The tool-less/private-transport boundary is mandatory, not a compatibility preference: if the alias, zsh startup environment, or current Claude Code version cannot enforce `--tools ""`, stdin prompt input, and the isolated working-directory pattern (or equivalents with the same confidentiality properties), treat Qwen as unavailable for this cycle rather than removing the boundary.

## Fallback semantics

Qwen is a substitute reviewer, not a relaxed gate. Use it after the preferred reviewer paths and other strong configured reviewers are unavailable or exhausted. Check Qwen quota before review dispatch; do not spend a full frozen-diff review merely to discover a known exhausted token-plan. Do not silently substitute Qwen when the user explicitly required Opus, Kimi, GPT-5.6 Sol, or another named reviewer.

A Qwen `READY` verdict is static-review evidence only. CI, mergeability, GitHub review state, unresolved threads, worktree cleanliness, and live revision coordinates still require independent verification. Any push or live base-tip movement invalidates the Qwen verdict and requires a fresh exact-revision review.
