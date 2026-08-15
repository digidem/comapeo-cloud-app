#!/usr/bin/env python3
from pathlib import Path
import unittest

SKILL_DIR = Path(__file__).resolve().parents[1]
SKILL = SKILL_DIR / "SKILL.md"
AGENTS = SKILL_DIR.parents[2] / "AGENTS.md"
CI = SKILL_DIR.parents[2] / ".github" / "workflows" / "ci.yml"


def assert_policy_contract(
    test: unittest.TestCase, *, skill_text: str, agents_text: str, ci_text: str
) -> None:
    test.assertIn("verify the claim against the exact current head", skill_text)
    test.assertIn("false positive, stale, duplicate, or already satisfied", skill_text)
    test.assertIn("reply with precise evidence", skill_text)

    test.assertIn("do not push solely to address optional nits", skill_text)
    test.assertIn("explicitly asks for those nits", skill_text)

    test.assertIn("exact isolated worktree and local branch captured at cycle start", skill_text)
    test.assertIn("similarly named issue/feature worktrees or branches as unrelated", skill_text)

    test.assertIn("## Issue and PR Scope Continuity", agents_text)
    test.assertIn("search the existing GitHub backlog", agents_text)
    test.assertIn("reuse the canonical implementation, data model, or integration path", agents_text)
    test.assertIn("Do not promote proposed or unmerged follow-up designs", agents_text)

    test.assertIn(
        "python3 .agents/skills/pr-cycle/scripts/test_pr_cycle_policy.py", ci_text
    )


class PrCyclePolicyTests(unittest.TestCase):
    def test_policy_contract(self) -> None:
        assert_policy_contract(
            self,
            skill_text=SKILL.read_text(),
            agents_text=AGENTS.read_text(),
            ci_text=CI.read_text(),
        )

    def test_optional_nit_churn_guard_is_required(self) -> None:
        skill_text = SKILL.read_text().replace(
            "do not push solely to address optional nits",
            "push freely to address optional nits",
        )
        with self.assertRaises(AssertionError):
            assert_policy_contract(
                self,
                skill_text=skill_text,
                agents_text=AGENTS.read_text(),
                ci_text=CI.read_text(),
            )

    def test_cleanup_identity_guard_is_required(self) -> None:
        skill_text = SKILL.read_text().replace(
            "similarly named issue/feature worktrees or branches as unrelated",
            "similarly named issue/feature worktrees or branches as equivalent",
        )
        with self.assertRaises(AssertionError):
            assert_policy_contract(
                self,
                skill_text=skill_text,
                agents_text=AGENTS.read_text(),
                ci_text=CI.read_text(),
            )


if __name__ == "__main__":
    unittest.main()
