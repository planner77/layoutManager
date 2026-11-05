#!/usr/bin/env python3
"""Focused fail-closed checks for RR2 owned child cleanup."""
import ast
import importlib.util
import inspect
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


if __name__ == "__main__":
    unittest.main()
