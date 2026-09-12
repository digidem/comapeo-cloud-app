# GPT-6 Astra via Codex reviewer

Use **GPT-6 Astra** through Codex as the default independent reviewer when the user has not explicitly requested another model. The verified Codex model id is `gpt-6-astra`.

## Exact-revision review contract

Run the review from the exact PR worktree in read-only mode and bind the prompt to the **exact head/base-tip pair**: current pushed head SHA plus current live target-branch tip. Require the reviewer to verify those coordinates before evaluating the diff, classify findings as blockers / should-fix / nits, and return a terminal verdict.

A typical bounded invocation is `codex exec -m gpt-6-astra` with the working directory set to the exact PR worktree and a prompt that names both SHAs. Prefer a read-only sandbox/approval mode when the local Codex version exposes one. The reviewer must not modify files.

If the foreground shell hits its execution ceiling after Codex has created a resumable session, resume that same session with GPT-6 Astra and request the terminal verdict rather than starting a new review or counting partial reasoning. A timed-out, malformed, wrong-SHA, stale-SHA, failed, or still-running result is not approval.

## Availability and fallback

Use fresh Codex quota/usage instrumentation when available. If availability remains unknown, one bounded `gpt-6-astra` liveness probe is sufficient. An explicit quota/auth/provider failure makes this path unavailable for that cycle; a timeout is an availability failure, not proof of quota exhaustion.

If the user explicitly required GPT-6 Astra, do not substitute another model. Otherwise follow the fallback order in `../SKILL.md`. Do not silently substitute an older GPT model.
