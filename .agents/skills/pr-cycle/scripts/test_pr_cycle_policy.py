#!/usr/bin/env python3
from pathlib import Path
import re
import unittest

SKILL_DIR = Path(__file__).resolve().parents[1]
SKILL = SKILL_DIR / "SKILL.md"
RUNBOOK = SKILL_DIR / "references" / "github-runbook.md"
TIMEOUT_STRATEGY = SKILL_DIR / "references" / "timeout-strategy.md"
CLAUDE_QWEN_REVIEW = SKILL_DIR / "references" / "claude-qwen-review.md"
AGENTS = SKILL_DIR.parents[2] / "AGENTS.md"
CI = SKILL_DIR.parents[2] / ".github" / "workflows" / "ci.yml"


def _ci_job_block(ci_text: str, job_name: str) -> str:
    lines = ci_text.splitlines()
    header = f"  {job_name}:"
    try:
        start = lines.index(header)
    except ValueError:
        return ""

    end = len(lines)
    for index in range(start + 1, len(lines)):
        if re.fullmatch(r"  [A-Za-z0-9_-]+:\s*", lines[index]):
            end = index
            break
    return "\n".join(lines[start:end])


def _active_ci_commands(ci_text: str) -> set[str]:
    return {
        line.strip()
        for line in ci_text.splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }


def _first_code_block_after(text: str, marker: str) -> str:
    tail = text.split(marker, 1)[1]
    return tail.split("```bash", 1)[1].split("```", 1)[0]


def assert_policy_contract(
    test: unittest.TestCase, *, skill_text: str, agents_text: str, ci_text: str
) -> None:
    test.assertIn("verify the claim against the exact current head", skill_text)
    test.assertIn("false positive, stale, duplicate, or already satisfied", skill_text)
    test.assertIn("reply with precise evidence", skill_text)

    test.assertIn("Address nits when they materially improve the codebase", skill_text)
    test.assertIn(
        "correctness, security, data-loss prevention, maintainability, test quality, clarity, or operability",
        skill_text,
    )
    test.assertIn("Skip purely cosmetic or preference-only nits", skill_text)
    test.assertIn("After two consecutive nit-only revision cycles", skill_text)
    test.assertIn("defer remaining marginal nits", skill_text)

    test.assertIn("Merge authorization is execution-local and non-transferable", skill_text)
    test.assertIn("explicit user message in its own current conversation/task", skill_text)
    test.assertIn("another chat/session/agent", skill_text)
    test.assertIn("GitHub actions run under the user's authenticated account", skill_text)
    test.assertIn("treat that as a concurrent writer", skill_text)
    test.assertIn("A concurrent writer never grants merge authority", skill_text)
    test.assertIn("a pre-existing head this execution reviewed and accepted", skill_text)
    test.assertIn("authorization-provenance checkpoint", skill_text)
    test.assertIn("A request to run a PR cycle, make the PR merge-ready", skill_text)
    test.assertIn("If the PR became merged without this execution issuing the merge command", skill_text)

    test.assertIn("exact isolated worktree and local branch captured at cycle start", skill_text)
    test.assertIn("similarly named issue/feature worktrees or branches as unrelated", skill_text)
    test.assertIn("A green wrapper job is not sufficient", skill_text)
    test.assertIn("continue-on-error", skill_text)
    test.assertIn("A `conclusion: success` after `continue-on-error` is not enough", skill_text)
    test.assertIn("Keep the gate policy here", skill_text)
    test.assertIn("git push --no-verify origin --delete <branch>", skill_text)
    test.assertIn("Keep the safety policy here", skill_text)
    test.assertIn("ordered merge sequence", skill_text)
    test.assertIn("re-establish the merge gate for the next PR", skill_text)
    test.assertIn("complete repository-applicable set of target-branch runs/checks for the exact post-sequence target SHA is the integration truth", skill_text)
    test.assertIn("exact post-sequence target SHA", skill_text)
    test.assertIn("git merge-base --is-ancestor", skill_text)
    test.assertIn("every expected workflow/check", skill_text)
    test.assertIn("do not replace that integration subject with a newer unrelated tip", skill_text)
    test.assertIn("Apply the same terminal-state and soft-fail rules from the merge-ready gate", skill_text)

    test.assertIn("live usage instrumentation", skill_text)
    test.assertIn("no older than 15 minutes", skill_text)
    test.assertIn("no more than 5 minutes in the future", skill_text)
    test.assertIn("one bounded provider-specific liveness probe", skill_text)
    test.assertIn("unavailable for this cycle without claiming quota exhaustion", skill_text)
    test.assertIn("codexbar usage", skill_text)
    test.assertIn("plan-check json", skill_text)
    test.assertIn("quota-heartbeat.json", skill_text)
    test.assertIn("claude-qwen", skill_text)
    test.assertIn("Qwen 3.8", skill_text)
    test.assertIn("references/claude-qwen-review.md", skill_text)

    test.assertIn("## 8. Session lessons and documentation checkpoint", skill_text)
    test.assertIn("Before concluding every PR cycle", skill_text)
    test.assertIn("`.agents/skills/pr-cycle/` for reusable PR-cycle mechanics", skill_text)
    test.assertIn("`README.md` only when human contributors or users need", skill_text)
    test.assertIn("create a focused follow-up docs/process PR", skill_text)
    test.assertIn("final report must state what durable lessons were documented", skill_text)

    test.assertIn("## PR Merge Authorization Invariant", agents_text)
    test.assertIn("explicit merge authorization from a user message in its own current task", agents_text)
    test.assertIn("authorization never transfers across chats, sessions, agents", agents_text)
    test.assertIn("Without that current-task authorization, stop at merge-ready", agents_text)

    test.assertIn("## Issue and PR Scope Continuity", agents_text)
    test.assertIn("search the existing GitHub backlog", agents_text)
    test.assertIn("reuse the canonical implementation, data model, or integration path", agents_text)
    test.assertIn("Do not promote proposed or unmerged follow-up designs", agents_text)
    test.assertIn("tracked artifacts under `screenshots/screenshot/`", agents_text)
    test.assertIn("restore incidental changes after exploratory runs", agents_text)

    test.assertIn(
        "python3 .agents/skills/pr-cycle/scripts/test_pr_cycle_policy.py",
        _active_ci_commands(_ci_job_block(ci_text, "pr-cycle-skill-tests")),
    )


class PrCyclePolicyTests(unittest.TestCase):
    def test_policy_contract(self) -> None:
        assert_policy_contract(
            self,
            skill_text=SKILL.read_text(),
            agents_text=AGENTS.read_text(),
            ci_text=CI.read_text(),
        )

    def test_runbook_soft_fail_and_cleanup_guidance_is_pinned(self) -> None:
        runbook_text = RUNBOOK.read_text()
        self.assertIn(
            "GitHub distinguishes the pre-mask step `outcome` from the post-mask `conclusion`",
            runbook_text,
        )
        self.assertIn(
            "git push --no-verify origin --delete <head-branch>", runbook_text
        )

    def test_ordered_merge_and_ci_wait_guidance_is_pinned(self) -> None:
        runbook_text = RUNBOOK.read_text()
        timeout_text = TIMEOUT_STRATEGY.read_text()
        self.assertIn("## Ordered multi-PR merge sequences", runbook_text)
        self.assertIn("re-gate the next PR against that exact new base tip", runbook_text)
        self.assertIn("complete repository-applicable set of target-branch runs/checks for the exact post-sequence target SHA is the integration truth", runbook_text)
        self.assertIn("git merge-base --is-ancestor", runbook_text)
        self.assertIn("every expected workflow/check", runbook_text)
        self.assertIn("recent successful runs of the same workflow/job", timeout_text)

    def test_claude_qwen_fallback_and_usage_preflight_are_pinned(self) -> None:
        qwen_text = CLAUDE_QWEN_REVIEW.read_text()
        self.assertIn("Qwen 3.8", qwen_text)
        self.assertIn("command -v claude-qwen", qwen_text)
        self.assertIn("api_error_status", qwen_text)
        self.assertIn("429", qwen_text)
        self.assertIn("codexbar usage", qwen_text)
        self.assertIn("plan-check json", qwen_text)
        self.assertIn("quota-heartbeat.json", qwen_text)
        self.assertIn("unknown**, not exhausted", qwen_text)
        self.assertIn("stale", qwen_text)
        self.assertIn("exact head/base-tip pair", qwen_text)
        self.assertIn("do not repeatedly retry", qwen_text)
        self.assertIn("Never print, copy, grep, or embed the wrapper's credentials or API keys", qwen_text)
        self.assertIn("No reviewer filesystem tools are allowed", qwen_text)
        self.assertIn('--tools ""', qwen_text)
        self.assertIn("Do not use `--add-dir`", qwen_text)
        self.assertIn("<sanitized-prompt-file>", qwen_text)
        self.assertIn("mode 0700", qwen_text)
        self.assertIn("mode 0600", qwen_text)
        self.assertIn("empty isolated working directory", qwen_text)
        self.assertIn("through stdin", qwen_text)
        self.assertIn("no older than 15 minutes", qwen_text)
        self.assertIn("one bounded provider-specific liveness probe", qwen_text)
        self.assertIn("plan-check json", qwen_text)
        self.assertIn("parseable observation timestamp", qwen_text)

        invocation = _first_code_block_after(qwen_text, "Representative invocation")
        self.assertIn('mktemp -d', invocation)
        self.assertIn('chmod 700', invocation)
        self.assertIn('chmod 600', invocation)
        self.assertIn('cd "$WORK_DIR"', invocation)
        self.assertIn('--tools ""', invocation)
        self.assertIn('-p < "$PROMPT_FILE"', invocation)
        self.assertIn("trap", invocation)
        self.assertNotIn("--add-dir", invocation)
        self.assertNotIn("$(cat", invocation)
        self.assertNotRegex(invocation, r"--tools\s+(?:Read|Grep|Glob|Bash|Edit|Write)")

    def test_ordered_merge_keeps_immutable_sequence_subject(self) -> None:
        runbook_text = RUNBOOK.read_text()
        ordered = runbook_text.split("## Ordered multi-PR merge sequences", 1)[1].split(
            "## Scoped cleanup", 1
        )[0]
        self.assertIn("keep that immutable SHA as the integration subject", ordered)
        self.assertIn("complete repository-applicable set of target-branch runs/checks", ordered)
        self.assertIn("every expected workflow/check", ordered)
        self.assertIn("git merge-base --is-ancestor", ordered)
        self.assertIn("same terminal-state and soft-fail rules as the merge-ready gate", ordered)
        self.assertIn("pre-mask step outcome or logs", ordered)
        self.assertIn("Do not overlap merge commands", ordered)
        self.assertNotRegex(ordered, re.compile(r"merge (?:the )?remaining PRs concurrently", re.I))
        self.assertNotIn("repeat against the new live tip", ordered)
        self.assertLess(
            ordered.index("use the merge commit SHA returned by verification of that final merge"),
            ordered.index("Select only runs whose `headSha` equals"),
        )

    def test_usage_preflight_resolves_unknown_state_before_fallback(self) -> None:
        skill_text = SKILL.read_text()
        usage = next(
            paragraph
            for paragraph in re.split(r"\n\s*\n", skill_text)
            if "live usage instrumentation" in paragraph
        )
        self.assertNotIn("fresh enough to represent this execution", usage)
        self.assertLess(usage.index("codexbar usage"), usage.index("plan-check json"))
        self.assertLess(usage.index("plan-check json"), usage.index("quota-heartbeat.json"))
        self.assertLess(
            usage.index("quota-heartbeat.json"),
            usage.index("one bounded provider-specific liveness probe"),
        )
        self.assertIn("accept `plan-check json` output only when it includes a parseable observation timestamp", usage)
        self.assertGreaterEqual(usage.count("no older than 15 minutes"), 2)
        self.assertGreaterEqual(usage.count("no more than 5 minutes in the future"), 2)
        self.assertIn("timeout, hang, or provider error", usage)
        self.assertIn("unavailable for this cycle without claiming quota exhaustion", usage)

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

    def test_merge_authorization_must_be_execution_local(self) -> None:
        skill_text = SKILL.read_text().replace(
            "Merge authorization is execution-local and non-transferable",
            "Merge authorization may be inherited from another execution",
        )
        with self.assertRaisesRegex(
            AssertionError, "Merge authorization is execution-local and non-transferable"
        ):
            assert_policy_contract(
                self,
                skill_text=skill_text,
                agents_text=AGENTS.read_text(),
                ci_text=CI.read_text(),
            )

    def test_concurrent_writer_does_not_grant_merge_authority(self) -> None:
        skill_text = SKILL.read_text().replace(
            "A concurrent writer never grants merge authority",
            "A concurrent writer grants merge authority",
        )
        with self.assertRaisesRegex(
            AssertionError, "A concurrent writer never grants merge authority"
        ):
            assert_policy_contract(
                self,
                skill_text=skill_text,
                agents_text=AGENTS.read_text(),
                ci_text=CI.read_text(),
            )

    def test_readiness_request_is_not_merge_authorization(self) -> None:
        skill_text = SKILL.read_text().replace(
            "A request to run a PR cycle, make the PR merge-ready, review it, or report readiness is not merge authorization.",
            "A readiness request authorizes merge.",
        )
        with self.assertRaisesRegex(
            AssertionError, "A request to run a PR cycle, make the PR merge-ready"
        ):
            assert_policy_contract(
                self,
                skill_text=skill_text,
                agents_text=AGENTS.read_text(),
                ci_text=CI.read_text(),
            )

    def test_authorization_provenance_checkpoint_is_required(self) -> None:
        skill_text = SKILL.read_text().replace(
            "Perform an authorization-provenance checkpoint before any merge command.",
            "Skip authorization provenance before merge commands.",
        )
        with self.assertRaisesRegex(AssertionError, "authorization-provenance checkpoint"):
            assert_policy_contract(
                self,
                skill_text=skill_text,
                agents_text=AGENTS.read_text(),
                ci_text=CI.read_text(),
            )

    def test_external_merge_must_not_be_claimed_by_current_execution(self) -> None:
        skill_text = SKILL.read_text().replace(
            "If the PR became merged without this execution issuing the merge command",
            "If this execution did not issue the merge command, claim the merge anyway",
        )
        with self.assertRaisesRegex(
            AssertionError, "If the PR became merged without this execution issuing the merge command"
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

    def test_soft_fail_ci_adjudication_policy_is_required(self) -> None:
        skill_text = SKILL.read_text().replace(
            "A green wrapper job is not sufficient",
            "A green wrapper job is always sufficient",
        )
        with self.assertRaisesRegex(AssertionError, "A green wrapper job is not sufficient"):
            assert_policy_contract(
                self,
                skill_text=skill_text,
                agents_text=AGENTS.read_text(),
                ci_text=CI.read_text(),
            )

    def test_cleanup_branch_delete_hook_bypass_is_required(self) -> None:
        skill_text = SKILL.read_text().replace(
            "git push --no-verify origin --delete <branch>",
            "git push origin --delete <branch>",
        )
        with self.assertRaisesRegex(
            AssertionError, "git push --no-verify origin --delete <branch>"
        ):
            assert_policy_contract(
                self,
                skill_text=skill_text,
                agents_text=AGENTS.read_text(),
                ci_text=CI.read_text(),
            )

    def test_session_lessons_checkpoint_is_required(self) -> None:
        skill_text = SKILL.read_text().replace(
            "## 8. Session lessons and documentation checkpoint",
            "## 8. Optional session notes",
        )
        with self.assertRaisesRegex(
            AssertionError, "## 8. Session lessons and documentation checkpoint"
        ):
            assert_policy_contract(
                self,
                skill_text=skill_text,
                agents_text=AGENTS.read_text(),
                ci_text=CI.read_text(),
            )

    def test_argos_artifact_guidance_is_required(self) -> None:
        agents_text = AGENTS.read_text().replace(
            "tracked artifacts under `screenshots/screenshot/`",
            "ignored artifacts under `screenshots/screenshot/`",
        )
        with self.assertRaisesRegex(
            AssertionError, "tracked artifacts under `screenshots/screenshot/`"
        ):
            assert_policy_contract(
                self,
                skill_text=SKILL.read_text(),
                agents_text=agents_text,
                ci_text=CI.read_text(),
            )

    def test_agents_merge_authorization_fallback_is_required(self) -> None:
        agents_text = AGENTS.read_text().replace(
            "authorization never transfers across chats, sessions, agents",
            "authorization transfers across chats, sessions, agents",
        )
        with self.assertRaisesRegex(
            AssertionError, "authorization never transfers across chats, sessions, agents"
        ):
            assert_policy_contract(
                self,
                skill_text=SKILL.read_text(),
                agents_text=agents_text,
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

    def test_ci_invocation_must_be_active_in_pr_cycle_job(self) -> None:
        command = "python3 .agents/skills/pr-cycle/scripts/test_pr_cycle_policy.py"
        ci_text = CI.read_text()
        self.assertEqual(ci_text.count(command), 1)
        ci_text = ci_text.replace(command, f"# {command}", 1)
        ci_text = f"{ci_text}\n# Elsewhere in the workflow:\n{command}\n"
        with self.assertRaisesRegex(AssertionError, re.escape(command)):
            assert_policy_contract(
                self,
                skill_text=SKILL.read_text(),
                agents_text=AGENTS.read_text(),
                ci_text=ci_text,
            )


if __name__ == "__main__":
    unittest.main()
