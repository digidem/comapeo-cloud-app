#!/usr/bin/env python3
"""Focused tests for timeout-safe Claude Code PR review orchestration."""

from __future__ import annotations

import contextlib
import importlib.util
import json
import os
import pathlib
import subprocess
import tempfile
import unittest
from unittest import mock


MODULE_PATH = pathlib.Path(__file__).with_name("claude_review.py")
SPEC = importlib.util.spec_from_file_location("claude_review", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
claude_review = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(claude_review)

HEAD_A = "a" * 40
HEAD_B = "b" * 40
BASE_A = "c" * 40
BASE_B = "d" * 40
MERGE_A = "e" * 40
MERGE_B = "f" * 40


def valid_review(
    *,
    head: str = HEAD_A,
    base: str = BASE_A,
    merge: str = MERGE_A,
    verdict: str = "ready",
    blockers=None,
    should_fix=None,
):
    return {
        "reviewed_sha": head,
        "base_tip_sha": base,
        "merge_base_sha": merge,
        "verdict": verdict,
        "blockers": [] if blockers is None else blockers,
        "should_fix": [] if should_fix is None else should_fix,
        "nits": [],
        "notes": "review complete",
    }


class VersionTests(unittest.TestCase):
    def test_version_accepts_current(self) -> None:
        self.assertEqual(claude_review.parse_version("2.1.226 (Claude Code)"), (2, 1, 226))

    def test_version_rejects_bad_text(self) -> None:
        with self.assertRaises(claude_review.ClaudeReviewError):
            claude_review.parse_version("Claude Code unknown")


class ParserTests(unittest.TestCase):
    def test_compact_before_subcommand(self) -> None:
        args = claude_review.build_parser().parse_args(
            ["--compact", "stop", "--id", "deadbeef"]
        )
        self.assertTrue(args.compact)

    def test_compact_after_subcommand(self) -> None:
        args = claude_review.build_parser().parse_args(
            ["stop", "--id", "deadbeef", "--compact"]
        )
        self.assertTrue(args.compact)


class GitGuardTests(unittest.TestCase):
    def test_base_mismatch_fails(self) -> None:
        with mock.patch.object(claude_review, "git_oid", return_value=BASE_B):
            with self.assertRaises(claude_review.ClaudeReviewError):
                claude_review.verify_base_tip(".", "origin/main", BASE_A)

    def test_dirty_worktree_fails(self) -> None:
        completed = subprocess.CompletedProcess(
            args=["git"], returncode=0, stdout=" M changed.py\n", stderr=""
        )
        with mock.patch.object(claude_review, "run_command", return_value=completed):
            with self.assertRaises(claude_review.ClaudeReviewError):
                claude_review.require_clean_worktree(".")

    def test_clean_worktree_passes(self) -> None:
        completed = subprocess.CompletedProcess(args=["git"], returncode=0, stdout="", stderr="")
        with mock.patch.object(claude_review, "run_command", return_value=completed):
            claude_review.require_clean_worktree(".")

    def test_merge_base_is_validated(self) -> None:
        completed = subprocess.CompletedProcess(
            args=["git"], returncode=0, stdout=MERGE_A + "\n", stderr=""
        )
        with mock.patch.object(claude_review, "run_command", return_value=completed) as run_command:
            result = claude_review.git_merge_base(".", BASE_A, HEAD_A)
        self.assertEqual(result, MERGE_A)
        run_command.assert_called_once_with(["git", "merge-base", BASE_A, HEAD_A], cwd=".")


class BundleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.env = mock.patch.dict(os.environ, {"CLAUDE_CONFIG_DIR": self.tempdir.name})
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_session_prefix_is_sanitized(self) -> None:
        self.assertEqual(claude_review.sanitize_session_prefix("PR #215 / Opus"), "PR-215-Opus")

    def test_unsafe_bundle_name_fails(self) -> None:
        with self.assertRaises(claude_review.ClaudeReviewError):
            claude_review.bundle_dir_for_name("../escape")

    def test_bundle_has_exact_metadata(self) -> None:
        def fake_write(_cwd: str, _args: list[str], path: pathlib.Path) -> None:
            path.write_text("bundle data\n", encoding="utf-8")

        with mock.patch.object(claude_review, "write_git_output", side_effect=fake_write) as writer:
            bundle = claude_review.create_review_bundle(
                cwd=".",
                session_name="review-deadbeef",
                head=HEAD_A,
                base_ref="refs/remotes/origin/main",
                base_tip_sha=BASE_A,
                merge_base_sha=MERGE_A,
            )
        metadata = json.loads((bundle / "metadata.json").read_text(encoding="utf-8"))
        self.assertEqual(metadata["head_sha"], HEAD_A)
        self.assertEqual(metadata["base_tip_sha"], BASE_A)
        self.assertEqual(metadata["merge_base_sha"], MERGE_A)
        self.assertEqual(writer.call_count, 2)
        first_args = writer.call_args_list[0].args[1]
        self.assertIn(f"{BASE_A}...{HEAD_A}", first_args)
        claude_review.cleanup_review_bundle("review-deadbeef")
        self.assertFalse(bundle.exists())


class DispatchCommandTests(unittest.TestCase):
    def test_command_has_no_bash(self) -> None:
        prompt = "review me"
        bundle = pathlib.Path("/tmp/review-bundle")
        command = claude_review.build_dispatch_command(
            prompt,
            model="opus",
            effort="high",
            name="pr-review-a",
            bundle=bundle,
        )
        self.assertIn("--safe-mode", command)
        self.assertNotIn("--bare", command)
        self.assertIn("--bg", command)
        self.assertIn("--no-chrome", command)
        self.assertIn("dontAsk", command)
        self.assertNotIn("plan", command)
        self.assertLess(command.index(prompt), command.index("--add-dir"))
        self.assertLess(command.index(prompt), command.index("--tools"))
        self.assertEqual(command[command.index("--tools") + 1], "Read,Grep,Glob")
        self.assertEqual(command[command.index("--allowedTools") + 1], "Read,Grep,Glob")
        self.assertNotIn("Bash", command)
        self.assertEqual(command[command.index("--add-dir") + 1], str(bundle))

    def test_prompt_binds_revisions(self) -> None:
        bundle = pathlib.Path("/tmp/review-bundle")
        prompt = claude_review.review_prompt(
            HEAD_A,
            "refs/remotes/origin/main",
            BASE_A,
            MERGE_A,
            bundle,
            "issue context",
        )
        self.assertIn(HEAD_A, prompt)
        self.assertIn(BASE_A, prompt)
        self.assertIn(MERGE_A, prompt)
        self.assertIn(str(bundle / "diff.patch"), prompt)
        self.assertIn("Read, Grep, and Glob", prompt)
        self.assertIn("Do not invoke ultrareview", prompt)
        self.assertIn('"base_tip_sha"', prompt)
        self.assertIn('"merge_base_sha"', prompt)

    def test_head_mismatch_stops(self) -> None:
        with (
            mock.patch.object(claude_review, "claude_version", return_value=(2, 1, 226)),
            mock.patch.object(claude_review, "git_head", return_value=HEAD_B),
            mock.patch.object(claude_review, "run_command") as run_command,
        ):
            with self.assertRaises(claude_review.ClaudeReviewError):
                claude_review.dispatch_review(
                    cwd=".",
                    expected_head=HEAD_A,
                    expected_base_tip=BASE_A,
                    base_ref="origin/main",
                    model="opus",
                    effort="high",
                    name=None,
                    extra_context=None,
                )
            run_command.assert_not_called()

    def test_old_claude_is_rejected(self) -> None:
        with mock.patch.object(claude_review, "claude_version", return_value=(2, 1, 138)):
            with self.assertRaises(claude_review.ClaudeReviewError):
                claude_review.dispatch_review(
                    cwd=".",
                    expected_head=HEAD_A,
                    expected_base_tip=BASE_A,
                    base_ref="origin/main",
                    model="opus",
                    effort="high",
                    name=None,
                    extra_context=None,
                )

    def dispatch_stack(
        self, completed: subprocess.CompletedProcess[str]
    ) -> tuple[contextlib.ExitStack, mock.Mock]:
        stack = contextlib.ExitStack()
        stack.enter_context(
            mock.patch.object(claude_review, "claude_version", return_value=(2, 1, 226))
        )
        stack.enter_context(mock.patch.object(claude_review, "verify_head", return_value=HEAD_A))
        stack.enter_context(
            mock.patch.object(claude_review, "verify_base_tip", return_value=BASE_A)
        )
        stack.enter_context(
            mock.patch.object(claude_review, "git_merge_base", return_value=MERGE_A)
        )
        stack.enter_context(mock.patch.object(claude_review, "require_clean_worktree"))
        stack.enter_context(
            mock.patch.object(
                claude_review,
                "create_review_bundle",
                return_value=pathlib.Path("/tmp/review-bundle"),
            )
        )
        run_command = stack.enter_context(
            mock.patch.object(claude_review, "run_command", return_value=completed)
        )
        return stack, run_command

    def test_dispatch_sets_safe_env(self) -> None:
        completed = subprocess.CompletedProcess(
            args=["claude"],
            returncode=0,
            stdout="backgrounded · deadbeef · pr-review\n",
            stderr="",
        )
        fake_uuid = mock.Mock(hex="1234567890abcdef")
        stack, run_command = self.dispatch_stack(completed)
        with stack, mock.patch.object(
            claude_review.uuid, "uuid4", return_value=fake_uuid
        ):
            result = claude_review.dispatch_review(
                cwd=".",
                expected_head=HEAD_A,
                expected_base_tip=BASE_A,
                base_ref="origin/main",
                model="opus",
                effort="high",
                name="review",
                extra_context=None,
            )
        self.assertEqual(result["background_id"], "deadbeef")
        self.assertEqual(result["base_tip_sha"], BASE_A)
        self.assertEqual(result["merge_base_sha"], MERGE_A)
        self.assertEqual(result["session_name"], "review-12345678")
        self.assertEqual(run_command.call_args.kwargs["env"]["CLAUDE_CODE_SAFE_MODE"], "1")

    def test_dispatch_recovers_id(self) -> None:
        completed = subprocess.CompletedProcess(
            args=["claude"], returncode=0, stdout="started in background\n", stderr=""
        )
        stack, _ = self.dispatch_stack(completed)
        with stack, mock.patch.object(
            claude_review, "recover_background_id", return_value="cafebabe"
        ) as recover:
            result = claude_review.dispatch_review(
                cwd=".",
                expected_head=HEAD_A,
                expected_base_tip=BASE_A,
                base_ref="origin/main",
                model="opus",
                effort="high",
                name="review",
                extra_context=None,
            )
        self.assertEqual(result["background_id"], "cafebabe")
        recover.assert_called_once()

    def test_dispatch_failure_cleans_bundle(self) -> None:
        completed = subprocess.CompletedProcess(
            args=["claude"], returncode=1, stdout="", stderr="bad dispatch"
        )
        stack, _ = self.dispatch_stack(completed)
        with stack, mock.patch.object(
            claude_review, "cleanup_review_bundle"
        ) as cleanup:
            with self.assertRaises(claude_review.ClaudeReviewError):
                claude_review.dispatch_review(
                    cwd=".",
                    expected_head=HEAD_A,
                    expected_base_tip=BASE_A,
                    base_ref="origin/main",
                    model="opus",
                    effort="high",
                    name="review",
                    extra_context=None,
                )
        cleanup.assert_called_once()


class ResultTests(unittest.TestCase):
    def parse(self, payload: dict):
        return claude_review.parse_review_result(
            json.dumps(payload), HEAD_A, BASE_A, MERGE_A
        )

    def test_ready_result_matches_all_shas(self) -> None:
        result = self.parse(valid_review())
        self.assertEqual(result["verdict"], "ready")

    def test_wrong_head_fails(self) -> None:
        with self.assertRaises(claude_review.ClaudeReviewError):
            self.parse(valid_review(head=HEAD_B))

    def test_wrong_base_fails(self) -> None:
        with self.assertRaises(claude_review.ClaudeReviewError):
            self.parse(valid_review(base=BASE_B))

    def test_wrong_merge_base_fails(self) -> None:
        with self.assertRaises(claude_review.ClaudeReviewError):
            self.parse(valid_review(merge=MERGE_B))

    def test_findings_cannot_claim_ready(self) -> None:
        payload = valid_review(blockers=[{"summary": "bug"}])
        with self.assertRaises(claude_review.ClaudeReviewError):
            self.parse(payload)

    def test_should_fix_needs_not_ready(self) -> None:
        payload = valid_review(
            verdict="not_ready",
            should_fix=[{"summary": "gap", "path": "x", "line": None, "reason": "r"}],
        )
        parsed = self.parse(payload)
        self.assertEqual(parsed["verdict"], "not_ready")

    def test_fenced_json_is_tolerated(self) -> None:
        raw = "```json\n" + json.dumps(valid_review()) + "\n```"
        parsed = claude_review.parse_review_result(raw, HEAD_A, BASE_A, MERGE_A)
        self.assertEqual(parsed["reviewed_sha"], HEAD_A)


class StateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.env = mock.patch.dict(os.environ, {"CLAUDE_CONFIG_DIR": self.tempdir.name})
        self.env.start()
        self.addCleanup(self.env.stop)

    def write_state(self, background_id: str, payload: dict) -> pathlib.Path:
        path = pathlib.Path(self.tempdir.name) / "jobs" / background_id / "state.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload), encoding="utf-8")
        return path

    def write_transcript(self, text: str, *, session_id: str = "session-full") -> pathlib.Path:
        path = pathlib.Path(self.tempdir.name) / "projects" / "repo" / f"{session_id}.jsonl"
        path.parent.mkdir(parents=True, exist_ok=True)
        event = {"type": "assistant", "message": {"content": [{"type": "text", "text": text}]}}
        path.write_text(json.dumps(event) + "\n", encoding="utf-8")
        return path

    def test_config_dir_uses_override(self) -> None:
        self.assertEqual(claude_review.config_dir(), pathlib.Path(self.tempdir.name))

    def test_bad_background_id_fails(self) -> None:
        with self.assertRaises(claude_review.ClaudeReviewError):
            claude_review.state_path("not-an-id")

    def test_recovery_finds_named_job(self) -> None:
        cwd = pathlib.Path(self.tempdir.name) / "repo"
        cwd.mkdir()
        self.write_state(
            "deadbeef",
            {
                "name": "review-unique",
                "cwd": str(cwd.resolve()),
                "createdAt": "2026-08-10T00:00:00Z",
            },
        )
        found = claude_review.recover_background_id(
            "review-unique", cwd=str(cwd), wait_seconds=0
        )
        self.assertEqual(found, "deadbeef")

    def test_working_state_retries(self) -> None:
        self.write_state("deadbeef", {"state": "working", "detail": "reviewing"})
        result, code = claude_review.evaluate_state(
            "deadbeef", HEAD_A, BASE_A, MERGE_A
        )
        self.assertEqual(code, 3)
        self.assertEqual(result["state"], "working")

    def test_queued_state_retries(self) -> None:
        self.write_state("deadbeef", {"state": "queued", "detail": "waiting"})
        result, code = claude_review.evaluate_state(
            "deadbeef", HEAD_A, BASE_A, MERGE_A
        )
        self.assertEqual(code, 3)
        self.assertEqual(result["state"], "queued")

    def test_done_uses_linked_transcript(self) -> None:
        transcript = self.write_transcript(json.dumps(valid_review()))
        self.write_state(
            "deadbeef",
            {
                "state": "done",
                "name": "review-deadbeef",
                "sessionId": "session-full",
                "cliVersion": "2.1.226",
                "linkScanPath": str(transcript),
                "output": {"result": "supervisor summary"},
            },
        )
        result, code = claude_review.evaluate_state(
            "deadbeef", HEAD_A, BASE_A, MERGE_A
        )
        self.assertEqual(code, 0)
        self.assertEqual(result["review"]["verdict"], "ready")

    def test_transcript_uses_session_fallback(self) -> None:
        self.write_transcript(json.dumps(valid_review()), session_id="fallback-full")
        self.write_state(
            "deadbeef",
            {
                "state": "done",
                "sessionId": "fallback-full",
                "output": {"result": "supervisor summary"},
            },
        )
        result, code = claude_review.evaluate_state(
            "deadbeef", HEAD_A, BASE_A, MERGE_A
        )
        self.assertEqual(code, 0)
        self.assertEqual(result["review"]["reviewed_sha"], HEAD_A)

    def test_invalid_result_fails_closed(self) -> None:
        self.write_state(
            "deadbeef",
            {"state": "done", "output": {"result": "looks good"}},
        )
        result, code = claude_review.evaluate_state(
            "deadbeef", HEAD_A, BASE_A, MERGE_A
        )
        self.assertEqual(code, 2)
        self.assertEqual(result["state"], "invalid_result")

    def test_needs_input_requires_attention(self) -> None:
        self.write_state("deadbeef", {"state": "needs_input", "detail": "question"})
        result, code = claude_review.evaluate_state(
            "deadbeef", HEAD_A, BASE_A, MERGE_A
        )
        self.assertEqual(code, 4)
        self.assertEqual(result["state"], "needs_input")

    def test_poll_returns_still_running(self) -> None:
        with (
            mock.patch.object(
                claude_review,
                "evaluate_state",
                return_value=({"state": "working"}, 3),
            ),
            mock.patch.object(claude_review.time, "monotonic", return_value=10.0),
        ):
            result, code = claude_review.poll_review(
                "deadbeef",
                expected_head=HEAD_A,
                expected_base_tip=BASE_A,
                expected_merge_base=MERGE_A,
                wait_seconds=0,
                interval_seconds=1,
            )
        self.assertEqual(code, 3)
        self.assertEqual(result["state"], "still_running")

    def test_stop_done_skips_command(self) -> None:
        self.write_state("deadbeef", {"state": "done", "name": "review-deadbeef"})
        with (
            mock.patch.object(claude_review, "run_command") as run_command,
            mock.patch.object(claude_review, "cleanup_review_bundle") as cleanup,
        ):
            result = claude_review.stop_review("deadbeef")
        self.assertEqual(result["state"], "already_done")
        run_command.assert_not_called()
        cleanup.assert_called_once_with("review-deadbeef")

    def test_stop_uses_safe_command(self) -> None:
        self.write_state("deadbeef", {"state": "blocked", "name": "review-deadbeef"})
        completed = subprocess.CompletedProcess(
            args=["claude"], returncode=0, stdout="", stderr=""
        )
        with (
            mock.patch.object(claude_review, "run_command", return_value=completed) as run_command,
            mock.patch.object(claude_review, "cleanup_review_bundle") as cleanup,
        ):
            result = claude_review.stop_review("deadbeef")
        self.assertEqual(result["state"], "stopped")
        run_command.assert_called_once_with(["claude", "stop", "deadbeef"])
        cleanup.assert_called_once_with("review-deadbeef")


if __name__ == "__main__":
    unittest.main()
