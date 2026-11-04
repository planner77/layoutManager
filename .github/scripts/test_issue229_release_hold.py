#!/usr/bin/env python3
"""#229 fail-closed policy and workflow wiring regressions."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from issue229_release_hold import ReleaseHoldError, decide

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/docker-publish.yml"


class ReleaseHoldTests(unittest.TestCase):
    def test_historical_release_behavior_preserved(self):
        for release in ("0.56.0", "0.58.1", "0.60.0", "0.60.99"):
            for ref in ("refs/heads/main", "refs/tags/v" + release):
                self.assertEqual(decide(ref, release), "ALLOW_LEGACY")

    def test_future_main_stays_held_irrespective_of_subject_or_next_version(self):
        for release in ("0.61.0", "0.61.1", "0.62.0", "1.0.0"):
            self.assertEqual(decide("refs/heads/main", release), "HOLD_MAIN")

    def test_future_tag_cannot_promote_unapproved_pair_or_alias(self):
        for release in ("0.61.0", "0.61.1", "0.62.0", "1.0.0"):
            for tag in ("refs/tags/v" + release, "refs/tags/v0.60.0"):
                with self.subTest(release=release, tag=tag):
                    with self.assertRaisesRegex(ReleaseHoldError, "G7_RELEASE_HOLD_TAG_BLOCKED"):
                        decide(tag, release)

    def test_invalid_ref_or_version_fails_closed(self):
        for ref in ("refs/heads/feature", "refs/pull/228/merge", "refs/tags/0.61.0",
                    "refs/tags/v0.61.0-extra", "refs/tags/v0.61.0/evil", ""):
            with self.assertRaises(ReleaseHoldError):
                decide(ref, "0.61.0")
        for release in ("", "0.61", "0.61.0-rc1", "0.061.0", "v0.61.0",
                        "999999999999999.0.0", " 0.61.0"):
            with self.assertRaises(ReleaseHoldError):
                decide("refs/heads/main", release)

    def test_cli_missing_or_malformed_version_and_protected_tag_have_nonzero_exit(self):
        with tempfile.TemporaryDirectory(prefix="issue229-gate-") as folder:
            p = Path(folder) / "package.json"
            for data in ('{"version":"0.61.0"}', '{"version":null}', "{invalid"):
                p.write_text(data, encoding="utf-8")
                command = subprocess.run([sys.executable,
                    str(ROOT / ".github/scripts/issue229_release_hold.py"),
                    "refs/tags/v0.61.0", str(p)], capture_output=True,
                    text=True, check=False)
                self.assertNotEqual(command.returncode, 0)
                self.assertNotIn("ALLOW_LEGACY", command.stdout)
            p.write_text(json.dumps({"version": "0.61.0"}), encoding="utf-8")
            ok = subprocess.run([sys.executable,
                str(ROOT / ".github/scripts/issue229_release_hold.py"),
                "refs/heads/main", str(p)], capture_output=True,
                text=True, check=False)
            self.assertEqual(ok.returncode, 0, ok.stderr)
            self.assertEqual(ok.stdout.strip(), "HOLD_MAIN")

    def test_workflow_guards_scope_and_build_before_side_effects(self):
        text = WORKFLOW.read_text(encoding="utf-8")
        scope = text.split("      - name: Check changed paths before GHCR publication\n", 1)[1].split(
            "\n  build-and-push:", 1)[0]
        self.assertIn("issue229_release_hold.py", scope)
        self.assertLess(scope.index("issue229_release_hold.py"),
                        scope.index('echo "publish=$publish"'))
        self.assertIn('HOLD_MAIN) publish=false', scope)
        self.assertIn('test -s .github/workflows/pr-ci.yml', scope)
        build = text.split("  build-and-push:", 1)[1]
        self.assertIn("Block unapproved candidate release before GHCR mutation (#229)", build)
        self.assertLess(build.index("Block unapproved candidate release before GHCR mutation (#229)"),
                        build.index("Create release tag from package version"))
        self.assertLess(build.index("Block unapproved candidate release before GHCR mutation (#229)"),
                        build.index("Log in to GHCR"))
        self.assertIn("release-scope.outputs.publish == 'true'", build)
        self.assertIn('G7_RELEASE_HOLD_BUILD_DENIED', build)
        self.assertIn("G7_RELEASE_TAG_SOURCE_MISMATCH", text)
        self.assertIn("G7_RELEASE_PARTIAL_PAIR", text)


if __name__ == "__main__":
    unittest.main()
