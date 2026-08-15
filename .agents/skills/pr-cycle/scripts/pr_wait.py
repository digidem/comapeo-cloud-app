#!/usr/bin/env python3
"""Bounded polling for a pull request's CI/check rollup.

Designed for execution surfaces with hard per-command timeouts. The script never
mutates GitHub or git state. It waits only for the requested bounded window and
returns JSON describing whether checks are terminal, failing, unknown, or still
pending. Skipped/neutral checks remain visible for caller adjudication.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from typing import Any

import pr_snapshot


def evaluate_pr(pr: dict[str, Any], expected_head: str | None) -> tuple[dict[str, Any], int]:
    actual_head = pr.get("headRefOid")
    if not isinstance(actual_head, str) or not actual_head:
        raise pr_snapshot.SnapshotError("pull request head SHA was missing")
    if not pr_snapshot.head_matches(expected_head, actual_head):
        raise pr_snapshot.SnapshotError(
            f"pull request head does not match expected {expected_head}: found {actual_head}"
        )

    checks = pr_snapshot.classify_checks(pr.get("statusCheckRollup"))
    result = {
        "complete": True,
        "head_sha": actual_head,
        "checks": checks,
    }

    if checks["failing"]:
        return {**result, "state": "failing"}, 1
    if checks["unknown"]:
        return {**result, "state": "unknown"}, 2
    if checks["pending"]:
        return {**result, "state": "pending"}, 3
    if checks["terminal_green"]:
        return {**result, "state": "terminal_green"}, 0
    return {**result, "state": "terminal_requires_adjudication"}, 4


def read_expected_base_tip(
    repo: str,
    pr: dict[str, Any],
    expected_base_tip: str | None,
    observed_base_branch: str | None,
) -> tuple[str | None, str | None]:
    if expected_base_tip is None:
        return None, observed_base_branch

    base_branch = pr.get("baseRefName")
    if not isinstance(base_branch, str) or not base_branch:
        raise pr_snapshot.SnapshotError("pull request base branch was missing")
    if observed_base_branch is None:
        observed_base_branch = base_branch
    elif base_branch != observed_base_branch:
        raise pr_snapshot.SnapshotError(
            "pull request base branch changed during wait: "
            f"{observed_base_branch} -> {base_branch}"
        )

    base_tip = pr_snapshot.fetch_branch_tip(repo, base_branch)
    if not pr_snapshot.sha_matches(expected_base_tip, base_tip):
        raise pr_snapshot.SnapshotError(
            "base branch tip does not match expected "
            f"{expected_base_tip}: found {base_tip}"
        )
    return base_tip, observed_base_branch


def wait_for_checks(
    repo: str,
    pr_number: int,
    expected_head: str | None,
    wait_seconds: int,
    interval_seconds: int,
    *,
    expected_base_tip: str | None = None,
) -> tuple[dict[str, Any], int]:
    deadline = time.monotonic() + wait_seconds
    observed_base_branch: str | None = None

    while True:
        pr = pr_snapshot.fetch_pr(repo, pr_number)
        result, code = evaluate_pr(pr, expected_head)
        base_tip, observed_base_branch = read_expected_base_tip(
            repo,
            pr,
            expected_base_tip,
            observed_base_branch,
        )
        if base_tip is not None:
            result["base_tip_sha"] = base_tip

        if code != 3:
            # A terminal result gets a second read before returning so we do not
            # report success/failure from a mixed-time head/base snapshot. The
            # final merge gate still uses pr_snapshot.py for the stronger full
            # GitHub/thread-aware verification.
            pr_after = pr_snapshot.fetch_pr(repo, pr_number)
            head_before = pr.get("headRefOid")
            head_after = pr_after.get("headRefOid")
            if head_after != head_before:
                raise pr_snapshot.SnapshotError(
                    "pull request head changed during terminal verification: "
                    f"{head_before} -> {head_after}"
                )

            result_after, code_after = evaluate_pr(pr_after, expected_head)
            base_tip_after, observed_base_branch = read_expected_base_tip(
                repo,
                pr_after,
                expected_base_tip,
                observed_base_branch,
            )
            if base_tip is not None and base_tip_after != base_tip:
                raise pr_snapshot.SnapshotError(
                    "base branch tip changed during terminal verification: "
                    f"{base_tip} -> {base_tip_after}"
                )
            if base_tip_after is not None:
                result_after["base_tip_sha"] = base_tip_after

            result, code = result_after, code_after
            if code != 3:
                return result, code

        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return {**result, "state": "still_pending", "wait_seconds": wait_seconds}, 3

        time.sleep(min(interval_seconds, remaining))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", help="GitHub repository as OWNER/REPO")
    parser.add_argument("--pr", type=int, required=True, help="Pull request number")
    parser.add_argument(
        "--expect-head",
        help="Fail unless the PR head SHA equals this reviewed/pushed SHA",
    )
    parser.add_argument(
        "--expect-base-tip",
        help="Fail unless the live target-branch tip equals this reviewed base SHA",
    )
    parser.add_argument(
        "--wait-seconds",
        type=int,
        default=120,
        help="Maximum bounded wait window (default: 120, max: 150)",
    )
    parser.add_argument(
        "--interval-seconds",
        type=int,
        default=15,
        help="Polling interval (default: 15)",
    )
    parser.add_argument("--compact", action="store_true", help="Emit compact JSON")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not 0 <= args.wait_seconds <= 150:
        print(json.dumps({"complete": False, "error": "--wait-seconds must be 0-150"}))
        return 2
    if not 1 <= args.interval_seconds <= 60:
        print(json.dumps({"complete": False, "error": "--interval-seconds must be 1-60"}))
        return 2

    try:
        repo = pr_snapshot.resolve_repo(args.repo)
        expected_head = pr_snapshot.normalize_expected_head(args.expect_head)
        expected_base_tip = pr_snapshot.normalize_expected_base_tip(args.expect_base_tip)
        result, code = wait_for_checks(
            repo,
            args.pr,
            expected_head,
            args.wait_seconds,
            args.interval_seconds,
            expected_base_tip=expected_base_tip,
        )
    except pr_snapshot.SnapshotError as exc:
        result = {"complete": False, "state": "error", "error": str(exc)}
        code = 2

    json.dump(result, sys.stdout, indent=None if args.compact else 2, sort_keys=True)
    sys.stdout.write("\n")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
