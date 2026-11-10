"""Contract tests for the local verifier; no application test duplication."""
import json
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
CLI = ROOT / "src/scripts/verify_local.py"
SPEC = importlib.util.spec_from_file_location("verify_local", CLI)
VERIFY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFY)
DOCKER_SPEC = importlib.util.spec_from_file_location("verify_local_docker", ROOT / "src/scripts/verify_local_docker.py")
DOCKER_VERIFY = importlib.util.module_from_spec(DOCKER_SPEC)
DOCKER_SPEC.loader.exec_module(DOCKER_VERIFY)


class VerifyLocalContract(unittest.TestCase):
    def test_docs_actual_fail_fix_pass_and_immutable_evidence(self):
        with tempfile.TemporaryDirectory(prefix="verify-local-fixture-") as temp:
            root = Path(temp)
            (root / "src/scripts").mkdir(parents=True)
            (root / "out").mkdir()
            (root / "data").mkdir()
            shutil.copy(ROOT / "src/scripts/verify_local_docs.py", root / "src/scripts/verify_local_docs.py")
            shutil.copy(ROOT / "src/scripts/verify_local_docs_review.py", root / "src/scripts/verify_local_docs_review.py")
            (root / "src/package.json").write_text('{"name":"fixture","version":"0.0.0"}')
            (root / "src/package-lock.json").write_text('{"name":"fixture","version":"0.0.0"}')
            (root / ".gitignore").write_text("data/\nout/IssueEvidence/\n")
            def git(*args):
                return subprocess.check_output(["git", *args], cwd=root, text=True).strip()
            git("init", "-q")
            git("add", ".")
            subprocess.run(["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
                            "commit", "-qm", "baseline"], cwd=root, check=True)
            base = git("rev-parse", "HEAD")
            (root / "out/Guide.md").write_text("[missing](target.md)\n")
            def verify():
                env = {**os.environ, "QA_ACCESS_KEY": "private-fixture-secret-123456"}
                return subprocess.run([sys.executable, str(CLI), "run", "--root", str(root),
                                       "--issue", "281", "--profile", "docs", "--base", base,
                                       "--docs-review", "Fixture QA: reviewed private-fixture-secret-123456"],
                                      cwd=root, text=True, capture_output=True, env=env)
            failed = verify()
            self.assertEqual(failed.returncode, 1, failed.stderr)
            evidence = root / "out/IssueEvidence/281.md"
            failed_md = evidence.read_text()
            self.assertIn("FAIL", failed_md)
            first = json.loads(failed.stdout)["run"]
            first_json = root / "data/verify-local" / (first + ".json")
            raw = first_json.read_bytes()
            self.assertNotIn(b"private-fixture-secret-123456", raw)
            self.assertNotIn("private-fixture-secret-123456", failed_md)
            self.assertEqual(json.loads(raw)["cases"][0]["status"], "FAIL")
            (root / "out/target.md").write_text("# Fixed\n")
            passed = verify()
            self.assertEqual(passed.returncode, 0, passed.stderr)
            second = json.loads(passed.stdout)["run"]
            self.assertIn(failed_md, evidence.read_text())
            self.assertEqual(first_json.read_bytes(), raw)
            self.assertIn("PASS", evidence.read_text())
            self.assertIn(first, (root / "out/FailureLedger.md").read_text())
            note = subprocess.run([sys.executable, str(CLI), "annotate", "--root", str(root),
                                   "--issue", "281", "--run-id", first,
                                   "--cause", "broken fixture link", "--fix", "pending + fixture fingerprint",
                                   "--regression", "docs-links", "--retest", second],
                                  cwd=root, text=True, capture_output=True)
            self.assertEqual(note.returncode, 0, note.stderr)
            self.assertIn(second, evidence.read_text())
            (root / "data/verify-local/issue-281-orphan.json").write_text("{}")
            preserved = evidence.read_bytes()
            partial = verify()
            self.assertEqual(partial.returncode, 2)
            self.assertEqual(evidence.read_bytes(), preserved)

    def test_plan_rejects_downgrade_and_bad_base(self):
        with tempfile.TemporaryDirectory(prefix="verify-local-plan-") as temp:
            root = Path(temp)
            (root / "src").mkdir()
            (root / "src/package.json").write_text('{"name":"fixture","version":"0.0.0"}')
            (root / "src/package-lock.json").write_text('{"name":"fixture","version":"0.0.0"}')
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            subprocess.run(["git", "add", "."], cwd=root, check=True)
            subprocess.run(["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
                            "commit", "-qm", "baseline"], cwd=root, check=True)
            base = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
            (root / "src/server").mkdir()
            (root / "src/server/auth.ts").write_text("change\n")
            args = [sys.executable, str(CLI), "plan", "--root", str(root), "--issue", "281", "--profile", "docs", "--base"]
            self.assertEqual(subprocess.run(args + [base], cwd=root, capture_output=True).returncode, 2)
            self.assertEqual(subprocess.run(args + ["deadbeef"], cwd=root, capture_output=True).returncode, 2)

    def test_redaction_and_mandatory_not_run(self):
        value = VERIFY.redact("Authorization: Bearer ghp_12345678901234567890 https://user:password@example.org", [])
        self.assertNotIn("ghp_", value)
        self.assertNotIn("user:password", value)
        self.assertIn("[REDACTED]", value)
        opaque = VERIFY.redact('Authorization: Bearer opaqueCredential123456\nAuthorization: Basic dXNlcjpwYXNz\n{"token":"jsonToken987654","password":"jsonPassword654321"}', [])
        for canary in ("opaqueCredential123456", "dXNlcjpwYXNz", "jsonToken987654", "jsonPassword654321"):
            self.assertNotIn(canary, opaque)
        self.assertIn('"token":"[REDACTED]"', opaque)
        self.assertNotIn("private-token", json.dumps(VERIFY.redact_object({"argv": ["private-token"]}, ["private-token"])))
        item = {"id": "missing-gate", "argv": [], "cwd": ".", "required": True,
                "why": "prerequisite", "missing": "docker"}
        result = VERIFY.run_case(item, "fixture", [], "a" * 64)
        self.assertEqual(result["status"], "NOT RUN")
        self.assertNotEqual(result["status"], "PASS")

    def test_mixed_tooling_application_scope_requires_explicit_mapping(self):
        paths = ["src/scripts/verify_local.py", "src/app/new-feature/page.tsx"]
        plan = VERIFY.manifest("standard", [], paths)
        self.assertIn("cli-contract", [row["id"] for row in plan])
        self.assertIn("affected-review", [row["id"] for row in plan])
        selected = VERIFY.manifest("standard", [], paths, selected_unit=["tests/unit/example.test.ts"])
        self.assertIn("affected-review", [row["id"] for row in selected])
        both = VERIFY.manifest("standard", [], paths, selected_unit=["tests/unit/example.test.ts"],
                               selected_e2e=["tests/e2e/example.spec.ts"])
        self.assertNotIn("affected-review", [row["id"] for row in both])

    def test_unrelated_auth_risk_cannot_mask_generic_ui_selection(self):
        paths = ["src/scripts/verify_local.py", "src/app/page.tsx", "src/server/auth.ts"]
        baseline = VERIFY.manifest("high-risk", ["auth"], paths)
        self.assertIn("affected-review", [row["id"] for row in baseline])
        unit_only = VERIFY.manifest("high-risk", ["auth"], paths, selected_unit=["tests/unit/page.test.ts"])
        self.assertIn("--e2e", next(row["missing"] for row in unit_only if row["id"] == "affected-review"))
        e2e_only = VERIFY.manifest("high-risk", ["auth"], paths, selected_e2e=["tests/e2e/page.spec.ts"])
        self.assertIn("--unit", next(row["missing"] for row in e2e_only if row["id"] == "affected-review"))
        both = VERIFY.manifest("high-risk", ["auth"], paths,
                               selected_unit=["tests/unit/page.test.ts"], selected_e2e=["tests/e2e/page.spec.ts"])
        self.assertNotIn("affected-review", [row["id"] for row in both])

    def test_worker_real_integration_runs_once_per_plan(self):
        plan = VERIFY.manifest("high-risk", ["worker"], ["src/server/worker.ts"])
        worker_file = "tests/integration/scene-cpu-worker-real-g7.test.ts"
        owners = [row["id"] for row in plan if worker_file in row["argv"]]
        self.assertEqual(owners, ["scene-worker-integration"])

    def test_standalone_start_parser_rejects_hostname_flag(self):
        script = ("import {standalonePort} from './scripts/standalone.mjs'; "
                  "if (standalonePort([], '3100') !== '3100') process.exit(2); "
                  "try { standalonePort(['--hostname', '127.0.0.1', '--port', '3100']); process.exit(3) } "
                  "catch (error) { if (!String(error).includes('Usage:')) process.exit(4) }")
        result = subprocess.run(["node", "--input-type=module", "-e", script],
                                cwd=ROOT / "src", capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_child_receives_owned_storage_and_no_inherited_credentials(self):
        with tempfile.TemporaryDirectory(prefix="verify-local-child-") as temp:
            root = Path(temp)
            (root / "src").mkdir()
            before = VERIFY.ROOT, VERIFY.LOGS
            try:
                VERIFY.ROOT, VERIFY.LOGS = root, root / "data/verify-local"
                inherited = {"DATABASE_URL": "file:/production/db.sqlite",
                             "CAD_STORAGE_PATH": "/production/cad", "CAD_STORAGE_BACKEND": "s3",
                             "GH_TOKEN": "ghp_private-canary-123456", "GIT_ASKPASS": "/production/credential",
                             "remote_repo_token": "remote-private-canary",
                             "AWS_ACCESS_KEY_ID": "aws-private-canary",
                             "AWS_PROFILE": "production", "G7_DEPLOY_APP_IMAGE": "production-image"}
                probe = ("import json,os; print(json.dumps({"
                         "'db':os.getenv('DATABASE_URL'),'cad':os.getenv('CAD_STORAGE_PATH'),"
                         "'backend':os.getenv('CAD_STORAGE_BACKEND'),"
                         "'forbidden':sorted(k for k in os.environ if k.startswith(('GH_','GIT_','AWS_','G7_','remote_repo')))}))")
                item = {"id": "env-sandbox", "argv": [sys.executable, "-c", probe],
                        "cwd": "src", "required": True, "why": "isolation", "timeout_seconds": 10}
                with patch.dict(os.environ, inherited):
                    result = VERIFY.run_case(item, "issue-281-env-fixture", list(inherited.values()), "a" * 64)
                self.assertEqual(result["status"], "PASS")
                line = (root / result["log"]).read_text().splitlines()[0]
                observed = json.loads(line)
                self.assertEqual(observed["db"], "file:" + str(VERIFY.LOGS / "issue-281-env-fixture/runtime/verify.sqlite"))
                self.assertEqual(observed["cad"], str(VERIFY.LOGS / "issue-281-env-fixture/runtime/cad"))
                self.assertEqual(observed["backend"], "local")
                self.assertEqual(observed["forbidden"], [])
            finally:
                VERIFY.ROOT, VERIFY.LOGS = before

    def test_docker_volume_is_removed_after_failed_owned_check(self):
        if shutil.which("docker") is None or subprocess.run(["docker", "info"],
                capture_output=True, timeout=5).returncode:
            self.skipTest("local Docker daemon unavailable")
        name = None
        with self.assertRaisesRegex(RuntimeError, "disposable fixture failure"):
            with DOCKER_VERIFY.owned_volume("issue-281-volume-fixture", "failure") as name:
                info = json.loads(subprocess.check_output(["docker", "volume", "inspect", name]))[0]
                self.assertEqual(info["Labels"]["com.planner77.run-id"], "issue-281-volume-fixture")
                raise RuntimeError("disposable fixture failure")
        self.assertIsNotNone(name)
        self.assertNotEqual(subprocess.run(["docker", "volume", "inspect", name],
                                          capture_output=True, timeout=5).returncode, 0)

    def test_symlink_evidence_path_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            external = root / "external"
            external.mkdir()
            (root / "out").mkdir()
            (root / "out/IssueEvidence").symlink_to(external, target_is_directory=True)
            before = VERIFY.EVIDENCE, VERIFY.LOGS, VERIFY.ROOT
            try:
                VERIFY.ROOT = root
                VERIFY.EVIDENCE = root / "out/IssueEvidence"
                VERIFY.LOGS = root / "data/verify-local"
                with self.assertRaisesRegex(ValueError, "symlink"):
                    VERIFY.append_evidence("281", {"id": "fixture"}, {})
                self.assertFalse((root / "data").exists())
            finally:
                VERIFY.EVIDENCE, VERIFY.LOGS, VERIFY.ROOT = before


if __name__ == "__main__":
    unittest.main()
