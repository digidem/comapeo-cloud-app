#!/usr/bin/env python3
"""Dispatch and poll a timeout-safe Claude Code background PR review.

This helper is intentionally read-only. It verifies the local HEAD before dispatch,
uses Claude Code's supervisor-backed background sessions, and reads the documented
per-job state file instead of keeping a shell attached to a long-running review.

Requires Claude Code >= 2.1.139 for background agents.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import time
import uuid
from typing import Any


MIN_BACKGROUND_VERSION = (2, 1, 139)
BACKGROUND_ID_RE = re.compile(r"backgrounded\s+[·:]\s*([0-9a-fA-F]{8})")
TERMINAL_FAILURE_STATES = {"failed", "stopped", "error"}
RUNNING_STATES = {"working", "running", "starting"}
READ_ONLY_TOOLS = "Read,Grep,Glob"


class ClaudeReviewError(RuntimeError):
    pass


def run_command(
    args: list[str],
    *,
    cwd: str | None = None,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            args,
            cwd=cwd,
            check=False,
            capture_output=True,
            text=True,
            env=env,
        )
    except FileNotFoundError as exc:
        raise ClaudeReviewError(f"command not found: {args[0]}") from exc


def parse_version(raw: str) -> tuple[int, int, int]:
    match = re.search(r"(\d+)\.(\d+)\.(\d+)", raw)
    if not match:
        raise ClaudeReviewError(f"could not parse Claude Code version from: {raw.strip()!r}")
    return tuple(int(part) for part in match.groups())  # type: ignore[return-value]


def claude_version() -> tuple[int, int, int]:
    result = run_command(["claude", "--version"])
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "unknown error"
        raise ClaudeReviewError(f"claude --version failed: {detail}")
    return parse_version(result.stdout)


def config_dir() -> pathlib.Path:
    override = os.environ.get("CLAUDE_CONFIG_DIR")
    return pathlib.Path(override).expanduser() if override else pathlib.Path.home() / ".claude"


def git_oid(cwd: str, ref: str) -> str:
    result = run_command(["git", "rev-parse", ref], cwd=cwd)
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "unknown git error"
        raise ClaudeReviewError(f"git rev-parse {ref} failed: {detail}")
    oid = result.stdout.strip().lower()
    if not re.fullmatch(r"[0-9a-f]{40}", oid):
        raise ClaudeReviewError(f"git returned an invalid SHA for {ref}: {oid!r}")
    return oid


def git_head(cwd: str) -> str:
    return git_oid(cwd, "HEAD")


def normalize_expected_sha(value: str, flag: str) -> str:
    normalized = value.strip().lower()
    if not 7 <= len(normalized) <= 40 or not re.fullmatch(r"[0-9a-f]+", normalized):
        raise ClaudeReviewError(f"{flag} must be a 7-40 character hexadecimal SHA")
    return normalized


def normalize_expected_head(value: str) -> str:
    return normalize_expected_sha(value, "--expect-head")


def verify_head(cwd: str, expected_head: str) -> str:
    expected = normalize_expected_head(expected_head)
    actual = git_head(cwd)
    if not actual.startswith(expected):
        raise ClaudeReviewError(f"local HEAD does not match expected {expected}: found {actual}")
    return actual


def verify_base_tip(cwd: str, base_ref: str, expected_base_tip: str) -> str:
    expected = normalize_expected_head(expected_base_tip)
    actual = git_oid(cwd, base_ref)
    if not actual.startswith(expected):
        raise ClaudeReviewError(
            f"local base ref {base_ref} does not match current GitHub base tip {expected}: "
            f"found {actual}; fetch the base branch into the remote-tracking ref"
        )
    return actual


def git_merge_base(cwd: str, base_tip_sha: str, head_sha: str) -> str:
    result = run_command(["git", "merge-base", base_tip_sha, head_sha], cwd=cwd)
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "unknown git error"
        raise ClaudeReviewError(
            f"git merge-base {base_tip_sha} {head_sha} failed: {detail}"
        )
    oid = result.stdout.strip().lower()
    if not re.fullmatch(r"[0-9a-f]{40}", oid):
        raise ClaudeReviewError(f"git returned an invalid merge-base SHA: {oid!r}")
    return oid


def require_clean_worktree(cwd: str) -> None:
    result = run_command(
        ["git", "status", "--porcelain=v1", "--untracked-files=all"],
        cwd=cwd,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "unknown git error"
        raise ClaudeReviewError(f"git status failed: {detail}")
    if result.stdout.strip():
        raise ClaudeReviewError(
            "PR worktree is not clean; commit/push intended changes before dispatching an exact-SHA review"
        )


def sanitize_session_prefix(value: str) -> str:
    sanitized = re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-._")
    return (sanitized or "pr-review")[:48]


def bundle_root() -> pathlib.Path:
    root = config_dir() / "pr-cycle-review-bundles"
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        root.chmod(0o700)
    except OSError:
        pass
    return root


def bundle_dir_for_name(session_name: str) -> pathlib.Path:
    if not re.fullmatch(r"[A-Za-z0-9._-]{1,80}", session_name):
        raise ClaudeReviewError("Claude session name is not safe for bundle lookup")
    return bundle_root() / session_name


def write_git_output(cwd: str, args: list[str], path: pathlib.Path) -> None:
    try:
        with path.open("w", encoding="utf-8") as output:
            result = subprocess.run(
                ["git", *args],
                cwd=cwd,
                check=False,
                stdout=output,
                stderr=subprocess.PIPE,
                text=True,
            )
    except FileNotFoundError as exc:
        raise ClaudeReviewError("git is not installed or not on PATH") from exc
    if result.returncode != 0:
        detail = result.stderr.strip() or "unknown git error"
        raise ClaudeReviewError(f"git {' '.join(args)} failed: {detail}")
    try:
        path.chmod(0o600)
    except OSError:
        pass


def create_review_bundle(
    *,
    cwd: str,
    session_name: str,
    head: str,
    base_ref: str,
    base_tip_sha: str,
    merge_base_sha: str,
) -> pathlib.Path:
    bundle = bundle_dir_for_name(session_name)
    if bundle.exists():
        raise ClaudeReviewError(f"review bundle already exists: {bundle}")
    bundle.mkdir(mode=0o700)
    try:
        metadata = {
            "head_sha": head,
            "base_ref": base_ref,
            "base_tip_sha": base_tip_sha,
            "merge_base_sha": merge_base_sha,
            "worktree": str(pathlib.Path(cwd).resolve()),
        }
        metadata_path = bundle / "metadata.json"
        metadata_path.write_text(
            json.dumps(metadata, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        metadata_path.chmod(0o600)
        write_git_output(
            cwd,
            [
                "diff",
                "--no-ext-diff",
                "--no-textconv",
                "--find-renames",
                f"{base_tip_sha}...{head}",
                "--",
            ],
            bundle / "diff.patch",
        )
        write_git_output(
            cwd,
            ["diff", "--name-status", f"{base_tip_sha}...{head}", "--"],
            bundle / "files.txt",
        )
    except Exception:
        shutil.rmtree(bundle, ignore_errors=True)
        raise
    return bundle


def cleanup_review_bundle(session_name: str | None) -> None:
    if not isinstance(session_name, str) or not session_name:
        return
    try:
        bundle = bundle_dir_for_name(session_name)
    except ClaudeReviewError:
        return
    root = bundle_root().resolve()
    try:
        resolved = bundle.resolve()
    except OSError:
        return
    if resolved.parent != root:
        return
    shutil.rmtree(resolved, ignore_errors=True)


def review_prompt(
    head: str,
    base_ref: str,
    base_tip_sha: str,
    merge_base_sha: str,
    bundle: pathlib.Path,
    extra_context: str | None = None,
) -> str:
    context = f"\nAdditional task context:\n{extra_context.strip()}\n" if extra_context else ""
    return f"""Perform an independent, read-only merge-readiness review of the current pull-request branch.

Exact reviewed HEAD SHA: {head}
Current base-branch tip SHA: {base_tip_sha}
Merge-base SHA for `{base_ref}...HEAD`: {merge_base_sha}
Base ref: {base_ref}
Review bundle: {bundle}

Rules:
- First read `{bundle / 'metadata.json'}`, `{bundle / 'files.txt'}`, and `{bundle / 'diff.patch'}`. The PR-cycle helper generated them only after verifying the clean worktree, exact HEAD, live base tip, and merge-base above. Treat `diff.patch` as the authoritative PR diff for this review.
- Read repository AGENTS.md files and only the surrounding source/tests needed to judge the changed code. Use only Read, Grep, and Glob; no shell or mutation tools are available.
- Review for correctness, regressions, security, data loss, concurrency/state issues, test gaps, and maintainability risks that should block or precede merge.
- Do not edit files, create worktrees, commit, push, resolve comments, or mutate GitHub state.
- Do not poll CI; live GitHub state is verified independently by the PR-cycle driver.
- Do not invoke ultrareview.
- Distinguish blockers and should-fix findings from optional nits. Do not manufacture findings.
{context}
Your FINAL response must be exactly one JSON object, with no Markdown fence or prose outside it, matching this shape:
{{
  "reviewed_sha": "{head}",
  "base_tip_sha": "{base_tip_sha}",
  "merge_base_sha": "{merge_base_sha}",
  "verdict": "ready" | "not_ready",
  "blockers": [{{"summary": "...", "path": "path/or/null", "line": null, "reason": "..."}}],
  "should_fix": [{{"summary": "...", "path": "path/or/null", "line": null, "reason": "..."}}],
  "nits": [{{"summary": "...", "path": "path/or/null", "line": null, "reason": "..."}}],
  "notes": "short optional review note"
}}

Set verdict to `not_ready` if blockers or should_fix is non-empty; otherwise set it to `ready`.
"""


def build_dispatch_command(
    prompt: str,
    *,
    model: str,
    effort: str,
    name: str,
    bundle: pathlib.Path,
) -> list[str]:
    # Keep the positional prompt before every variadic option. Claude Code's
    # --add-dir/--tools/--allowedTools options can otherwise consume the prompt
    # and create an idle background job.
    return [
        "claude",
        "--safe-mode",
        "--no-chrome",
        "--model",
        model,
        "--effort",
        effort,
        "--permission-mode",
        "dontAsk",
        "--name",
        name,
        "--bg",
        prompt,
        "--add-dir",
        str(bundle),
        "--tools",
        READ_ONLY_TOOLS,
        "--allowedTools",
        READ_ONLY_TOOLS,
    ]


def recover_background_id(
    session_name: str,
    *,
    cwd: str,
    wait_seconds: float = 3.0,
) -> str | None:
    """Recover a just-created background id if CLI stdout formatting changes."""
    jobs_dir = config_dir() / "jobs"
    deadline = time.monotonic() + wait_seconds
    wanted_cwd = str(pathlib.Path(cwd).resolve())
    while True:
        matches: list[tuple[str, str]] = []
        if jobs_dir.is_dir():
            for path in jobs_dir.glob("*/state.json"):
                try:
                    data = json.loads(path.read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError):
                    continue
                if data.get("name") != session_name or data.get("cwd") != wanted_cwd:
                    continue
                matches.append((str(data.get("createdAt") or ""), path.parent.name.lower()))
        if matches:
            matches.sort(reverse=True)
            candidate = matches[0][1]
            if re.fullmatch(r"[0-9a-f]{8}", candidate):
                return candidate
        if time.monotonic() >= deadline:
            return None
        time.sleep(0.1)


def dispatch_review(
    *,
    cwd: str,
    expected_head: str,
    expected_base_tip: str,
    base_ref: str,
    model: str,
    effort: str,
    name: str | None,
    extra_context: str | None,
) -> dict[str, Any]:
    version = claude_version()
    if version < MIN_BACKGROUND_VERSION:
        raise ClaudeReviewError(
            "Claude Code background agents require >= "
            + ".".join(map(str, MIN_BACKGROUND_VERSION))
            + f"; found {'.'.join(map(str, version))}"
        )

    head = verify_head(cwd, expected_head)
    base_tip_sha = verify_base_tip(cwd, base_ref, expected_base_tip)
    merge_base_sha = git_merge_base(cwd, base_tip_sha, head)
    require_clean_worktree(cwd)
    name_prefix = sanitize_session_prefix(name or f"pr-review-{head[:8]}")
    session_name = f"{name_prefix}-{uuid.uuid4().hex[:8]}"
    bundle = create_review_bundle(
        cwd=cwd,
        session_name=session_name,
        head=head,
        base_ref=base_ref,
        base_tip_sha=base_tip_sha,
        merge_base_sha=merge_base_sha,
    )
    prompt = review_prompt(
        head,
        base_ref,
        base_tip_sha,
        merge_base_sha,
        bundle,
        extra_context,
    )
    command = build_dispatch_command(
        prompt,
        model=model,
        effort=effort,
        name=session_name,
        bundle=bundle,
    )
    dispatch_env = os.environ.copy()
    # Defense in depth with --safe-mode. Failed sessions are redispatched fresh
    # rather than respawned so the isolation contract is reapplied explicitly.
    dispatch_env["CLAUDE_CODE_SAFE_MODE"] = "1"
    try:
        result = run_command(command, cwd=cwd, env=dispatch_env)
    except Exception:
        cleanup_review_bundle(session_name)
        raise
    if result.returncode != 0:
        cleanup_review_bundle(session_name)
        detail = result.stderr.strip() or result.stdout.strip() or "unknown Claude Code error"
        raise ClaudeReviewError(f"Claude background dispatch failed: {detail}")

    match = BACKGROUND_ID_RE.search(result.stdout)
    short_id = match.group(1).lower() if match else None
    if short_id is None:
        short_id = recover_background_id(session_name, cwd=cwd)
    if short_id is None:
        raise ClaudeReviewError(
            "Claude background dispatch succeeded but its session id could not be recovered; "
            f"look for session name {session_name!r} with `claude agents`"
        )
    return {
        "complete": True,
        "state": "dispatched",
        "background_id": short_id,
        "reviewed_sha": head,
        "base_tip_sha": base_tip_sha,
        "merge_base_sha": merge_base_sha,
        "model": model,
        "effort": effort,
        "claude_version": ".".join(map(str, version)),
        "session_name": session_name,
    }


def state_path(background_id: str) -> pathlib.Path:
    if not re.fullmatch(r"[0-9a-fA-F]{8}", background_id):
        raise ClaudeReviewError("background id must be exactly 8 hexadecimal characters")
    return config_dir() / "jobs" / background_id.lower() / "state.json"


def read_state(
    background_id: str,
    *,
    retries: int = 3,
    retry_delay: float = 0.05,
) -> dict[str, Any]:
    path = state_path(background_id)
    last_error: Exception | None = None
    data: Any = None
    for attempt in range(retries + 1):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            break
        except (OSError, json.JSONDecodeError) as exc:
            last_error = exc
            if attempt >= retries:
                raise ClaudeReviewError(f"could not read Claude background state: {path}") from exc
            time.sleep(retry_delay)
    if last_error is not None and data is None:
        raise ClaudeReviewError(f"could not read Claude background state: {path}") from last_error
    if not isinstance(data, dict):
        raise ClaudeReviewError("Claude background state was not a JSON object")
    return data


def transcript_candidates(state: dict[str, Any]) -> list[pathlib.Path]:
    candidates: list[pathlib.Path] = []
    root = config_dir().resolve()
    transcript = state.get("linkScanPath")
    if isinstance(transcript, str) and transcript:
        path = pathlib.Path(transcript).expanduser().resolve()
        if path == root or root in path.parents:
            candidates.append(path)

    session_id = state.get("sessionId")
    if isinstance(session_id, str) and session_id:
        candidates.extend((root / "projects").glob(f"*/{session_id}.jsonl"))

    unique: list[pathlib.Path] = []
    seen: set[pathlib.Path] = set()
    for path in candidates:
        if path not in seen:
            seen.add(path)
            unique.append(path)
    return unique


def final_assistant_text(state: dict[str, Any]) -> str | None:
    """Return the literal final assistant response from the persisted transcript."""
    for path in transcript_candidates(state):
        if not path.is_file():
            continue
        messages: list[str] = []
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except OSError:
            continue
        for line in lines:
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(event, dict) or event.get("type") != "assistant":
                continue
            message = event.get("message")
            content = message.get("content") if isinstance(message, dict) else None
            if not isinstance(content, list):
                continue
            blocks = [
                part.get("text", "")
                for part in content
                if isinstance(part, dict) and part.get("type") == "text"
            ]
            text = "\n".join(block for block in blocks if block).strip()
            if text:
                messages.append(text)
        if messages:
            return messages[-1]

    # Fall back for Claude versions that preserve the literal response here.
    output = state.get("output")
    raw_result = output.get("result") if isinstance(output, dict) else None
    return raw_result if isinstance(raw_result, str) and raw_result.strip() else None


def parse_review_result(
    raw: Any,
    expected_head: str | None,
    expected_base_tip: str | None,
    expected_merge_base: str | None,
) -> dict[str, Any]:
    if not isinstance(raw, str) or not raw.strip():
        raise ClaudeReviewError("completed Claude review had no text result")
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if (
            len(lines) >= 3
            and lines[0].strip().lower() in {"```", "```json"}
            and lines[-1].strip() == "```"
        ):
            text = "\n".join(lines[1:-1]).strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ClaudeReviewError("Claude review result was not valid JSON") from exc
    if not isinstance(data, dict):
        raise ClaudeReviewError("Claude review result must be a JSON object")

    required = {
        "reviewed_sha",
        "base_tip_sha",
        "merge_base_sha",
        "verdict",
        "blockers",
        "should_fix",
        "nits",
    }
    missing = sorted(required - data.keys())
    if missing:
        raise ClaudeReviewError(f"Claude review result missing fields: {', '.join(missing)}")
    if data.get("verdict") not in {"ready", "not_ready"}:
        raise ClaudeReviewError("Claude review verdict must be ready or not_ready")
    for field in ("blockers", "should_fix", "nits"):
        if not isinstance(data.get(field), list):
            raise ClaudeReviewError(f"Claude review field {field} must be a list")

    sha_fields = {
        "reviewed_sha": (expected_head, "--expect-head"),
        "base_tip_sha": (expected_base_tip, "--expect-base-tip"),
        "merge_base_sha": (expected_merge_base, "--expect-merge-base"),
    }
    for field, (expected_value, flag) in sha_fields.items():
        actual = data.get(field)
        if not isinstance(actual, str) or not re.fullmatch(r"[0-9a-fA-F]{40}", actual):
            raise ClaudeReviewError(f"Claude review {field} must be a full 40-character SHA")
        if expected_value is not None:
            expected = normalize_expected_sha(expected_value, flag)
            if not actual.lower().startswith(expected):
                raise ClaudeReviewError(
                    f"Claude review {field} does not match expected {expected}: {actual}"
                )

    has_actionable = bool(data["blockers"] or data["should_fix"])
    if has_actionable and data["verdict"] != "not_ready":
        raise ClaudeReviewError("Claude result has actionable findings but verdict is ready")
    if not has_actionable and data["verdict"] != "ready":
        raise ClaudeReviewError("Claude result has no actionable findings but verdict is not_ready")
    return data


def evaluate_state(
    background_id: str,
    expected_head: str | None,
    expected_base_tip: str | None,
    expected_merge_base: str | None,
) -> tuple[dict[str, Any], int]:
    state = read_state(background_id)
    raw_state = str(state.get("state") or "").lower()
    base = {
        "complete": True,
        "background_id": background_id.lower(),
        "state": raw_state or "unknown",
        "detail": state.get("detail"),
        "session_id": state.get("sessionId"),
        "claude_version": state.get("cliVersion"),
    }

    if raw_state == "done":
        raw_result = final_assistant_text(state)
        try:
            review = parse_review_result(
                raw_result,
                expected_head,
                expected_base_tip,
                expected_merge_base,
            )
        except ClaudeReviewError as exc:
            cleanup_review_bundle(state.get("name"))
            return {**base, "state": "invalid_result", "error": str(exc), "raw_result": raw_result}, 2
        cleanup_review_bundle(state.get("name"))
        return {**base, "state": "done", "review": review}, 0

    if raw_state in TERMINAL_FAILURE_STATES:
        cleanup_review_bundle(state.get("name"))
        return {**base, "error": state.get("detail") or f"Claude session ended as {raw_state}"}, 1
    if raw_state in RUNNING_STATES:
        return base, 3

    # Unknown/blocked/needs-input states require human/driver attention rather
    # than being polled indefinitely. Keep the bundle until the driver stops or
    # resumes the session so the reviewer does not lose its exact diff context.
    return {**base, "state": raw_state or "attention_required"}, 4


def poll_review(
    background_id: str,
    *,
    expected_head: str | None,
    expected_base_tip: str | None,
    expected_merge_base: str | None,
    wait_seconds: int,
    interval_seconds: int,
) -> tuple[dict[str, Any], int]:
    deadline = time.monotonic() + wait_seconds
    while True:
        result, code = evaluate_state(
            background_id,
            expected_head,
            expected_base_tip,
            expected_merge_base,
        )
        if code != 3:
            return result, code
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return {**result, "state": "still_running", "wait_seconds": wait_seconds}, 3
        time.sleep(min(interval_seconds, remaining))


def stop_review(background_id: str) -> dict[str, Any]:
    state = read_state(background_id)
    if str(state.get("state") or "").lower() == "done":
        cleanup_review_bundle(state.get("name"))
        return {"complete": True, "state": "already_done", "background_id": background_id.lower()}
    stopped = run_command(["claude", "stop", background_id])
    if stopped.returncode != 0:
        detail = stopped.stderr.strip() or stopped.stdout.strip() or "unknown Claude Code error"
        raise ClaudeReviewError(f"claude stop failed: {detail}")
    cleanup_review_bundle(state.get("name"))
    return {"complete": True, "state": "stopped", "background_id": background_id.lower()}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    start = subparsers.add_parser("start", help="dispatch a read-only background PR review")
    start.add_argument("--cwd", default=".", help="PR worktree path (default: current directory)")
    start.add_argument("--expect-head", required=True, help="exact reviewed/pushed head SHA")
    start.add_argument("--expect-base-tip", required=True, help="current GitHub base-branch tip SHA")
    start.add_argument("--base-ref", default="origin/main", help="base ref for the PR diff")
    start.add_argument("--model", default="opus", help="Claude model alias/name (default: opus)")
    start.add_argument(
        "--effort",
        default="high",
        choices=("low", "medium", "high", "xhigh", "max"),
        help="Claude effort level (default: high)",
    )
    start.add_argument("--name", help="background session display name")
    start.add_argument("--context", help="additional task-specific review context")

    poll = subparsers.add_parser("poll", help="poll a background review state for a bounded window")
    poll.add_argument("--id", required=True, help="8-character Claude background session id")
    poll.add_argument("--expect-head", required=True, help="exact reviewed head SHA")
    poll.add_argument("--expect-base-tip", required=True, help="exact live base-tip SHA used by the review")
    poll.add_argument("--expect-merge-base", required=True, help="exact merge-base SHA used by the review")
    poll.add_argument("--wait-seconds", type=int, default=60, help="bounded wait window (default: 60, max: 150)")
    poll.add_argument("--interval-seconds", type=int, default=5, help="poll interval (default: 5)")

    stop = subparsers.add_parser("stop", help="stop a non-terminal background review session")
    stop.add_argument("--id", required=True, help="8-character Claude background session id")

    parser.add_argument("--compact", action="store_true", help="emit compact JSON")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.command == "start":
            result = dispatch_review(
                cwd=args.cwd,
                expected_head=args.expect_head,
                expected_base_tip=args.expect_base_tip,
                base_ref=args.base_ref,
                model=args.model,
                effort=args.effort,
                name=args.name,
                extra_context=args.context,
            )
            code = 0
        elif args.command == "poll":
            if not 0 <= args.wait_seconds <= 150:
                raise ClaudeReviewError("--wait-seconds must be 0-150")
            if not 1 <= args.interval_seconds <= 60:
                raise ClaudeReviewError("--interval-seconds must be 1-60")
            result, code = poll_review(
                args.id,
                expected_head=args.expect_head,
                expected_base_tip=args.expect_base_tip,
                expected_merge_base=args.expect_merge_base,
                wait_seconds=args.wait_seconds,
                interval_seconds=args.interval_seconds,
            )
        else:
            result = stop_review(args.id)
            code = 0
    except ClaudeReviewError as exc:
        result = {"complete": False, "state": "error", "error": str(exc)}
        code = 2

    json.dump(result, sys.stdout, indent=None if args.compact else 2, sort_keys=True)
    sys.stdout.write("\n")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
