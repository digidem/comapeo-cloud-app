#!/usr/bin/env python3
from pathlib import Path
import re
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[4]
PR_CYCLE_DIR = ROOT / ".agents" / "skills" / "pr-cycle"
PR_CYCLE_SKILL = PR_CYCLE_DIR / "SKILL.md"
KNOWLEDGE_SKILL = ROOT / ".agents" / "skills" / "maintaining-agent-knowledge" / "SKILL.md"
QA_EVIDENCE = PR_CYCLE_DIR / "references" / "qa-evidence.md"
REVIEW_EVIDENCE = PR_CYCLE_DIR / "references" / "review-evidence.md"
E2E_AGENTS = ROOT / "tests" / "e2e" / "AGENTS.md"
MAP_AGENTS = ROOT / "src" / "lib" / "map" / "AGENTS.md"
ADR_README = ROOT / "docs" / "adr" / "README.md"
ADR_0001 = ROOT / "docs" / "adr" / "0001-agent-knowledge-architecture.md"
INVITE_API = ROOT / "docs" / "invite-api-spec.md"
REMOTE_ARCHIVE_API = ROOT / "docs" / "remote-archive-api-spec.md"
ROOT_AGENTS = ROOT / "AGENTS.md"
CI = ROOT / ".github" / "workflows" / "ci.yml"

SESSION_LESSON_RE = re.compile(r"pr\d+-session-lessons\.md$", re.IGNORECASE)

MIGRATION_HEADINGS = (
    "Exact-revision truth is the unit of readiness",
    "Review findings are hypotheses, not commands",
    "Tool and provider failure is not a verdict",
    "Local browser limits must be separated from product failures",
    "QA evidence should mirror the actual product boundary",
    "Determinism requires hostile-environment tests",
    "Resource bounds must be enforced before expensive work",
    "Archive parser compatibility must be explicit and narrow",
    "MapLibre offline symbols need an explicit resource contract",
    "Command ceilings should shape validation, not weaken it",
    "Documentation placement",
    "Treat skipped E2E comments and selectors as historical evidence",
    "Pair product-flow QA with direct deployed-artifact probes when boundaries differ",
    "Cross-browser substitution must be exact and explicit",
)

ALLOWED_DISPOSITIONS = (
    "already canonical",
    "promoted to workflow reference",
    "promoted to scoped AGENTS",
    "product evidence retained in code/tests/QA",
    "discarded as non-durable",
)


def _resource_paths(skill_path: Path) -> list[Path]:
    text = skill_path.read_text()
    if "## Resources" not in text:
        return []
    resources = text.split("## Resources", 1)[1]
    paths: list[Path] = []
    for raw in re.findall(r"^- `([^`]+)`", resources, flags=re.MULTILINE):
        if raw.startswith(("http://", "https://")):
            continue
        paths.append((skill_path.parent / raw).resolve())
    return paths


def _display_path(path: Path) -> str:
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return str(path)


def _session_lesson_files() -> list[Path]:
    result = subprocess.run(
        [
            "git",
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "--",
            ".agents/skills",
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return [
        ROOT / raw
        for raw in result.stdout.splitlines()
        if raw.endswith(".md") and SESSION_LESSON_RE.search(Path(raw).name)
    ]


class AgentKnowledgePolicyTests(unittest.TestCase):
    def test_chronological_session_memory_files_are_not_permanent(self) -> None:
        offenders = [_display_path(path) for path in _session_lesson_files()]
        self.assertEqual(offenders, [])

    def test_chronological_session_scan_ignores_gitignored_local_skills(self) -> None:
        local_dir = ROOT / ".agents" / "skills" / "local-policy-test"
        local_note = local_dir / "pr999-session-lessons.md"
        local_dir.mkdir(parents=True, exist_ok=True)
        local_note.write_text("local ignored scratch\n")
        try:
            self.assertNotIn(local_note, _session_lesson_files())
        finally:
            local_note.unlink(missing_ok=True)
            local_dir.rmdir()

    def test_display_path_handles_missing_resource_outside_repository(self) -> None:
        outside = ROOT.parent / "outside-agent-resource.md"
        try:
            displayed = _display_path(outside)
        except ValueError:
            displayed = "<raised ValueError>"
        self.assertEqual(displayed, str(outside))

    def test_required_progressive_disclosure_structure_exists(self) -> None:
        required = (
            KNOWLEDGE_SKILL,
            QA_EVIDENCE,
            REVIEW_EVIDENCE,
            E2E_AGENTS,
            MAP_AGENTS,
            ADR_README,
            ADR_0001,
            INVITE_API,
        )
        missing = [path.relative_to(ROOT).as_posix() for path in required if not path.is_file()]
        self.assertEqual(missing, [])

    def test_pr_cycle_delegates_knowledge_promotion(self) -> None:
        text = PR_CYCLE_SKILL.read_text()
        self.assertIn("maintaining-agent-knowledge", text)
        self.assertIn("references/qa-evidence.md", text)
        self.assertIn("references/review-evidence.md", text)

    def test_claude_is_only_a_compatibility_adapter(self) -> None:
        self.assertEqual((ROOT / "CLAUDE.md").read_text().strip(), "@AGENTS.md")

    def test_no_unneeded_global_copilot_policy_fork(self) -> None:
        self.assertFalse((ROOT / ".github" / "copilot-instructions.md").exists())

    def test_new_canonical_skill_is_versioned_by_gitignore_policy(self) -> None:
        gitignore = (ROOT / ".gitignore").read_text()
        self.assertIn("!.agents/skills/maintaining-agent-knowledge/", gitignore)
        self.assertIn("!.agents/skills/maintaining-agent-knowledge/**", gitignore)

    def test_affected_skill_resource_links_resolve(self) -> None:
        skill_paths = [PR_CYCLE_SKILL]
        if KNOWLEDGE_SKILL.is_file():
            skill_paths.append(KNOWLEDGE_SKILL)
        missing: list[str] = []
        for skill_path in skill_paths:
            for resource_path in _resource_paths(skill_path):
                if not resource_path.exists():
                    missing.append(_display_path(resource_path))
        self.assertEqual(missing, [])

    def test_migration_manifest_accounts_for_every_source_heading(self) -> None:
        self.assertTrue(ADR_0001.is_file(), "ADR 0001 must contain the migration manifest")
        text = ADR_0001.read_text()
        for heading in MIGRATION_HEADINGS:
            with self.subTest(heading=heading):
                self.assertIn(heading, text)
                matching_rows = [line for line in text.splitlines() if heading in line]
                self.assertTrue(matching_rows, f"missing migration row for {heading}")
                self.assertTrue(
                    any(disposition in matching_rows[0] for disposition in ALLOWED_DISPOSITIONS),
                    f"missing allowed disposition for {heading}",
                )

    def test_promoted_lessons_keep_their_material_invariants(self) -> None:
        qa_text = QA_EVIDENCE.read_text()
        review_text = REVIEW_EVIDENCE.read_text()
        e2e_text = E2E_AGENTS.read_text()
        map_text = MAP_AGENTS.read_text()
        knowledge_text = KNOWLEDGE_SKILL.read_text()

        self.assertIn("historical evidence, not canonical product state", qa_text)
        self.assertIn("accessibility tree", qa_text)
        self.assertIn("exact deployed artifact", qa_text)
        self.assertIn("same integrated revision", qa_text)
        self.assertIn("final tree that will be pushed/reviewed", qa_text)
        self.assertIn("Findings are hypotheses, not commands", review_text)
        self.assertIn("RED regression test", review_text)
        self.assertIn("unavailable review transport", review_text)
        self.assertIn("desktop-only element", e2e_text)
        self.assertIn("continue-on-error", e2e_text)
        self.assertIn("must not execute accessors/getters", map_text)
        self.assertIn("UTC-based metadata/timestamps", map_text)
        self.assertIn("compatibility exceptions must be exact, narrow", map_text)
        self.assertIn("successful empty PBF", map_text)
        self.assertIn("terminal/finalization waits", map_text)
        self.assertIn("One normative rule should have one canonical home", knowledge_text)
        self.assertIn("Never create permanent files named like", knowledge_text)

    def test_moved_root_guidance_has_canonical_destinations(self) -> None:
        self.assertTrue(INVITE_API.is_file(), "invite API contract needs a canonical doc")
        root_agents = ROOT_AGENTS.read_text()
        e2e_text = E2E_AGENTS.read_text()
        invite_text = INVITE_API.read_text()
        remote_text = REMOTE_ARCHIVE_API.read_text()
        map_text = MAP_AGENTS.read_text()
        adr_text = ADR_0001.read_text()

        self.assertIn("docs/invite-api-spec.md", root_agents)
        self.assertIn("GET /projects/:id", remote_text)
        self.assertIn("POST /api/invites/encrypt", invite_text)
        self.assertIn("ttlHours", invite_text)
        self.assertIn("POST /api/invites/decrypt", invite_text)
        self.assertIn("410", invite_text)
        self.assertIn("INVITE_EXPIRED", invite_text)
        self.assertIn("`npm run storybook:screenshots:baseline`", e2e_text)
        self.assertIn("tests/e2e/storybook-screenshots-baseline/", e2e_text)
        self.assertIn("`visual-regression-check`", e2e_text)
        self.assertIn("`npm run pipeline:mobile-review`", e2e_text)
        self.assertIn("browser.newContext()", e2e_text)
        self.assertIn("VIEWPORTS", e2e_text)
        self.assertIn("setupMockServer", e2e_text)
        self.assertIn("chromium only", e2e_text.lower())
        self.assertIn("src/lib/schemas/authored-layer.ts", map_text)
        self.assertIn("- Status: Accepted", adr_text)
        self.assertNotIn("Accepted (effective when this PR lands)", adr_text)

    def test_ci_runs_agent_knowledge_policy_under_existing_context(self) -> None:
        ci_text = CI.read_text()
        self.assertIn("  pr-cycle-skill-tests:", ci_text)
        self.assertIn(
            "python3 .agents/skills/pr-cycle/scripts/test_agent_knowledge_policy.py",
            ci_text,
        )


if __name__ == "__main__":
    unittest.main()
