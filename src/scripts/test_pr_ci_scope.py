#!/usr/bin/env python3
"""#197 standalone scope contract: run before every conditional PR CI job."""
import unittest

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

    def test_nul_quoting_and_odd_filenames(self):
        self.assertEqual(parse_paths(b"README.md\0out/a b.md\0"), ["README.md", "out/a b.md"])


if __name__ == "__main__":
    unittest.main()
