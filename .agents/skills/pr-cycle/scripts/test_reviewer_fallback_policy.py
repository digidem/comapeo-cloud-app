#!/usr/bin/env python3
from pathlib import Path
import re
import unittest

SKILL_DIR = Path(__file__).resolve().parents[1]
SKILL = SKILL_DIR / "SKILL.md"
KIMI_REFERENCE = SKILL_DIR / "references" / "kimi-k3-review.md"
CLAUDE_REFERENCE = SKILL_DIR / "references" / "claude-code-review.md"
ASTRA_REFERENCE = SKILL_DIR / "references" / "gpt-6-astra-review.md"
QWEN_REFERENCE = SKILL_DIR / "references" / "claude-qwen-review.md"
TIMEOUT = SKILL_DIR / "references" / "timeout-strategy.md"
CI = SKILL_DIR.parents[2] / ".github" / "workflows" / "ci.yml"
AGENTS = SKILL_DIR.parents[2] / "AGENTS.md"
ISSUE_TO_SPEC = SKILL_DIR.parent / "issue-to-spec" / "SKILL.md"


def _paragraph_containing(text: str, needle: str) -> str:
    for paragraph in re.split(r"\n\s*\n", text):
        if needle in paragraph:
            return " ".join(paragraph.split())
    raise AssertionError(f"Missing policy paragraph containing: {needle}")


def assert_policy_contract(
    test: unittest.TestCase,
    *,
    skill_text: str,
    kimi_reference_text: str,
    claude_reference_text: str,
    astra_reference_text: str,
    qwen_reference_text: str,
    timeout_text: str,
    ci_text: str,
    agents_text: str,
    issue_to_spec_text: str,
) -> None:
    primary = _paragraph_containing(skill_text, "Default to **GPT-6 Astra via Codex**")
    test.assertIn("`gpt-6-astra`", primary)
    test.assertIn("exact head/base-tip pair", primary)
    test.assertIn("read-only", primary)
    test.assertIn("references/gpt-6-astra-review.md", primary)

    fallback = _paragraph_containing(skill_text, "If GPT-6 Astra via Codex is unavailable")
    test.assertIn(
        "fall back first to **Claude Opus 5**, then **Kimi K3 via OpenCode Go**",
        fallback,
    )
    test.assertIn(
        "fall back to **Qwen 3.8 via `claude-qwen`** as a final independent-review option",
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
    opus_index = fallback.index("fall back first to **Claude Opus 5**")
    kimi_index = fallback.index("then **Kimi K3 via OpenCode Go**")
    qwen_index = fallback.index("Qwen 3.8 via `claude-qwen`")
    test.assertLess(opus_index, kimi_index)
    test.assertLess(kimi_index, qwen_index)
    test.assertNotIn("GPT-5.6 Sol", skill_text)
    test.assertNotRegex(fallback, re.compile(r"(?:prefer|use|try) Qwen .*before .*Kimi", re.I))
    test.assertIn("same exact requested Opus model", fallback)

    test.assertIn("GPT-6 Astra", agents_text)
    test.assertIn("`gpt-6-astra`", agents_text)
    test.assertIn(
        "planning, implementation, specification, debugging, and independent review",
        agents_text,
    )
    test.assertIn("GPT-6 Astra via Codex", issue_to_spec_text)
    test.assertNotIn("use Claude Opus 5", issue_to_spec_text)

    test.assertIn("# GPT-6 Astra via Codex reviewer", astra_reference_text)
    test.assertIn("`codex exec -m gpt-6-astra`", astra_reference_text)
    test.assertIn("exact head/base-tip pair", astra_reference_text)
    test.assertIn("terminal verdict", astra_reference_text)
    test.assertNotIn("GPT-5.6 Sol", astra_reference_text)

    alternate = _paragraph_containing(
        claude_reference_text, "If the user explicitly requires a named Opus model"
    )
    test.assertIn("same exact requested model id", alternate)
    test.assertIn("one-shot probe", alternate)
    alternate_contract = _paragraph_containing(
        claude_reference_text, "Keep the alternate-provider review fail-closed"
    )
    test.assertIn(
        "`--safe-mode --in <exact-pr-worktree> --no-restore-cwd`",
        alternate_contract,
    )
    test.assertIn("read-only shell access", alternate_contract)
    test.assertIn(
        "`pwd`, `git rev-parse HEAD`, and the live base-tip SHA", alternate_contract
    )

    contract = _paragraph_containing(
        kimi_reference_text, "Ask Kimi to review a fresh exact diff"
    )
    test.assertIn("**exact head/base-tip pair**", contract)
    test.assertIn("return a terminal verdict", contract)
    invalid = _paragraph_containing(
        kimi_reference_text, "A Kimi result **must not count**"
    )
    test.assertRegex(
        invalid,
        re.compile(
            r"must not count.*partial reasoning.*malformed.*missing either SHA.*stale revisions.*still running.*timed out.*provider-failed.*needs input"
        ),
    )
    test.assertIn(
        "An explicitly requested GPT-6 Astra review must not be silently replaced by Kimi.",
        kimi_reference_text,
    )
    test.assertIn("GPT-6 Astra via Codex", kimi_reference_text)
    test.assertIn("opencode-go/kimi-k3", kimi_reference_text)
    test.assertIn("Oh My Pi", kimi_reference_text)

    test.assertIn("GPT-6 Astra", qwen_reference_text)
    test.assertNotIn("GPT-5.6 Sol", qwen_reference_text)

    timeout = _paragraph_containing(timeout_text, "For GPT-6 Astra via Codex")
    test.assertIn("`gpt-6-astra`", timeout)
    test.assertIn("resume", timeout)
    test.assertIn("terminal verdict", timeout)

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
    def _assert(self, **overrides: str) -> None:
        values = {
            "skill_text": SKILL.read_text(),
            "kimi_reference_text": KIMI_REFERENCE.read_text(),
            "claude_reference_text": CLAUDE_REFERENCE.read_text(),
            "astra_reference_text": ASTRA_REFERENCE.read_text() if ASTRA_REFERENCE.exists() else "",
            "qwen_reference_text": QWEN_REFERENCE.read_text(),
            "timeout_text": TIMEOUT.read_text(),
            "ci_text": CI.read_text(),
            "agents_text": AGENTS.read_text(),
            "issue_to_spec_text": ISSUE_TO_SPEC.read_text(),
        }
        values.update(overrides)
        assert_policy_contract(self, **values)

    def test_policy_contract(self) -> None:
        self._assert()

    def test_named_reviewer_substitution_blocked(self) -> None:
        skill_text = SKILL.read_text().replace(
            "If the user explicitly required a named reviewer, do not silently substitute another model.",
            "If the user explicitly required a named reviewer, silently substitute another model.",
        )
        with self.assertRaises(AssertionError):
            self._assert(skill_text=skill_text)

    def test_fallback_ordering_is_required(self) -> None:
        skill_text = SKILL.read_text().replace(
            "fall back first to **Claude Opus 5**, then **Kimi K3 via OpenCode Go**",
            "Use Qwen first, then try other reviewers later",
        )
        with self.assertRaises(AssertionError):
            self._assert(skill_text=skill_text)

    def test_nonterminal_rejected(self) -> None:
        kimi_reference_text = KIMI_REFERENCE.read_text().replace(
            "A Kimi result **must not count** when it is partial reasoning",
            "A Kimi result **may count** when it is partial reasoning",
        )
        with self.assertRaises(AssertionError):
            self._assert(kimi_reference_text=kimi_reference_text)

    def test_exact_model_alternate_provider_contract_is_required(self) -> None:
        claude_reference_text = CLAUDE_REFERENCE.read_text().replace(
            "read-only shell access",
            "normal shell access",
        )
        with self.assertRaisesRegex(AssertionError, "read-only shell access"):
            self._assert(claude_reference_text=claude_reference_text)


if __name__ == "__main__":
    unittest.main()
