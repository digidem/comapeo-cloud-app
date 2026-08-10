#!/usr/bin/env python3
"""Read-only, fail-closed GitHub pull-request readiness snapshot.

Requires an authenticated `gh` CLI. The script never mutates GitHub or git state.
It prints JSON and exits non-zero if required GitHub state cannot be read fully.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from typing import Any


PASSING_CHECK_CONCLUSIONS = {"SUCCESS"}
FAILING_CHECK_CONCLUSIONS = {
    "ACTION_REQUIRED",
    "CANCELLED",
    "FAILURE",
    "STALE",
    "STARTUP_FAILURE",
    "TIMED_OUT",
}
PASSING_STATUS_STATES = {"SUCCESS"}
FAILING_STATUS_STATES = {"ERROR", "FAILURE"}


class SnapshotError(RuntimeError):
    pass


def run_gh(args: list[str]) -> str:
    try:
        result = subprocess.run(
            ["gh", *args],
            check=False,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as exc:
        raise SnapshotError("gh CLI is not installed or not on PATH") from exc

    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "unknown gh error"
        raise SnapshotError(f"gh {' '.join(args)} failed: {detail}")
    return result.stdout


def run_gh_json(args: list[str]) -> Any:
    raw = run_gh(args)
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise SnapshotError(f"gh returned invalid JSON for {' '.join(args)}") from exc


def resolve_repo(repo: str | None) -> str:
    if repo:
        parts = repo.split("/")
        if len(parts) != 2 or not all(parts):
            raise SnapshotError("--repo must be exactly OWNER/REPO")
        return repo
    data = run_gh_json(["repo", "view", "--json", "nameWithOwner"])
    value = data.get("nameWithOwner")
    if not isinstance(value, str) or "/" not in value:
        raise SnapshotError("could not resolve repository name")
    return value


def fetch_pr(repo: str, pr: int) -> dict[str, Any]:
    fields = (
        "number,url,state,isDraft,headRefName,headRefOid,baseRefName,mergeable,"
        "mergeStateStatus,reviewDecision,statusCheckRollup,reviews,comments"
    )
    data = run_gh_json(
        ["pr", "view", str(pr), "--repo", repo, "--json", fields]
    )
    if not isinstance(data, dict):
        raise SnapshotError("pull request response was not an object")
    return data


def fetch_review_threads(repo: str, pr: int) -> list[dict[str, Any]]:
    owner, name = repo.split("/", 1)
    query = """
query($owner:String!,$name:String!,$number:Int!,$cursor:String){
  repository(owner:$owner,name:$name){
    pullRequest(number:$number){
      reviewThreads(first:100,after:$cursor){
        pageInfo{hasNextPage endCursor}
        nodes{
          id
          isResolved
          isOutdated
          path
          line
          comments(last:100){
            totalCount
            nodes{
              author{login}
              body
              url
              createdAt
            }
          }
        }
      }
    }
  }
}
""".strip()

    threads: list[dict[str, Any]] = []
    cursor: str | None = None
    seen_cursors: set[str] = set()
    page_count = 0

    while True:
        page_count += 1
        if page_count > 100:
            raise SnapshotError("review-thread pagination exceeded 100 pages")

        args = [
            "api",
            "graphql",
            "-f",
            f"owner={owner}",
            "-f",
            f"name={name}",
            "-F",
            f"number={pr}",
            "-f",
            f"query={query}",
        ]
        if cursor:
            args.extend(["-f", f"cursor={cursor}"])

        data = run_gh_json(args)
        try:
            connection = data["data"]["repository"]["pullRequest"]["reviewThreads"]
        except (KeyError, TypeError) as exc:
            raise SnapshotError("review-thread GraphQL response was incomplete") from exc

        nodes = connection.get("nodes")
        page_info = connection.get("pageInfo")
        if not isinstance(nodes, list) or not isinstance(page_info, dict):
            raise SnapshotError("review-thread GraphQL pagination data was incomplete")

        for node in nodes:
            if not isinstance(node, dict):
                raise SnapshotError("review-thread response contained a malformed thread")
            comments = node.get("comments")
            if not isinstance(comments, dict):
                raise SnapshotError("review-thread comments response was incomplete")
            comment_nodes = comments.get("nodes")
            comment_total = comments.get("totalCount")
            if not isinstance(comment_nodes, list) or not isinstance(comment_total, int):
                raise SnapshotError("review-thread comments pagination data was incomplete")
            if comment_total > len(comment_nodes):
                raise SnapshotError(
                    "a review thread has more than 100 comments; inspect it manually"
                )
            threads.append(node)
        if not page_info.get("hasNextPage"):
            break
        next_cursor = page_info.get("endCursor")
        if not isinstance(next_cursor, str) or not next_cursor:
            raise SnapshotError("review-thread pagination cursor was missing")
        if next_cursor in seen_cursors:
            raise SnapshotError("review-thread pagination cursor repeated")
        seen_cursors.add(next_cursor)
        cursor = next_cursor

    return threads


def classify_checks(rollup: Any) -> dict[str, Any]:
    if not isinstance(rollup, list):
        raise SnapshotError("statusCheckRollup was not a list")

    passing: list[str] = []
    skipped: list[str] = []
    neutral: list[str] = []
    failing: list[str] = []
    pending: list[str] = []
    unknown: list[str] = []

    for item in rollup:
        if not isinstance(item, dict):
            unknown.append("<malformed check>")
            continue

        typename = item.get("__typename")
        name = item.get("name") or item.get("context") or "<unnamed>"

        if typename == "CheckRun":
            status = str(item.get("status") or "").upper()
            conclusion = str(item.get("conclusion") or "").upper()
            if status != "COMPLETED":
                pending.append(name)
            elif conclusion == "SKIPPED":
                skipped.append(name)
            elif conclusion == "NEUTRAL":
                neutral.append(name)
            elif conclusion in PASSING_CHECK_CONCLUSIONS:
                passing.append(name)
            elif conclusion in FAILING_CHECK_CONCLUSIONS:
                failing.append(name)
            else:
                unknown.append(f"{name} ({conclusion or 'no conclusion'})")
        elif typename == "StatusContext":
            state = str(item.get("state") or "").upper()
            if state in PASSING_STATUS_STATES:
                passing.append(name)
            elif state in FAILING_STATUS_STATES:
                failing.append(name)
            elif state in {"EXPECTED", "PENDING"}:
                pending.append(name)
            else:
                unknown.append(f"{name} ({state or 'no state'})")
        else:
            unknown.append(f"{name} ({typename or 'unknown type'})")

    return {
        "total": len(rollup),
        "passing": passing,
        "skipped": skipped,
        "neutral": neutral,
        "failing": failing,
        "pending": pending,
        "unknown": unknown,
        # Deliberately conservative: no checks, skipped checks, and neutral checks
        # all require caller adjudication rather than becoming a green signal.
        "terminal_green": bool(rollup)
        and not failing
        and not pending
        and not skipped
        and not neutral
        and not unknown,
    }


def compact_threads(threads: list[dict[str, Any]]) -> dict[str, Any]:
    unresolved: list[dict[str, Any]] = []
    resolved = 0
    outdated_unresolved = 0

    for thread in threads:
        if thread.get("isResolved"):
            resolved += 1
            continue

        comments_connection = thread.get("comments", {})
        comments = (
            comments_connection.get("nodes", [])
            if isinstance(comments_connection, dict)
            else []
        )
        latest = comments[-1] if isinstance(comments, list) and comments else {}
        body = latest.get("body") if isinstance(latest, dict) else None
        if isinstance(body, str) and len(body) > 240:
            body = body[:237] + "..."

        entry = {
            "id": thread.get("id"),
            "path": thread.get("path"),
            "line": thread.get("line"),
            "outdated": bool(thread.get("isOutdated")),
            "comment_count": (
                comments_connection.get("totalCount")
                if isinstance(comments_connection, dict)
                else None
            ),
            "author": (
                latest.get("author", {}).get("login")
                if isinstance(latest, dict) and isinstance(latest.get("author"), dict)
                else None
            ),
            "url": latest.get("url") if isinstance(latest, dict) else None,
            "body": body,
        }
        unresolved.append(entry)
        if entry["outdated"]:
            outdated_unresolved += 1

    return {
        "total": len(threads),
        "resolved": resolved,
        "unresolved": unresolved,
        "unresolved_count": len(unresolved),
        "outdated_unresolved_count": outdated_unresolved,
    }


def normalize_expected_head(expected_head: str | None) -> str | None:
    if expected_head is None:
        return None
    normalized = expected_head.strip().lower()
    if not 7 <= len(normalized) <= 40 or any(
        char not in "0123456789abcdef" for char in normalized
    ):
        raise SnapshotError("--expect-head must be a 7-40 character hexadecimal SHA")
    return normalized


def head_matches(expected_head: str | None, actual_head: str) -> bool:
    return expected_head is None or actual_head.lower().startswith(expected_head)


def build_snapshot(
    repo: str, pr_number: int, expected_head: str | None = None
) -> dict[str, Any]:
    expected_head = normalize_expected_head(expected_head)
    pr_before = fetch_pr(repo, pr_number)
    head_before = pr_before.get("headRefOid")
    if not isinstance(head_before, str) or not head_before:
        raise SnapshotError("pull request head SHA was missing")
    if not head_matches(expected_head, head_before):
        raise SnapshotError(
            f"pull request head does not match expected {expected_head}: found {head_before}"
        )

    threads = fetch_review_threads(repo, pr_number)
    pr = fetch_pr(repo, pr_number)
    head_after = pr.get("headRefOid")
    if head_after != head_before:
        raise SnapshotError(
            f"pull request head changed during snapshot: {head_before} -> {head_after}"
        )
    if not isinstance(head_after, str) or not head_matches(expected_head, head_after):
        raise SnapshotError(
            f"pull request head does not match expected {expected_head}: found {head_after}"
        )

    review_decision = pr.get("reviewDecision")
    if not isinstance(review_decision, str):
        raise SnapshotError("pull request reviewDecision was missing or invalid")

    checks = classify_checks(pr.get("statusCheckRollup"))
    review_threads = compact_threads(threads)

    basic_merge_gate = (
        pr.get("state") == "OPEN"
        and pr.get("isDraft") is False
        and pr.get("mergeable") == "MERGEABLE"
        and pr.get("mergeStateStatus") == "CLEAN"
        and review_decision in {"", "APPROVED"}
        and checks["terminal_green"]
    )

    return {
        "complete": True,
        "repository": repo,
        "pull_request": {
            "number": pr.get("number"),
            "url": pr.get("url"),
            "state": pr.get("state"),
            "is_draft": pr.get("isDraft"),
            "base_branch": pr.get("baseRefName"),
            "head_branch": pr.get("headRefName"),
            "head_sha": pr.get("headRefOid"),
            "mergeable": pr.get("mergeable"),
            "merge_state_status": pr.get("mergeStateStatus"),
            "review_decision": pr.get("reviewDecision"),
            "review_count": len(pr.get("reviews") or []),
            "comment_count": len(pr.get("comments") or []),
        },
        "checks": checks,
        "review_threads": review_threads,
        "basic_merge_gate": basic_merge_gate,
        "merge_ready": False,
        "merge_ready_note": (
            "This helper cannot decide whether unresolved threads are actionable or whether "
            "an independent reviewer has approved the exact head. Apply the SKILL.md gate."
        ),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", help="GitHub repository as OWNER/REPO")
    parser.add_argument("--pr", type=int, required=True, help="Pull request number")
    parser.add_argument(
        "--expect-head",
        help="Fail unless the PR head SHA equals this exact reviewed/pushed SHA",
    )
    parser.add_argument("--compact", action="store_true", help="Emit compact JSON")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        repo = resolve_repo(args.repo)
        snapshot = build_snapshot(repo, args.pr, args.expect_head)
    except SnapshotError as exc:
        error = {"complete": False, "error": str(exc), "merge_ready": False}
        json.dump(error, sys.stdout, indent=None if args.compact else 2, sort_keys=True)
        sys.stdout.write("\n")
        return 2

    json.dump(snapshot, sys.stdout, indent=None if args.compact else 2, sort_keys=True)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
