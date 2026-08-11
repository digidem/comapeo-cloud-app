# Claude Code independent review

Use this path for long-running independent PR reviews when Claude Code is available. It avoids tying reviewer wall-clock time to the shell/tool timeout.

## Preferred path: supervisor-backed background review

Claude Code 2.1.139+ supports background sessions with `--bg`. The background process is owned by Claude Code's supervisor rather than the invoking terminal, so the dispatch can return immediately while the review continues.

Before dispatch, get a fail-closed PR snapshot and use its **live** `pull_request.base_tip_sha`. Do not use the PR payload's `baseRefOid` / REST `base.sha` as the current base tip: those can remain pinned to an older base commit after the target branch advances. Fetch the target branch explicitly into its remote-tracking ref so the local diff matches the live branch tip.

```bash
python3 .agents/skills/pr-cycle/scripts/pr_snapshot.py \
  --repo <owner/repo> --pr <number> --expect-head <exact-head-sha>

git fetch origin <base>:refs/remotes/origin/<base>

python3 .agents/skills/pr-cycle/scripts/claude_review.py start \
  --expect-head <exact-head-sha> \
  --expect-base-tip <live-base-tip-sha> \
  --base-ref refs/remotes/origin/<base> \
  --model opus \
  --effort high \
  --name pr-<number>-opus-review
```

The helper deliberately uses:

- `--safe-mode` plus `CLAUDE_CODE_SAFE_MODE=1` so hooks, plugins, MCP servers, CLAUDE.md, agents, and other local customizations cannot interfere with the initial review session.
- normal Claude authentication, including subscription OAuth/keychain credentials. Do **not** replace this with `--bare` on the normal subscription path: bare mode skips OAuth/keychain reads and requires API-key-style authentication.
- `--permission-mode dontAsk` with **only** `Read,Grep,Glob`; Claude receives no Bash or mutation tool. The helper itself verifies Git state and writes a private exact-revision bundle (`metadata.json`, `files.txt`, `diff.patch`) outside the worktree, then exposes only that bundle with `--add-dir`.
- `--no-chrome` to avoid irrelevant browser integration.
- exact local verification of the pushed HEAD SHA and the **current target-branch tip**, plus an exact computed merge-base for the three-dot diff.
- a clean-worktree requirement so uncommitted edits cannot contaminate an exact-SHA review.
- a prompt bound to the exact 40-character HEAD SHA, live base-tip SHA, merge-base SHA, and base ref.
- an explicit prohibition on file edits, GitHub mutation, CI polling, and Ultrareview.

Do not use `--permission-mode plan` for this reviewer. Plan mode has its own plan-file/turn-ending workflow and conflicts with a read-only, unattended session whose terminal response must be the JSON verdict.

Claude Code's `--add-dir`, `--tools`, and `--allowedTools` flags are variadic. Keep the positional prompt before all three; putting any of these variadic flags before the prompt can consume the prompt and create an idle background session.

The helper gives each session a unique name. It first parses the short background id from Claude's response, but if that human-readable stdout format changes it recovers the id by scanning the persisted job state for that unique name and exact cwd. A successful dispatch must never silently orphan an untracked review.

## Poll without holding the shell open

Poll in bounded windows:

```bash
python3 .agents/skills/pr-cycle/scripts/claude_review.py poll \
  --id <background-id> \
  --expect-head <exact-head-sha> \
  --expect-base-tip <live-base-tip-sha> \
  --expect-merge-base <merge-base-sha-returned-by-start> \
  --wait-seconds 60
```

The helper reads Claude Code's per-job state under `~/.claude/jobs/<id>/state.json` (or `CLAUDE_CONFIG_DIR`) to determine lifecycle state. On completion it reads the persisted session transcript referenced by that state and validates the **literal final assistant response** against all three recorded revision SHAs. Do not treat `state.json`'s `output.result` as authoritative when a transcript is available: current Claude Code may store a short supervisor-generated summary there instead of the full final response. The private diff bundle is deleted automatically when the session reaches a terminal result or is explicitly stopped.

Interpret results as follows:

- `done`: final response parsed and validated; count the verdict only if `reviewed_sha`, `base_tip_sha`, and `merge_base_sha` all match the exact review bundle.
- `still_running`: healthy bounded wait; rerun the poll later.
- `invalid_result`: fail closed; the reviewer completed but the final response did not satisfy the verdict contract.
- `failed` / `stopped` / `error`: reviewer failed; inspect `claude logs <id>` only for diagnostics.
- any unrecognized/blocked/needs-input state: treat as attention-required rather than polling indefinitely.

State-file reads include short retries because the supervisor may rewrite the JSON concurrently.

If a review becomes blocked or must be abandoned, stop it non-destructively:

```bash
python3 .agents/skills/pr-cycle/scripts/claude_review.py stop --id <background-id>
```

Do **not** automatically call `claude rm` from the PR cycle. Claude documents that command as deleting a background session and its worktree, so it is too destructive for generic cleanup when the reviewer was launched from the user's existing PR worktree. Completed session metadata may remain. Also do not use `claude respawn` for reviewer recovery: dispatch a fresh helper-managed session instead so safe-mode and the read-only permission contract are applied again explicitly.

## Verdict contract

The final Claude response must be a single JSON object containing:

- `reviewed_sha` — full 40-character PR head SHA
- `base_tip_sha` — full 40-character live target-branch tip SHA
- `merge_base_sha` — full 40-character merge-base SHA used to freeze the three-dot diff
- `verdict` — `ready` or `not_ready`
- `blockers` — list
- `should_fix` — list
- `nits` — list
- optional `notes`

The helper rejects inconsistent responses: all three revision SHAs must match the bundle, actionable findings require `not_ready`, and no blocker/should-fix finding requires `ready`.

A Claude verdict is static-review evidence only and is valid for the reviewed **(head SHA, live base-tip SHA, merge-base SHA)** tuple. The bundle itself is generated from the exact head/base-tip commit IDs rather than a moving ref name, so a later local fetch cannot change `diff.patch`. Keep the PR worktree checked out at the reviewed head and do not mutate it until the background review is terminal, because Claude may read surrounding repository context from that worktree. If the PR head or live target tip moves, the verdict is stale. GitHub CI, mergeability, review-thread state, and live revision coordinates remain independently verified by `pr_snapshot.py` / `pr_wait.py`.

## Foreground fallback

Use foreground mode only when background agents are unavailable or broken. Keep it structured and resumable:

```bash
claude --safe-mode -p \
  --model opus \
  --session-id <uuid> \
  --output-format json \
  --json-schema '<review-schema>' \
  '<bounded review prompt>'
```

If the shell is interrupted, resume the same persisted session by UUID instead of restarting the review from scratch. Keep the prompt/diff bounded. `--bare` is acceptable only when `ANTHROPIC_API_KEY` or an explicit `apiKeyHelper` is intentionally configured.

## Explicit exclusions

Do not invoke `claude ultrareview` or `/ultrareview` as part of the normal PR cycle. It uses a separate credit/cost surface outside the intended subscription workflow.
