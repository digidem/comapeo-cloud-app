#!/usr/bin/env python3
"""Focused unit tests for bounded PR check polling."""

from __future__ import annotations

import importlib.util
import pathlib
import sys
import unittest


SCRIPT_DIR = pathlib.Path(__file__).parent
SNAPSHOT_PATH = SCRIPT_DIR / "pr_snapshot.py"
SNAPSHOT_SPEC = importlib.util.spec_from_file_location("pr_snapshot", SNAPSHOT_PATH)
assert SNAPSHOT_SPEC is not None and SNAPSHOT_SPEC.loader is not None
pr_snapshot = importlib.util.module_from_spec(SNAPSHOT_SPEC)
SNAPSHOT_SPEC.loader.exec_module(pr_snapshot)
sys.modules["pr_snapshot"] = pr_snapshot

WAIT_PATH = SCRIPT_DIR / "pr_wait.py"
WAIT_SPEC = importlib.util.spec_from_file_location("pr_wait", WAIT_PATH)
assert WAIT_SPEC is not None and WAIT_SPEC.loader is not None
pr_wait = importlib.util.module_from_spec(WAIT_SPEC)
WAIT_SPEC.loader.exec_module(pr_wait)

HEAD_A = "a" * 40
HEAD_B = "b" * 40


def check_run(
    name: str,
    *,
    status: str = "COMPLETED",
    conclusion: str = "SUCCESS",
) -> dict[str, str]:
    return {
        "__typename": "CheckRun",
        "name": name,
        "status": status,
        "conclusion": conclusion,
    }


def pr_payload(head: str, checks: list[dict[str, str]]) -> dict[str, object]:
    return {
        "headRefOid": head,
        "statusCheckRollup": checks,
    }


class EvaluatePrTests(unittest.TestCase):
    def test_pending_checks_return_retry_code(self) -> None:
        result, code = pr_wait.evaluate_pr(
            pr_payload(
                HEAD_A,
                [check_run("unit-tests", status="IN_PROGRESS", conclusion="")],
            ),
            HEAD_A,
        )
        self.assertEqual(code, 3)
        self.assertEqual(result["state"], "pending")
        self.assertEqual(result["checks"]["pending"], ["unit-tests"])

    def test_failure_returns_failure_code(self) -> None:
        result, code = pr_wait.evaluate_pr(
            pr_payload(HEAD_A, [check_run("lint", conclusion="FAILURE")]),
            HEAD_A,
        )
        self.assertEqual(code, 1)
        self.assertEqual(result["state"], "failing")
        self.assertEqual(result["checks"]["failing"], ["lint"])

    def test_skips_need_adjudication(self) -> None:
        result, code = pr_wait.evaluate_pr(
            pr_payload(
                HEAD_A,
                [
                    check_run("unit-tests"),
                    check_run("deploy", conclusion="SKIPPED"),
                ],
            ),
            HEAD_A,
        )
        self.assertEqual(code, 4)
        self.assertEqual(result["state"], "terminal_requires_adjudication")
        self.assertEqual(result["checks"]["skipped"], ["deploy"])
        self.assertFalse(result["checks"]["terminal_green"])

    def test_head_movement_fails_closed(self) -> None:
        with self.assertRaises(pr_snapshot.SnapshotError):
            pr_wait.evaluate_pr(pr_payload(HEAD_B, [check_run("lint")]), HEAD_A)

    def test_unknown_check_returns_error_code(self) -> None:
        result, code = pr_wait.evaluate_pr(
            pr_payload(
                HEAD_A,
                [
                    {
                        "__typename": "CheckRun",
                        "name": "mystery",
                        "status": "COMPLETED",
                        "conclusion": "SOMETHING_NEW",
                    }
                ],
            ),
            HEAD_A,
        )
        self.assertEqual(code, 2)
        self.assertEqual(result["state"], "unknown")


if __name__ == "__main__":
    unittest.main()
