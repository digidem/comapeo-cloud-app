#!/usr/bin/env python3
"""Focused unit tests for bounded PR check polling."""

from __future__ import annotations

import importlib.util
import pathlib
import sys
import unittest
from unittest import mock


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
BASE_A = "c" * 40
BASE_B = "d" * 40


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


def pr_payload(
    head: str,
    checks: list[dict[str, str]],
    *,
    base_branch: str | None = "main",
) -> dict[str, object]:
    return {
        "headRefOid": head,
        "baseRefName": base_branch,
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


class WaitForChecksBaseTipTests(unittest.TestCase):
    @mock.patch.object(pr_snapshot, "fetch_branch_tip", return_value=BASE_B)
    @mock.patch.object(pr_snapshot, "fetch_pr")
    def test_initial_live_base_mismatch_fails_closed(
        self,
        fetch_pr: mock.Mock,
        _fetch_branch_tip: mock.Mock,
    ) -> None:
        fetch_pr.return_value = pr_payload(
            HEAD_A, [check_run("unit-tests", status="IN_PROGRESS", conclusion="")]
        )

        with self.assertRaises(pr_snapshot.SnapshotError):
            pr_wait.wait_for_checks(
                "owner/repo",
                42,
                HEAD_A,
                wait_seconds=0,
                interval_seconds=1,
                expected_base_tip=BASE_A,
            )

    @mock.patch.object(pr_wait.time, "sleep")
    @mock.patch.object(pr_wait.time, "monotonic", side_effect=[0, 0])
    @mock.patch.object(pr_snapshot, "fetch_branch_tip", side_effect=[BASE_A, BASE_B])
    @mock.patch.object(pr_snapshot, "fetch_pr")
    def test_base_change_between_pending_polls_fails_at_first_observed_mismatch(
        self,
        fetch_pr: mock.Mock,
        fetch_branch_tip: mock.Mock,
        _monotonic: mock.Mock,
        _sleep: mock.Mock,
    ) -> None:
        fetch_pr.return_value = pr_payload(
            HEAD_A, [check_run("unit-tests", status="IN_PROGRESS", conclusion="")]
        )

        with self.assertRaises(pr_snapshot.SnapshotError):
            pr_wait.wait_for_checks(
                "owner/repo",
                42,
                HEAD_A,
                wait_seconds=5,
                interval_seconds=1,
                expected_base_tip=BASE_A,
            )

        self.assertEqual(fetch_pr.call_count, 2)
        self.assertEqual(fetch_branch_tip.call_count, 2)

    @mock.patch.object(pr_snapshot, "fetch_branch_tip", return_value=BASE_A)
    @mock.patch.object(pr_snapshot, "fetch_pr")
    def test_stable_head_and_base_pending_is_retryable_and_reports_base_tip_sha(
        self,
        fetch_pr: mock.Mock,
        _fetch_branch_tip: mock.Mock,
    ) -> None:
        fetch_pr.return_value = pr_payload(
            HEAD_A, [check_run("unit-tests", status="IN_PROGRESS", conclusion="")]
        )

        result, code = pr_wait.wait_for_checks(
            "owner/repo",
            42,
            HEAD_A,
            wait_seconds=0,
            interval_seconds=1,
            expected_base_tip=BASE_A,
        )

        self.assertEqual(code, 3)
        self.assertEqual(result["state"], "still_pending")
        self.assertEqual(result["head_sha"], HEAD_A)
        self.assertEqual(result["base_tip_sha"], BASE_A)

    @mock.patch.object(pr_snapshot, "fetch_branch_tip", return_value=BASE_A)
    @mock.patch.object(pr_snapshot, "fetch_pr")
    def test_stable_head_and_base_terminal_green_reports_both_shas(
        self,
        fetch_pr: mock.Mock,
        _fetch_branch_tip: mock.Mock,
    ) -> None:
        fetch_pr.return_value = pr_payload(HEAD_A, [check_run("unit-tests")])

        result, code = pr_wait.wait_for_checks(
            "owner/repo",
            42,
            HEAD_A,
            wait_seconds=0,
            interval_seconds=1,
            expected_base_tip=BASE_A,
        )

        self.assertEqual(code, 0)
        self.assertEqual(result["state"], "terminal_green")
        self.assertEqual(result["head_sha"], HEAD_A)
        self.assertEqual(result["base_tip_sha"], BASE_A)

    @mock.patch.object(pr_snapshot, "fetch_branch_tip", side_effect=[BASE_A, BASE_B])
    @mock.patch.object(pr_snapshot, "fetch_pr")
    def test_terminal_base_tip_change_during_verification_fails_closed(
        self,
        fetch_pr: mock.Mock,
        fetch_branch_tip: mock.Mock,
    ) -> None:
        fetch_pr.return_value = pr_payload(HEAD_A, [check_run("unit-tests")])

        with self.assertRaises(pr_snapshot.SnapshotError):
            pr_wait.wait_for_checks(
                "owner/repo",
                42,
                HEAD_A,
                wait_seconds=0,
                interval_seconds=1,
                expected_base_tip=BASE_A,
            )

        self.assertEqual(fetch_branch_tip.call_count, 2)

    @mock.patch.object(pr_snapshot, "fetch_branch_tip", return_value=BASE_A)
    @mock.patch.object(
        pr_snapshot,
        "fetch_pr",
        side_effect=[
            pr_payload(HEAD_A, [check_run("unit-tests")]),
            pr_payload(HEAD_B, [check_run("unit-tests")]),
        ],
    )
    def test_terminal_head_change_during_verification_fails_closed(
        self,
        _fetch_pr: mock.Mock,
        _fetch_branch_tip: mock.Mock,
    ) -> None:
        with self.assertRaises(pr_snapshot.SnapshotError):
            pr_wait.wait_for_checks(
                "owner/repo",
                42,
                HEAD_A,
                wait_seconds=0,
                interval_seconds=1,
                expected_base_tip=BASE_A,
            )

    @mock.patch.object(pr_wait.time, "sleep")
    @mock.patch.object(pr_wait.time, "monotonic", side_effect=[0, 0])
    @mock.patch.object(pr_snapshot, "fetch_branch_tip", return_value=BASE_A)
    @mock.patch.object(
        pr_snapshot,
        "fetch_pr",
        side_effect=[
            pr_payload(
                HEAD_A,
                [check_run("unit-tests", status="IN_PROGRESS", conclusion="")],
                base_branch="main",
            ),
            pr_payload(
                HEAD_A,
                [check_run("unit-tests", status="IN_PROGRESS", conclusion="")],
                base_branch="next",
            ),
        ],
    )
    def test_base_branch_change_between_polls_fails_closed(
        self,
        _fetch_pr: mock.Mock,
        fetch_branch_tip: mock.Mock,
        _monotonic: mock.Mock,
        _sleep: mock.Mock,
    ) -> None:
        with self.assertRaises(pr_snapshot.SnapshotError):
            pr_wait.wait_for_checks(
                "owner/repo",
                42,
                HEAD_A,
                wait_seconds=5,
                interval_seconds=1,
                expected_base_tip=BASE_A,
            )

        self.assertEqual(fetch_branch_tip.call_count, 1)

    @mock.patch.object(pr_snapshot, "fetch_branch_tip")
    @mock.patch.object(pr_snapshot, "fetch_pr")
    def test_missing_base_ref_name_fails_closed_when_base_tip_is_expected(
        self,
        fetch_pr: mock.Mock,
        fetch_branch_tip: mock.Mock,
    ) -> None:
        fetch_pr.return_value = pr_payload(
            HEAD_A,
            [check_run("unit-tests", status="IN_PROGRESS", conclusion="")],
            base_branch=None,
        )

        with self.assertRaises(pr_snapshot.SnapshotError):
            pr_wait.wait_for_checks(
                "owner/repo",
                42,
                HEAD_A,
                wait_seconds=0,
                interval_seconds=1,
                expected_base_tip=BASE_A,
            )

        fetch_branch_tip.assert_not_called()

    @mock.patch.object(pr_snapshot, "fetch_pr")
    def test_legacy_positional_call_without_base_tip_remains_supported(
        self,
        fetch_pr: mock.Mock,
    ) -> None:
        fetch_pr.return_value = pr_payload(HEAD_A, [check_run("unit-tests")])

        result, code = pr_wait.wait_for_checks("owner/repo", 42, HEAD_A, 0, 1)

        self.assertEqual(code, 0)
        self.assertEqual(result["state"], "terminal_green")
        self.assertNotIn("base_tip_sha", result)


if __name__ == "__main__":
    unittest.main()
