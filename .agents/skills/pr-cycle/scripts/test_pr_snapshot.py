#!/usr/bin/env python3
"""Focused unit tests for the PR snapshot safety gates."""

from __future__ import annotations

import importlib.util
import pathlib
import unittest
from unittest import mock


MODULE_PATH = pathlib.Path(__file__).with_name("pr_snapshot.py")
SPEC = importlib.util.spec_from_file_location("pr_snapshot", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
pr_snapshot = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pr_snapshot)

HEAD_A = "a" * 40
HEAD_B = "b" * 40
BASE_A = "c" * 40
BASE_B = "d" * 40


def check_run(name: str, conclusion: str = "SUCCESS") -> dict[str, str]:
    return {
        "__typename": "CheckRun",
        "name": name,
        "status": "COMPLETED",
        "conclusion": conclusion,
    }


def pr_payload(
    head: str,
    checks: list[dict[str, str]],
    review_decision: str = "",
    base_branch: str = "main",
) -> dict[str, object]:
    return {
        "number": 203,
        "url": "https://github.com/example/repo/pull/203",
        "state": "OPEN",
        "isDraft": False,
        "headRefName": "feature/pr-cycle",
        "headRefOid": head,
        "baseRefName": base_branch,
        "mergeable": "MERGEABLE",
        "mergeStateStatus": "CLEAN",
        "reviewDecision": review_decision,
        "statusCheckRollup": checks,
        "reviews": [],
        "comments": [],
    }


class CheckClassificationTests(unittest.TestCase):
    def test_zero_checks_is_not_green(self) -> None:
        result = pr_snapshot.classify_checks([])
        self.assertFalse(result["terminal_green"])

    def test_successful_check_is_green(self) -> None:
        result = pr_snapshot.classify_checks([check_run("lint")])
        self.assertTrue(result["terminal_green"])

    def test_skipped_neutral_need_adjudication(self) -> None:
        skipped = pr_snapshot.classify_checks([check_run("deploy", "SKIPPED")])
        neutral = pr_snapshot.classify_checks([check_run("advisory", "NEUTRAL")])
        self.assertFalse(skipped["terminal_green"])
        self.assertFalse(neutral["terminal_green"])
        self.assertEqual(skipped["skipped"], ["deploy"])
        self.assertEqual(neutral["neutral"], ["advisory"])


class ReviewThreadTests(unittest.TestCase):
    def test_unresolved_surfaces_latest_comment(self) -> None:
        threads = [
            {
                "id": "thread-1",
                "isResolved": False,
                "isOutdated": False,
                "path": "src/example.ts",
                "line": 7,
                "comments": {
                    "totalCount": 2,
                    "nodes": [
                        {
                            "author": {"login": "reviewer"},
                            "body": "Initial context",
                            "url": "https://example/1",
                        },
                        {
                            "author": {"login": "reviewer"},
                            "body": "Please also cover the retry path",
                            "url": "https://example/2",
                        },
                    ],
                },
            }
        ]
        result = pr_snapshot.compact_threads(threads)
        self.assertEqual(result["unresolved_count"], 1)
        self.assertEqual(result["unresolved"][0]["comment_count"], 2)
        self.assertEqual(result["unresolved"][0]["body"], "Please also cover the retry path")
        self.assertEqual(result["unresolved"][0]["url"], "https://example/2")


class BranchTipTests(unittest.TestCase):
    def test_branch_path_is_encoded(self) -> None:
        with mock.patch.object(
            pr_snapshot,
            "run_gh_json",
            return_value={"object": {"sha": BASE_A}},
        ) as run_gh_json:
            result = pr_snapshot.fetch_branch_tip("example/repo", "release/foo")
        self.assertEqual(result, BASE_A)
        self.assertEqual(
            run_gh_json.call_args.args[0],
            ["api", "repos/example/repo/git/ref/heads/release%2Ffoo"],
        )


class ExactRevisionTests(unittest.TestCase):
    def test_head_mismatch_stops_before_threads(self) -> None:
        with (
            mock.patch.object(
                pr_snapshot,
                "fetch_pr",
                return_value=pr_payload(HEAD_B, [check_run("lint")]),
            ),
            mock.patch.object(pr_snapshot, "fetch_review_threads") as fetch_threads,
            mock.patch.object(pr_snapshot, "fetch_branch_tip") as fetch_base,
        ):
            with self.assertRaises(pr_snapshot.SnapshotError):
                pr_snapshot.build_snapshot("example/repo", 203, HEAD_A, BASE_A)
            fetch_threads.assert_not_called()
            fetch_base.assert_not_called()

    def test_head_move_fails_closed(self) -> None:
        with (
            mock.patch.object(
                pr_snapshot,
                "fetch_pr",
                side_effect=[
                    pr_payload(HEAD_A, [check_run("lint")]),
                    pr_payload(HEAD_B, [check_run("lint")]),
                ],
            ),
            mock.patch.object(pr_snapshot, "fetch_branch_tip", return_value=BASE_A),
            mock.patch.object(pr_snapshot, "fetch_review_threads", return_value=[]),
        ):
            with self.assertRaises(pr_snapshot.SnapshotError):
                pr_snapshot.build_snapshot("example/repo", 203, HEAD_A, BASE_A)

    def test_base_mismatch_stops_before_threads(self) -> None:
        payload = pr_payload(HEAD_A, [check_run("lint")])
        with (
            mock.patch.object(pr_snapshot, "fetch_pr", return_value=payload),
            mock.patch.object(pr_snapshot, "fetch_branch_tip", return_value=BASE_B),
            mock.patch.object(pr_snapshot, "fetch_review_threads") as fetch_threads,
        ):
            with self.assertRaises(pr_snapshot.SnapshotError):
                pr_snapshot.build_snapshot("example/repo", 203, HEAD_A, BASE_A)
            fetch_threads.assert_not_called()

    def test_base_move_fails_closed(self) -> None:
        payload = pr_payload(HEAD_A, [check_run("lint")])
        with (
            mock.patch.object(pr_snapshot, "fetch_pr", side_effect=[payload, payload]),
            mock.patch.object(
                pr_snapshot,
                "fetch_branch_tip",
                side_effect=[BASE_A, BASE_B],
            ),
            mock.patch.object(pr_snapshot, "fetch_review_threads", return_value=[]),
        ):
            with self.assertRaises(pr_snapshot.SnapshotError):
                pr_snapshot.build_snapshot("example/repo", 203, HEAD_A, BASE_A)

    def test_base_name_move_fails_closed(self) -> None:
        with (
            mock.patch.object(
                pr_snapshot,
                "fetch_pr",
                side_effect=[
                    pr_payload(HEAD_A, [check_run("lint")], base_branch="main"),
                    pr_payload(HEAD_A, [check_run("lint")], base_branch="next"),
                ],
            ),
            mock.patch.object(pr_snapshot, "fetch_branch_tip", return_value=BASE_A),
            mock.patch.object(pr_snapshot, "fetch_review_threads", return_value=[]),
        ):
            with self.assertRaises(pr_snapshot.SnapshotError):
                pr_snapshot.build_snapshot("example/repo", 203, HEAD_A, BASE_A)

    def test_no_checks_cannot_open_gate(self) -> None:
        payload = pr_payload(HEAD_A, [])
        with (
            mock.patch.object(pr_snapshot, "fetch_pr", side_effect=[payload, payload]),
            mock.patch.object(
                pr_snapshot,
                "fetch_branch_tip",
                side_effect=[BASE_A, BASE_A],
            ),
            mock.patch.object(pr_snapshot, "fetch_review_threads", return_value=[]),
        ):
            result = pr_snapshot.build_snapshot("example/repo", 203, HEAD_A, BASE_A)
        self.assertFalse(result["basic_merge_gate"])
        self.assertEqual(result["pull_request"]["base_tip_sha"], BASE_A)

    def test_short_uppercase_shas_are_accepted(self) -> None:
        payload = pr_payload(HEAD_A, [check_run("lint")])
        with (
            mock.patch.object(pr_snapshot, "fetch_pr", side_effect=[payload, payload]),
            mock.patch.object(
                pr_snapshot,
                "fetch_branch_tip",
                side_effect=[BASE_A, BASE_A],
            ),
            mock.patch.object(pr_snapshot, "fetch_review_threads", return_value=[]),
        ):
            result = pr_snapshot.build_snapshot(
                "example/repo",
                203,
                HEAD_A[:7].upper(),
                BASE_A[:7].upper(),
            )
        self.assertEqual(result["pull_request"]["head_sha"], HEAD_A)
        self.assertEqual(result["pull_request"]["base_tip_sha"], BASE_A)

    def test_changes_requested_blocks_gate(self) -> None:
        payload = pr_payload(
            HEAD_A,
            [check_run("lint")],
            review_decision="CHANGES_REQUESTED",
        )
        with (
            mock.patch.object(pr_snapshot, "fetch_pr", side_effect=[payload, payload]),
            mock.patch.object(
                pr_snapshot,
                "fetch_branch_tip",
                side_effect=[BASE_A, BASE_A],
            ),
            mock.patch.object(pr_snapshot, "fetch_review_threads", return_value=[]),
        ):
            result = pr_snapshot.build_snapshot("example/repo", 203, HEAD_A, BASE_A)
        self.assertFalse(result["basic_merge_gate"])


if __name__ == "__main__":
    unittest.main()
