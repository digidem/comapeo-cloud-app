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


def check_run(name: str, conclusion: str = "SUCCESS") -> dict[str, str]:
    return {
        "__typename": "CheckRun",
        "name": name,
        "status": "COMPLETED",
        "conclusion": conclusion,
    }


def pr_payload(head: str, checks: list[dict[str, str]]) -> dict[str, object]:
    return {
        "number": 203,
        "url": "https://github.com/example/repo/pull/203",
        "state": "OPEN",
        "isDraft": False,
        "headRefName": "feature/pr-cycle",
        "headRefOid": head,
        "baseRefName": "main",
        "mergeable": "MERGEABLE",
        "mergeStateStatus": "CLEAN",
        "reviewDecision": "",
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

    def test_skipped_and_neutral_require_adjudication(self) -> None:
        skipped = pr_snapshot.classify_checks([check_run("deploy", "SKIPPED")])
        neutral = pr_snapshot.classify_checks([check_run("advisory", "NEUTRAL")])
        self.assertFalse(skipped["terminal_green"])
        self.assertFalse(neutral["terminal_green"])
        self.assertEqual(skipped["skipped"], ["deploy"])
        self.assertEqual(neutral["neutral"], ["advisory"])


class ReviewThreadTests(unittest.TestCase):
    def test_unresolved_thread_surfaces_latest_comment(self) -> None:
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


class ExactHeadTests(unittest.TestCase):
    def test_expected_head_mismatch_fails_before_thread_read(self) -> None:
        with (
            mock.patch.object(
                pr_snapshot,
                "fetch_pr",
                return_value=pr_payload("new-head", [check_run("lint")]),
            ),
            mock.patch.object(pr_snapshot, "fetch_review_threads") as fetch_threads,
        ):
            with self.assertRaises(pr_snapshot.SnapshotError):
                pr_snapshot.build_snapshot("example/repo", 203, "reviewed-head")
            fetch_threads.assert_not_called()

    def test_head_change_during_snapshot_fails_closed(self) -> None:
        with (
            mock.patch.object(
                pr_snapshot,
                "fetch_pr",
                side_effect=[
                    pr_payload("head-a", [check_run("lint")]),
                    pr_payload("head-b", [check_run("lint")]),
                ],
            ),
            mock.patch.object(pr_snapshot, "fetch_review_threads", return_value=[]),
        ):
            with self.assertRaises(pr_snapshot.SnapshotError):
                pr_snapshot.build_snapshot("example/repo", 203, "head-a")

    def test_no_checks_cannot_open_basic_merge_gate(self) -> None:
        payload = pr_payload("head-a", [])
        with (
            mock.patch.object(pr_snapshot, "fetch_pr", side_effect=[payload, payload]),
            mock.patch.object(pr_snapshot, "fetch_review_threads", return_value=[]),
        ):
            result = pr_snapshot.build_snapshot("example/repo", 203, "head-a")
        self.assertFalse(result["basic_merge_gate"])


if __name__ == "__main__":
    unittest.main()
