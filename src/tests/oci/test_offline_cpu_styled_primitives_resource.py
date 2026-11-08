"""FUP3 supervisor guard regressions. No Docker, CAD or process launch."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("offline_resource", Path(__file__).with_name("offline-cpu-styled-primitives-resource-proof.py"))
proof = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proof)


class ResourceContract(unittest.TestCase):
    def row(self):
        self.cid, self.nonce, self.source = "a" * 64, "b" * 32, Path("/synthetic/proof")
        return {"Id": self.cid, "Name": "/fup3-" + self.nonce + "-normal", "Image": proof.IMAGE,
                "Config": {"User": "10001:10001", "Entrypoint": ["node"],
                           "Cmd": ["/proof/offline-cpu-styled-primitives-resource-child.mjs", "normal"],
                           "Labels": {"com.planner77.purpose": proof.PURPOSE, "com.planner77.fup3.nonce": self.nonce}},
                "HostConfig": {"NetworkMode": "none", "PortBindings": {}, "ReadonlyRootfs": True,
                               "Memory": 768 * 1024 * 1024, "MemorySwap": 768 * 1024 * 1024,
                               "NanoCpus": 1_000_000_000, "PidsLimit": 64, "CapDrop": ["ALL"],
                               "Privileged": False, "PidMode": "", "Devices": [], "DeviceRequests": [],
                               "SecurityOpt": ["no-new-privileges"],
                               "Tmpfs": {"/tmp": "rw,noexec,nosuid,size=96m,mode=1777",
                                         "/data": "ro,noexec,nosuid,size=1m,mode=0555"}},
                "Mounts": [{"Type": "bind", "Source": str(self.source), "Destination": "/proof", "RW": False}]}

    def check(self, row):
        proof.check(row, cid=self.cid, nonce=self.nonce, source=self.source, mode="normal")

    def test_exact_resource_boundary_and_empty_data_tmpfs(self):
        row = self.row()
        self.check(row)
        row["Mounts"].append({"Type": "tmpfs", "Destination": "/data"})
        self.check(row)

    def test_refuses_wrong_identity_or_unsafe_runtime(self):
        base = self.row()
        changes = [("NetworkMode", "bridge"), ("ReadonlyRootfs", False), ("Memory", 0),
                   ("PidsLimit", 0), ("Privileged", True), ("PidMode", "host"),
                   ("PortBindings", {"3000/tcp": [{"HostPort": "3000"}]}),
                   ("DeviceRequests", [{"Capabilities": [["gpu"]]}])]
        for key, value in changes:
            with self.subTest(key=key):
                row = copy.deepcopy(base)
                row["HostConfig"][key] = value
                with self.assertRaises(ValueError):
                    self.check(row)
        row = copy.deepcopy(base)
        row["Image"] = "other"
        with self.assertRaises(ValueError):
            self.check(row)

    def test_refuses_anonymous_or_real_data_volume(self):
        row = self.row()
        row["Mounts"].append({"Type": "volume", "Destination": "/data"})
        with self.assertRaises(ValueError):
            self.check(row)
        row = self.row()
        row["Mounts"][0]["RW"] = True
        with self.assertRaises(ValueError):
            self.check(row)

    def receipt(self):
        self.hashes = {name: "a" * 64 for name in proof.SOURCE_NAMES}
        return {"mode": "normal", "state": "CANDIDATE", "builder": "node-cpu-styled-primitives@0.1.0+cad-scene-1",
                "primitiveCount": 6, "segmentCount": 57, "visiblePrimitiveCount": 3, "payloadSha256": "a" * 64,
                "payloadBytes": 2048, "readback": True, "tempClean": True, "sourceHashes": self.hashes}

    def raw(self, value):
        return ("untrusted private canary\nOFFLINE_RESOURCE_RECEIPT:" + json.dumps(value) + "\n").encode()

    def test_projects_one_exact_receipt_and_binds_source_hashes(self):
        value = self.receipt()
        result = proof.parse_receipt(self.raw(value), self.hashes, "normal")
        self.assertNotIn("canary", json.dumps(result))
        value["sourceHashes"] = {"fake": "b" * 64}
        with self.assertRaises(ValueError):
            proof.parse_receipt(self.raw(value), self.hashes, "normal")

    def test_refuses_ready_extra_fields_bad_sha_counts_and_duplicate_receipts(self):
        for key, replacement in [("state", "READY"), ("secret", "canary"),
                                 ("payloadSha256", "z" * 64), ("segmentCount", True),
                                 ("segmentCount", 5001), ("visiblePrimitiveCount", 4),
                                 ("primitiveCount", 5), ("payloadBytes", 0)]:
            with self.subTest(key=key):
                value = self.receipt()
                value[key] = replacement
                with self.assertRaises(ValueError):
                    proof.parse_receipt(self.raw(value), self.hashes, "normal")
        value = self.receipt()
        with self.assertRaises(ValueError):
            proof.parse_receipt(self.raw(value) + self.raw(value), self.hashes, "normal")

    def test_success_looking_partial_receipt_never_accepts_failed_exit(self):
        value = self.receipt()
        self.assertEqual(proof.parse_receipt(self.raw(value), self.hashes, "normal"), value)
        for kwargs in [dict(deadline_hit=False, elapsed=1, returncode=1, exit_code=1, output=self.raw(value)),
                       dict(deadline_hit=True, elapsed=120, returncode=137, exit_code=137, output=self.raw(value))]:
            with self.assertRaises(ValueError):
                proof.accept_termination("normal", **kwargs)
        with self.assertRaises(ValueError):
            proof.accept_termination("stall", deadline_hit=False, elapsed=1, returncode=0,
                                     exit_code=0, output=self.raw(value))
        self.assertFalse(proof.accept_termination("stall", deadline_hit=True, elapsed=120,
                                                 returncode=137, exit_code=137,
                                                 output=self.raw(value) + b"OFFLINE_RESOURCE_STALL_ARMED"))

    def test_atomic_private_receipt_survives_replace_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            proof.write(root, "receipt.json", {"old": True})
            with patch.object(proof.os, "replace", side_effect=OSError("fault")):
                with self.assertRaises(OSError):
                    proof.write(root, "receipt.json", {"new": True})
            self.assertEqual(json.loads((root / "receipt.json").read_text()), {"old": True})
            self.assertEqual((root / "receipt.json").stat().st_mode & 0o777, 0o600)
            self.assertEqual(len(list(root.iterdir())), 1)


if __name__ == "__main__":
    unittest.main()
