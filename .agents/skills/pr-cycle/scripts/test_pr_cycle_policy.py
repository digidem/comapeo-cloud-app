#!/usr/bin/env python3
from pathlib import Path
import unittest

SKILL_DIR = Path(__file__).resolve().parents[1]
SKILL = SKILL_DIR / "SKILL.md"
AGENTS = SKILL_DIR.parents[2] / "AGENTS.md"
CI = SKILL_DIR.parents[2] / ".github" / "workflows" / "ci.yml"


def _active_ci_commands(ci_text: str) -> set[str]:
    return {
        line.strip()
        for line in ci_text.splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }


def assert_policy_contract(
    test: unittest.TestCase, *, skill_text: str, agents_text: str, ci_text: str
) -> None:
    test.assertIn("verify the claim against the exact current head", skill_text)
    test.assertIn("false positive, stale, duplicate, or already satisfied", skill_text)
    test.assertIn("reply with precise evidence", skill_text)

    test.assertIn("Address nits when they materially improve the codebase", skill_text)
    test.assertIn("correctness, maintainability, test quality, clarity, or operability", skill_text)
    test.assertIn("Skip purely cosmetic or preference-only nits", skill_text)

    test.assertIn("exact isolated worktree and local branch captured at cycle start", skill_text)
    test.assertIn("similarly named issue/feature worktrees or branches as unrelated", skill_text)

    test.assertIn("## Issue and PR Scope Continuity", agents_text)
    test.assertIn("search the existing GitHub backlog", agents_text)
    test.assertIn("reuse the canonical implementation, data model, or integration path", agents_text)
    test.assertIn("Do not promote proposed or unmerged follow-up designs", agents_text)

    test.assertIn(
        "python3 .agents/skills/pr-cycle/scripts/test_pr_cycle_policy.py",
        _active_ci_commands(ci_text),
    )


class PrCyclePolicyTests(unittest.TestCase):
    def test_policy_contract(self) -> None:
        assert_policy_contract(
            self,
            skill_text=SKILL.read_text(),
            agents_text=AGENTS.read_text(),
            ci_text=CI.read_text(),
        )

    def test_nit_improvement_policy_is_required(self) -> None:
        skill_text = SKILL.read_text().replace(
            "Address nits when they materially improve the codebase",
            "Ignore nits even when they materially improve the codebase",
        )
        with self.assertRaisesRegex(
            AssertionError, "Address nits when they materially improve the codebase"
        ):
            assert_policy_contract(
                self,
                skill_text=skill_text,
                agents_text=AGENTS.read_text(),
                ci_text=CI.read_text(),
            )

    def test_bot_finding_verification_policy_is_required(self) -> None:
        skill_text = SKILL.read_text().replace(
            "verify the claim against the exact current head",
            "trust the claim without checking the current head",
        )
        with self.assertRaisesRegex(
            AssertionError, "verify the claim against the exact current head"
        ):
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
        with self.assertRaisesRegex(
            AssertionError, "similarly named issue/feature worktrees or branches as unrelated"
        ):
            assert_policy_contract(
                self,
                skill_text=skill_text,
                agents_text=AGENTS.read_text(),
                ci_text=CI.read_text(),
            )

    def test_scope_continuity_policy_is_required(self) -> None:
        agents_text = AGENTS.read_text().replace(
            "reuse the canonical implementation, data model, or integration path",
            "create a parallel implementation, data model, or integration path",
        )
        with self.assertRaisesRegex(
            AssertionError, "reuse the canonical implementation, data model, or integration path"
        ):
            assert_policy_contract(
                self,
                skill_text=SKILL.read_text(),
                agents_text=agents_text,
                ci_text=CI.read_text(),
            )

    def test_ci_invocation_must_be_active(self) -> None:
        ci_text = CI.read_text().replace(
            "          python3 .agents/skills/pr-cycle/scripts/test_pr_cycle_policy.py",
            "          # python3 .agents/skills/pr-cycle/scripts/test_pr_cycle_policy.py",
        )
        with self.assertRaisesRegex(
            AssertionError,
            "python3 .agents/skills/pr-cycle/scripts/test_pr_cycle_policy.py",
        ):
            assert_policy_contract(
                self,
                skill_text=SKILL.read_text(),
                agents_text=AGENTS.read_text(),
                ci_text=ci_text,
            )


if __name__ == "__main__":
    unittest.main()
