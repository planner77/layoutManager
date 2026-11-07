"""FUP1 preparation/partial cleanup fault tests: no Docker or operating data."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("auth_clone", Path(__file__).with_name("or58-auth-clone.py"))
clone = importlib.util.module_from_spec(spec)
spec.loader.exec_module(clone)


class CloneHarness(unittest.TestCase):
    def state(self):
        nonce = "a" * 32
        return {"nonce": nonce, "volume": "or58-" + nonce, "name": "or58-" + nonce + "-app",
                "network": "or58-" + nonce + "-net", "networkId": "b" * 64}

    def test_atomic_write_keeps_prior_receipt_on_replace_failure(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            clone.write(root, "state.json", {"prior": True})
            with patch.object(clone.os, "replace", side_effect=OSError("injected")):
                with self.assertRaises(OSError):
                    clone.write(root, "state.json", {"new": True})
            self.assertEqual(json.loads((root / "state.json").read_text()), {"prior": True})
            self.assertEqual(len(list(root.iterdir())), 1)
            self.assertEqual((root / "state.json").stat().st_mode & 0o777, 0o600)

    def test_prepare_unpacks_original_and_stops_before_existing_volume(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            archive = root / "capture.tar"
            archive.write_bytes(b"fake archive")
            app = {"State": {"Health": {"Status": "healthy"}}}
            env = {"G7_GREENFIELD_MODE": "true", "G7_GREENFIELD_AUTOMATED": "true", "G7_AUTH_ENABLED": "true"}
            with patch.object(clone, "EXPECTED_ARCHIVE", hashlib.sha256(archive.read_bytes()).hexdigest()), \
                 patch.object(clone.proof, "safe_tar_members"), \
                 patch.object(clone.proof, "original", return_value=(app, {})), \
                 patch.object(clone.proof, "installation_from_archive", return_value={}), \
                 patch.object(clone.proof, "clone_env", return_value=env) as environment, \
                 patch.object(clone.proof, "volume_exists", return_value=True), \
                 patch.object(clone.proof, "docker") as docker:
                with self.assertRaises(clone.proof.Blocked):
                    clone.prepare(root, archive)
                environment.assert_called_once_with(app, {})
                docker.assert_not_called()

    def test_archive_mismatch_never_calls_docker(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            archive = root / "capture.tar"
            archive.write_bytes(b"wrong")
            with patch.object(clone.proof, "docker") as docker:
                with self.assertRaises(clone.proof.Blocked):
                    clone.prepare(root, archive)
                docker.assert_not_called()

    def test_cleanup_explicit_absent_network_accepts_partial_restore(self):
        with tempfile.TemporaryDirectory() as d, \
             patch.object(clone, "owned_volume"), \
             patch.object(clone.proof, "attached", return_value=[]), \
             patch.object(clone.proof, "docker", return_value=b"") as docker:
            result = clone.cleanup(Path(d), self.state())
            self.assertTrue(result["newRestoreVolumeRetained"])
            self.assertEqual(docker.call_count, 1)
            self.assertEqual(docker.call_args.args[:2], ("network", "ls"))

    def test_cleanup_rejects_same_name_different_network_id(self):
        state = self.state()
        network = {"Id": "c" * 64, "Name": state["network"], "Internal": True,
                   "Containers": {}, "Labels": {clone.proof.OWNER_LABEL: state["nonce"], "com.planner77.purpose": clone.PURPOSE}}
        with tempfile.TemporaryDirectory() as d, \
             patch.object(clone, "owned_volume"), \
             patch.object(clone.proof, "attached", return_value=[]), \
             patch.object(clone.proof, "docker", return_value=(network["Id"] + "\n").encode()) as docker, \
             patch.object(clone.proof, "inspect", return_value=network):
            with self.assertRaises(clone.proof.Blocked):
                clone.cleanup(Path(d), state)
            self.assertEqual(docker.call_count, 1)  # No deletion after identity mismatch.


if __name__ == "__main__":
    unittest.main()
