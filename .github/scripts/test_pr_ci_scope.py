#!/usr/bin/env python3
"""#197 standalone scope contract: run before every conditional PR CI job."""
import unittest
import subprocess
import tempfile
from pathlib import Path

from pr_ci_scope import classify, parse_paths


class ScopeTests(unittest.TestCase):
    def test_docs_only_including_nested_markdown(self):
        self.assertEqual(classify(["README.md", "out/Issue197.md"]), (False, False))

    def test_code_or_workflow_never_skips_full_suite(self):
        self.assertEqual(classify(["AGENTS.md", "src/features/cad-viewer/viewer.tsx"]), (True, False))
        self.assertEqual(classify([".github/workflows/pr-ci.yml"]), (True, True))
        self.assertEqual(classify(["src/package-lock.json"]), (True, True))
        self.assertEqual(classify(["src/Dockerfile"]), (True, True))
        self.assertEqual(classify(["src/scripts/prepare-migrator-package.mjs"]), (True, True))

    def test_manual_always_full_and_baseline(self):
        self.assertEqual(classify([], manual=True), (True, True))

    def test_empty_or_corrupt_diff_must_not_be_a_docs_only_pass(self):
        for raw in [b"", b"README.md", b"README.md\0\0", b"/etc/passwd\0",
                    b"out/../README.md\0", b"src\\x.md\0", b"\xff\0"]:
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                parse_paths(raw)
        with self.assertRaises(ValueError):
            classify([])

    def test_git_rename_source_to_markdown_forces_full_and_baseline(self):
        """Use a disposable Git repository; renames must expose the old source path."""
        with tempfile.TemporaryDirectory(prefix="ci197-rename-") as tmp:
            repo = Path(tmp)
            subprocess.run(["git", "init", "-q", str(repo)], check=True)
            (repo / "src").mkdir()
            (repo / "src/Dockerfile").write_text("FROM node:22\\nRUN echo build\\n")
            subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
            subprocess.run(["git", "-C", str(repo), "-c", "user.name=CI",
                            "-c", "user.email=ci@example.invalid", "commit", "-qm", "baseline"], check=True)
            (repo / "src/Dockerfile").rename(repo / "README.md")
            subprocess.run(["git", "-C", str(repo), "add", "-A"], check=True)
            subprocess.run(["git", "-C", str(repo), "-c", "user.name=CI",
                            "-c", "user.email=ci@example.invalid", "commit", "-qm", "rename"], check=True)
            raw = subprocess.check_output(["git", "-C", str(repo), "diff", "--no-renames",
                                           "--name-only", "-z", "HEAD~1", "HEAD"])
            paths = parse_paths(raw)
            self.assertEqual(set(paths), {"src/Dockerfile", "README.md"})
            self.assertEqual(classify(paths), (True, True))

    def test_workflow_uses_rename_safe_diff_and_retry_stable_artifact(self):
        workflow = (Path(__file__).resolve().parents[1] / "workflows/pr-ci.yml").read_text(encoding="utf-8")
        self.assertIn("git diff --no-renames --name-only -z", workflow)
        self.assertNotIn("production-build-${{ github.run_id }}-${{ github.run_attempt }}", workflow)
        self.assertEqual(workflow.count("production-build-${{ github.run_id }}"), 4)
        self.assertIn("overwrite: true", workflow)

    def test_nul_quoting_and_odd_filenames(self):
        self.assertEqual(parse_paths(b"README.md\0out/a b.md\0"), ["README.md", "out/a b.md"])


if __name__ == "__main__":
    unittest.main()
