#!/usr/bin/env python3
from pathlib import Path
import re
import unittest

SKILL_DIR = Path(__file__).resolve().parents[1]
SKILL = SKILL_DIR / "SKILL.md"
REFERENCE = SKILL_DIR / "references" / "kimi-k3-review.md"
TIMEOUT = SKILL_DIR / "references" / "timeout-strategy.md"
CI = SKILL_DIR.parents[2] / ".github" / "workflows" / "ci.yml"


def _paragraph_containing(text: str, needle: str) -> str:
    for paragraph in re.split(r"\n\s*\n", text):
        if needle in paragraph:
            return " ".join(paragraph.split())
    raise AssertionError(f"Missing policy paragraph containing: {needle}")


def assert_policy_contract(
    test: unittest.TestCase,
    *,
    skill_text: str,
    reference_text: str,
    timeout_text: str,
    ci_text: str,
) -> None:
    fallback = _paragraph_containing(skill_text, "When Opus 5 is unavailable")
    test.assertIn(
        "and the user did **not** explicitly require Opus, fall back first to **Kimi K3 via OpenCode Go**",
        fallback,
    )
    test.assertIn(
        "Keep every fallback read-only, bind it to the exact head/base-tip pair, require a terminal verdict",
        fallback,
    )
    test.assertIn(
        "If the user explicitly required a named reviewer, do not silently substitute another model.",
        fallback,
    )
    test.assertIn("references/kimi-k3-review.md", fallback)

    contract = _paragraph_containing(reference_text, "Ask Kimi to review a fresh exact diff")
    test.assertIn("**exact head/base-tip pair**", contract)
    test.assertIn("return a terminal verdict", contract)

    invalid = _paragraph_containing(reference_text, "A Kimi result **must not count**")
    test.assertRegex(
        invalid,
        re.compile(
            r"must not count.*partial reasoning.*malformed.*missing either SHA.*stale revisions.*still running.*timed out.*provider-failed.*needs input"
        ),
    )
    test.assertIn(
        "An explicitly requested Opus 5 review must not be silently replaced by Kimi.",
        reference_text,
    )
    test.assertIn("opencode-go/kimi-k3", reference_text)
    test.assertIn("Oh My Pi", reference_text)

    timeout = _paragraph_containing(timeout_text, "For the Kimi K3 fallback")
    test.assertIn("persistent ACP session", timeout)
    test.assertIn("timed-out foreground command", timeout)
    test.assertIn("must not count as approval", timeout)

    ci_commands = {
        line.strip()
        for line in ci_text.splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }
    test.assertIn(
        "python3 .agents/skills/pr-cycle/scripts/test_reviewer_fallback_policy.py",
        ci_commands,
    )


class ReviewerFallbackPolicyTests(unittest.TestCase):
    def test_policy_contract(self) -> None:
        assert_policy_contract(
            self,
            skill_text=SKILL.read_text(),
            reference_text=REFERENCE.read_text(),
            timeout_text=TIMEOUT.read_text(),
            ci_text=CI.read_text(),
        )

    def test_named_reviewer_substitution_blocked(self) -> None:
        skill_text = SKILL.read_text().replace(
            "If the user explicitly required a named reviewer, do not silently substitute another model.",
            "If the user explicitly required a named reviewer, silently substitute another model.",
        )
        with self.assertRaises(AssertionError):
            assert_policy_contract(
                self,
                skill_text=skill_text,
                reference_text=REFERENCE.read_text(),
                timeout_text=TIMEOUT.read_text(),
                ci_text=CI.read_text(),
            )

    def test_nonterminal_rejected(self) -> None:
        reference_text = REFERENCE.read_text().replace(
            "A Kimi result **must not count** when it is partial reasoning",
            "A Kimi result **may count** when it is partial reasoning",
        )
        with self.assertRaises(AssertionError):
            assert_policy_contract(
                self,
                skill_text=SKILL.read_text(),
                reference_text=reference_text,
                timeout_text=TIMEOUT.read_text(),
                ci_text=CI.read_text(),
            )


if __name__ == "__main__":
    unittest.main()
