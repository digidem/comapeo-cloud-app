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


def wait_for_checks(
    repo: str,
    pr_number: int,
    expected_head: str | None,
    wait_seconds: int,
    interval_seconds: int,
) -> tuple[dict[str, Any], int]:
    deadline = time.monotonic() + wait_seconds

    while True:
        pr = pr_snapshot.fetch_pr(repo, pr_number)
        result, code = evaluate_pr(pr, expected_head)
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
        result, code = wait_for_checks(
            repo,
            args.pr,
            expected_head,
            args.wait_seconds,
            args.interval_seconds,
        )
    except pr_snapshot.SnapshotError as exc:
        result = {"complete": False, "state": "error", "error": str(exc)}
        code = 2

    json.dump(result, sys.stdout, indent=None if args.compact else 2, sort_keys=True)
    sys.stdout.write("\n")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
