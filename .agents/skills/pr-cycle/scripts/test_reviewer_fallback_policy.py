#!/usr/bin/env python3
from pathlib import Path
import unittest

SKILL_DIR = Path(__file__).resolve().parents[1]
SKILL = SKILL_DIR / "SKILL.md"
REFERENCE = SKILL_DIR / "references" / "kimi-k3-review.md"
TIMEOUT = SKILL_DIR / "references" / "timeout-strategy.md"
CI = SKILL_DIR.parents[2] / ".github" / "workflows" / "ci.yml"


class ReviewerFallbackPolicyTests(unittest.TestCase):
    def test_skill_allows_kimi_when_opus_is_unavailable(self) -> None:
        text = SKILL.read_text()
        self.assertIn("Kimi K3 via OpenCode Go", text)
        self.assertIn("Opus 5 is unavailable", text)
        self.assertIn("did **not** explicitly require Opus", text)
        self.assertIn("references/kimi-k3-review.md", text)

    def test_kimi_reference_preserves_exact_revision_and_terminal_verdict_gate(self) -> None:
        self.assertTrue(REFERENCE.exists(), "Kimi fallback reference must exist")
        text = REFERENCE.read_text()
        self.assertIn("opencode-go/kimi-k3", text)
        self.assertIn("Oh My Pi", text)
        self.assertIn("exact head/base-tip pair", text)
        self.assertIn("terminal verdict", text)
        self.assertIn("must not count", text)

    def test_timeout_strategy_covers_resumable_kimi_review(self) -> None:
        text = TIMEOUT.read_text()
        self.assertIn("Kimi K3", text)
        self.assertIn("persistent", text)
        self.assertIn("timeout", text)

    def test_ci_runs_fallback_policy_test(self) -> None:
        text = CI.read_text()
        self.assertIn("test_reviewer_fallback_policy.py", text)


if __name__ == "__main__":
    unittest.main()
