#!/usr/bin/env python3
"""Focused fail-closed checks for RR2 owned child cleanup."""
import ast
import importlib.util
import inspect
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    "rr2_proof", Path(__file__).with_name("rr2-recovery-proof.py"))
PROOF = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROOF)


class CleanupTest(unittest.TestCase):
    def test_host_helper_calls_use_supported_keywords(self):
        tree = ast.parse(Path(PROOF.__file__).read_text())
        accepted = set(inspect.signature(PROOF.host_run).parameters)
        sites = [node for node in ast.walk(tree) if isinstance(node, ast.Call)
                 and isinstance(node.func, ast.Name) and node.func.id == 'host_run']
        self.assertGreaterEqual(len(sites), 2)
        for site in sites:
            self.assertTrue(all(keyword.arg in accepted for keyword in site.keywords))

    def receipt(self, directory):
        nonce = "1234567890abcdef"
        name = "layoutmanager-rr2-host-" + nonce + "-11223344"
        return {"nonce": nonce, "root": directory,
                "hostChildren": [{"name": name, "nonce": nonce,
                                  "cidFile": str(Path(directory) / (name + ".cid")),
                                  "image": "sha256:" + "a" * 64,
                                  "engineImageId": "sha256:" + "a" * 64,
                                  "volumes": ["owned"]}]}

    def test_unknown_cid_never_killed(self):
        with tempfile.TemporaryDirectory() as directory:
            receipt = self.receipt(directory)
            name = receipt["hostChildren"][0]["name"]
            observed = {"Id": "b" * 64, "Name": "/" + name}
            with patch.object(PROOF, "optional_docker", return_value=observed), \
                    patch.object(PROOF, "run") as docker_run:
                with self.assertRaisesRegex(PROOF.Blocked, "RR2_CHILD_CID_UNPROVEN"):
                    PROOF.cleanup_namespace(receipt)
                docker_run.assert_not_called()

    def test_foreign_label_never_killed(self):
        with tempfile.TemporaryDirectory() as directory:
            receipt = self.receipt(directory)
            row = receipt["hostChildren"][0]
            cid = "b" * 64
            Path(row["cidFile"]).write_text(cid + "\n")
            observed = {"Id": cid, "Name": "/" + row["name"],
                        "Image": row["engineImageId"],
                        "Config": {"Image": row["image"], "Labels": {
                            "com.planner77.purpose": "foreign",
                            "com.planner77.rr2.nonce": receipt["nonce"]}},
                        "Mounts": [{"Destination": "/data", "Name": "owned"}],
                        "HostConfig": {"NetworkMode": "none"}}
            with patch.object(PROOF, "optional_docker", return_value=observed), \
                    patch.object(PROOF, "run") as docker_run:
                with self.assertRaisesRegex(PROOF.Blocked,
                                            "RR2_CHILD_CLEANUP_OWNERSHIP_INVALID"):
                    PROOF.cleanup_owned_children(receipt)
                docker_run.assert_not_called()


    def test_rr2_release_version_tracks_package_and_rejects_unregistered_format(self):
        with tempfile.TemporaryDirectory() as directory:
            package = Path(directory) / "src/package.json"
            package.parent.mkdir(parents=True)
            with patch.object(PROOF, "ROOT", Path(directory)):
                for version in ("0.61.0", "0.61.1", "0.62.0"):
                    package.write_text(json.dumps({"version": version}))
                    self.assertEqual(PROOF.current_candidate_version(), version)
                for version in ("0.60.0", "0.61.1-rc.1", "1.01.0", "untrusted"):
                    package.write_text(json.dumps({"version": version}))
                    with self.assertRaisesRegex(PROOF.Blocked,
                                                "RR2_CURRENT_RELEASE_VERSION_INVALID"):
                        PROOF.current_candidate_version()
                package.unlink()
                with self.assertRaisesRegex(PROOF.Blocked, "RR2_CURRENT_RELEASE_VERSION_INVALID"):
                    PROOF.current_candidate_version()

    def test_timeout_probe_rejects_receipt_and_image_version_mismatch(self):
        spec = importlib.util.spec_from_file_location(
            "rr2_timeout_probe", Path(__file__).with_name("rr2-timeout-probe.py"))
        probe = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(probe)
        ref = "127.0.0.1:5000/rr1-release@sha256:" + "b" * 64
        engine = "sha256:" + "c" * 64
        receipt = {
            "kind": "RR1_LOCAL_UNSIGNED_REGISTRY_RECEIPT",
            "version": "0.61.1", "sourceCommit": "a" * 40,
            "refs": {"cpu-worker": ref},
            "manifests": {"cpu-worker": {
                "digest": "sha256:" + "b" * 64, "configDigest": engine}},
        }
        observed = {
            "RepoDigests": [ref], "Os": "linux", "Architecture": "amd64",
            "Id": engine, "Config": {"Labels": {
                "org.opencontainers.image.source": "https://github.com/planner77/layoutManager",
                "org.opencontainers.image.revision": "a" * 40,
                "org.opencontainers.image.version": "0.61.1",
                "com.planner77.g7.image-role": "cpu-worker",
            }},
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "receipt.json"
            with patch.object(probe.PROOF, "current_candidate_version", return_value="0.61.1"):
                with patch.object(probe.PROOF, "docker_one", return_value=observed) as inspected:
                    path.write_text(json.dumps(receipt))
                    self.assertEqual(probe.checked_input(path), (ref, engine))
                    inspected.assert_called_with("image", "inspect", ref)
                    receipt["version"] = "0.60.0"
                    path.write_text(json.dumps(receipt))
                    with self.assertRaisesRegex(probe.PROOF.Blocked,
                                                "RR2_PROBE_INPUT_RECEIPT_INVALID"):
                        probe.checked_input(path)
                    receipt["version"] = "0.61.1"
                    path.write_text(json.dumps(receipt))
                    observed["Config"]["Labels"]["org.opencontainers.image.version"] = "0.60.0"
                    with self.assertRaisesRegex(probe.PROOF.Blocked,
                                                "RR2_PROBE_IMAGE_SOURCE_MISMATCH"):
                        probe.checked_input(path)


if __name__ == "__main__":
    unittest.main()
