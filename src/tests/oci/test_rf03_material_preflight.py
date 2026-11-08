#!/usr/bin/env python3
"""RF-03 material preflight tests: byte binding is never signed release authority."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import release_finalizer as rf
import rf03_material_preflight as material
import rf03_release_handoff as handoff
import candidate_policy as candidate
from test_rf03_release_handoff import receipt


class MaterialTests(unittest.TestCase):
    def fixture(self, root):
        packet, plan = receipt()
        values = {
            "candidate-receipt.json": b'{"kind":"candidate"}',
            "candidate-bundle.sigstore.json": b'{"verificationMaterial":{}}',
            "verification.json": b'{"claimed":"verified"}',
        }
        for name, raw in values.items():
            (root / name).write_bytes(raw)
        sums = "".join(
            (packet["roles"][role]["manifestDigest"][7:] if role != "receipt"
             else material.sha(values["candidate-receipt.json"])) +
            "  " + candidate.SUBJECTS[role] + "\n"
            for role in (*handoff.ROLES, "receipt"))
        (root / "SHA256SUMS").write_text(sums)
        packet["artifact"]["candidateReceiptSha256"] = material.sha(values["candidate-receipt.json"])
        packet["artifact"]["signatureBundleSha256"] = material.sha(values["candidate-bundle.sigstore.json"])
        packet["artifact"]["verificationSha256"] = material.sha(values["verification.json"])
        for role in packet["roles"].values():
            role["candidateReceiptSha256"] = packet["artifact"]["candidateReceiptSha256"]
        return packet, plan

    def test_valid_bytes_still_block_release(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            packet, plan = self.fixture(root)
            result = material.check(root, packet, plan)
            self.assertEqual(result["state"],
                             "BLOCKED_INDEPENDENT_SIGSTORE_AND_OCI_PROOF_REQUIRED")
            self.assertEqual(result["signatureVerification"], "NOT_VERIFIED")
            self.assertEqual(result["registryPublication"], "NOT_RUN")
            self.assertEqual(result["externalWrites"], 0)

    def test_changed_bytes_and_claims_are_rejected(self):
        for name, value, code in (
            ("candidate-receipt.json", b'{"kind":"different"}',
             "RF03_MATERIAL_RECEIPT_HASH_INVALID"),
            ("candidate-bundle.sigstore.json", b'{"invalid":true}',
             "RF03_MATERIAL_BUNDLE_HASH_INVALID"),
            ("verification.json", b'{"claimed":"changed"}',
             "RF03_MATERIAL_VERIFICATION_HASH_INVALID"),
        ):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                packet, plan = self.fixture(root)
                (root / name).write_bytes(value)
                with self.assertRaisesRegex(rf.Blocked, code):
                    material.check(root, packet, plan)

    def test_path_and_checksum_attacks_rejected(self):
        for attack in ("extra", "missing", "symlink", "duplicate", "traversal"):
            with self.subTest(attack=attack), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                packet, plan = self.fixture(root)
                if attack == "extra":
                    (root / "unexpected").write_text("x")
                elif attack == "missing":
                    (root / "verification.json").unlink()
                elif attack == "symlink":
                    (root / "verification.json").unlink()
                    (root / "verification.json").symlink_to("/etc/passwd")
                elif attack == "duplicate":
                    with (root / "SHA256SUMS").open("a") as stream:
                        stream.write(material.sha(b'{"kind":"candidate"}') +
                                     "  candidate-receipt.json\n")
                elif attack == "traversal":
                    raw = (root / "SHA256SUMS").read_text()
                    (root / "SHA256SUMS").write_text(raw.replace(
                        "candidate-receipt.json", "../candidate-receipt.json"))
                with self.assertRaises(rf.Blocked):
                    material.check(root, packet, plan)

    def test_duplicate_json_field_and_legacy_version_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            packet, plan = self.fixture(root)
            raw = b'{"x":1,"x":2}'
            (root / "verification.json").write_bytes(raw)
            packet["artifact"]["verificationSha256"] = material.sha(raw)
            (root / "SHA256SUMS").write_text("".join(
                (packet["roles"][role]["manifestDigest"][7:] if role != "receipt"
                 else material.sha((root / "candidate-receipt.json").read_bytes())) +
                "  " + candidate.SUBJECTS[role] + "\n"
                for role in (*handoff.ROLES, "receipt")))
            with self.assertRaisesRegex(rf.Blocked, "RF03_DUPLICATE_JSON_KEY"):
                material.check(root, packet, plan)
            packet["version"] = "0.61.0"
            with self.assertRaises(rf.Blocked):
                material.check(root, packet, plan)


    def test_json_rejection_reason_is_not_masked(self):
        for raw, code in (
            (b'{"x":1,"x":2}', "RF03_DUPLICATE_JSON_KEY"),
            (b'{"broken":', "RF03_MATERIAL_JSON_INVALID"),
            (b'{"number":NaN}', "RF03_MATERIAL_JSON_INVALID"),
            (b'{"number":Infinity}', "RF03_MATERIAL_JSON_INVALID"),
        ):
            with self.subTest(raw=raw), self.assertRaisesRegex(
                    rf.Blocked, "^" + code + "$"):
                material.parse_json(raw)



if __name__ == "__main__":
    unittest.main()
