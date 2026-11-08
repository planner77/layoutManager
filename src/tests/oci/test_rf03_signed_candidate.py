#!/usr/bin/env python3
"""RF-03 candidate signer verification regressions: all synthetic, never GO."""
from __future__ import annotations

import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

import candidate_policy as ca
import candidate_publish as legacy
import release_finalizer as rf
import rf03_material_preflight as material
import rf03_oci_readback as oci
import rf03_release_handoff as handoff
import rf03_signed_candidate as signed
from test_rf03_oci_readback import fixture


def setup_case(directory):
    root = Path(directory)
    packet, prior, store = fixture(index=True)
    oci.check(packet, prior, store, root)
    artifact = root / "downloaded"; artifact.mkdir()
    r = packet["candidate"]
    roles = {}
    for role in handoff.ROLES:
        claim = packet["roles"][role]
        roles[role] = {
            "subjectName": ca.SUBJECTS[role],
            "candidateRef": claim["candidateRef"],
            "digestRef": rf.PACKAGE + "@" + claim["manifestDigest"],
            "manifestDigest": claim["manifestDigest"],
            "configDigest": claim["configDigest"],
            "platformManifestDigest": claim["platformManifestDigest"],
        }
    receipt = {
        "kind": "GHCR_CANDIDATE_RECEIPT_V1",
        "repository": rf.REPO,
        "repositoryId": rf.REPO_ID,
        "repositoryOwnerId": rf.OWNER_ID,
        "sourceCommit": packet["sourceCommit"],
        "sourceTree": packet["sourceTree"],
        "workflowCommit": packet["sourceCommit"],
        "runId": str(r["runId"]),
        "runAttempt": "1",
        "packetSha256": r["packetSha256"],
        "workflowPath": handoff.CANDIDATE_WORKFLOW,
        "version": packet["version"],
        "platform": "linux/amd64",
        "packageId": packet["packageId"],
        "visibility": "private",
        "roles": roles,
    }
    files = {
        "candidate-receipt.json": json.dumps(receipt, sort_keys=True).encode(),
        "candidate-bundle.sigstore.json": b'{"verificationMaterial":{}}',
        "verification.json": b'{"verdict":"CLAIM_ONLY_NOT_VERIFIED"}',
    }
    for name, raw in files.items():
        (artifact / name).write_bytes(raw)
    raw_sums = "".join(
        (packet["roles"][role]["manifestDigest"][7:] if role != "receipt"
         else material.sha(files["candidate-receipt.json"])) +
        "  " + ca.SUBJECTS[role] + "\n"
        for role in (*handoff.ROLES, "receipt"))
    (artifact / "SHA256SUMS").write_text(raw_sums)
    packet["artifact"]["candidateReceiptSha256"] = material.sha(
        files["candidate-receipt.json"])
    packet["artifact"]["signatureBundleSha256"] = material.sha(
        files["candidate-bundle.sigstore.json"])
    packet["artifact"]["verificationSha256"] = material.sha(
        files["verification.json"])
    for claim in packet["roles"].values():
        claim["candidateReceiptSha256"] = packet["artifact"]["candidateReceiptSha256"]
    return packet, prior, artifact


def cli_result(packet, mapping):
    subjects = [{"name": ca.SUBJECTS[role],
                 "digest": {"sha256": mapping[role]}}
                for role in (*handoff.ROLES, "receipt")]
    cert = {
        "sourceRepositoryIdentifier": str(rf.REPO_ID),
        "sourceRepositoryOwnerIdentifier": str(rf.OWNER_ID),
        "sourceRepositoryURI": "https://github.com/" + rf.REPO,
        "sourceRepositoryDigest": packet["sourceCommit"],
        "sourceRepositoryRef": "refs/heads/main",
        "buildSignerURI": ca.SIGNER_URI,
        "buildSignerDigest": packet["sourceCommit"],
        "runnerEnvironment": "github-hosted",
        "issuer": "https://token.actions.githubusercontent.com",
        "runInvocationURI": "https://github.com/" + rf.REPO +
                            "/actions/runs/" + str(packet["candidate"]["runId"]) +
                            "/attempts/1",
    }
    return [{
        "verificationResult": {
            "signature": {"certificate": cert},
            "statement": {
                "subject": subjects,
                "predicateType": "https://slsa.dev/provenance/v1",
            },
        },
    }]


class SignedCandidateTests(unittest.TestCase):
    def test_all_four_signed_subject_bytes_bind_to_handoff(self):
        with tempfile.TemporaryDirectory() as folder:
            packet, plan, artifact = setup_case(folder)
            paths, hashes, bundle = signed.prepare(
                packet, plan, artifact, folder)
            self.assertEqual(set(paths), set((*handoff.ROLES, "receipt")))
            self.assertEqual(hashes["receipt"],
                             packet["artifact"]["candidateReceiptSha256"])
            self.assertEqual(len(set(hashes.values())), 4)
            self.assertEqual(bundle.name, "candidate-bundle.sigstore.json")
            for role in handoff.ROLES:
                self.assertEqual(hashes[role],
                                 packet["roles"][role]["manifestDigest"][7:])

    def test_signed_receipt_cannot_relabel_source_run_or_roles(self):
        with tempfile.TemporaryDirectory() as folder:
            packet, plan, artifact = setup_case(folder)
            rec = json.loads((artifact / "candidate-receipt.json").read_text())
            for field, value in (
                ("sourceCommit", "a"*40),
                ("runId", "999"),
                ("version", "0.61.0"),
                ("workflowPath", ".github/workflows/evil.yml"),
                ("visibility", "public"),
            ):
                with self.subTest(field=field):
                    wrong = dict(rec)
                    wrong[field] = value
                    with self.assertRaisesRegex(
                            rf.Blocked, "RF03_SIGNED_RECEIPT_IDENTITY_INVALID"):
                        signed.receipt_identity(wrong, packet)
            wrong = json.loads(json.dumps(rec))
            wrong["roles"]["app"]["configDigest"] = "sha256:" + "f"*64
            with self.assertRaisesRegex(rf.Blocked, "RF03_SIGNED_RECEIPT_ROLE_DRIFT"):
                signed.receipt_identity(wrong, packet)

    def test_manifest_byte_tamper_and_bad_artifact_hash_fail_closed(self):
        for what in ("manifest", "bundle", "missing"):
            with self.subTest(what=what), tempfile.TemporaryDirectory() as folder:
                packet, plan, artifact = setup_case(folder)
                if what == "manifest":
                    role = "app"
                    p = (Path(folder) / "rf03-candidate-oci" / role /
                         packet["roles"][role]["manifestDigest"][7:])
                    p.write_bytes(p.read_bytes() + b"!")
                    reason = "RF03_SIGNED_OCI_SUBJECT_CHANGED"
                elif what == "bundle":
                    (artifact / "candidate-bundle.sigstore.json").write_bytes(b"{}")
                    reason = "RF03_MATERIAL_BUNDLE_HASH_INVALID"
                else:
                    (artifact / "candidate-receipt.json").unlink()
                    reason = "RF03_MATERIAL_FILE_SET_INVALID"
                with self.assertRaisesRegex(rf.Blocked, reason):
                    signed.prepare(packet, plan, artifact, folder)

    def test_cli_result_requires_existing_candidate_certificate_identity(self):
        with tempfile.TemporaryDirectory() as folder:
            packet, plan, artifact = setup_case(folder)
            _, hashes, _ = signed.prepare(packet, plan, artifact, folder)
            output = cli_result(packet, hashes)
            raw = json.dumps(output).encode()
            signed.certificate_result(raw, packet, hashes)
            for field, bad in (
                ("sourceRepositoryDigest", "a"*40),
                ("buildSignerURI", "https://attacker.example/workflow"),
                ("buildSignerDigest", "b"*40),
                ("runInvocationURI", "https://github.com/other/run"),
                ("issuer", "https://not-github.example"),
                ("runnerEnvironment", "self-hosted"),
            ):
                with self.subTest(field=field):
                    invalid = json.loads(json.dumps(output))
                    invalid[0]["verificationResult"]["signature"]["certificate"][field] = bad
                    with self.assertRaisesRegex(
                            rf.Blocked, "RF03_SIGNED_CERTIFICATE_INVALID"):
                        signed.certificate_result(json.dumps(invalid).encode(),
                                                  packet, hashes)
            missing = json.loads(json.dumps(output))
            missing[0]["verificationResult"]["statement"]["subject"].pop()
            with self.assertRaisesRegex(
                    rf.Blocked, "RF03_SIGNED_CERTIFICATE_INVALID"):
                signed.certificate_result(json.dumps(missing).encode(),
                                          packet, hashes)

    def test_untrusted_cli_json_is_never_accepted_as_signed_proof(self):
        with tempfile.TemporaryDirectory() as folder:
            packet, plan, artifact = setup_case(folder)
            _, hashes, _ = signed.prepare(packet, plan, artifact, folder)
            for raw, code in (
                (b'{}', "RF03_SIGNED_CERTIFICATE_INVALID"),
                (b'[', "RF03_SIGNED_CLI_OUTPUT_INVALID"),
                (b'[{"x":1,"x":2}]', "RF03_DUPLICATE_JSON_KEY"),
                (b'[{"verificationResult":{"statement":{"subject":[]}}}]',
                 "RF03_SIGNED_CERTIFICATE_INVALID"),
                (b'{"foo":NaN}', "RF03_SIGNED_CLI_OUTPUT_INVALID"),
            ):
                with self.subTest(raw=raw), self.assertRaisesRegex(
                        rf.Blocked, code):
                    signed.certificate_result(raw, packet, hashes)

    def test_exact_online_bundle_argv_and_no_legacy_version_pin_in_flags(self):
        source = "a"*40
        normal = signed.command_argv("/private/gh", "/private/app", source)
        bundled = signed.command_argv(
            "/private/gh", "/private/app", source, "/private/bundle")
        self.assertEqual(bundled, normal + ["--bundle", "/private/bundle"])
        self.assertEqual(normal[:4],
                         ["/private/gh", "attestation", "verify", "/private/app"])
        self.assertEqual(normal[normal.index("--source-digest")+1], source)
        self.assertEqual(normal[normal.index("--signer-digest")+1], source)
        self.assertEqual(normal[normal.index("--signer-workflow")+1], ca.SIGNER)
        self.assertIn("--deny-self-hosted-runners", normal)
        self.assertNotIn("latest", normal)

    def test_tar_pinning_rejects_wrong_archive_without_executing(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            archive = base / "gh.tar.gz"
            binary = base / "gh"
            binary.write_bytes(b"synthetic-gh")
            binary.chmod(0o700)
            with tarfile.open(archive, "w:gz") as tar:
                info = tarfile.TarInfo(signed.BINARY_MEMBER)
                info.size = len(binary.read_bytes())
                tar.addfile(info, io.BytesIO(binary.read_bytes()))
            with self.assertRaisesRegex(
                    rf.Blocked, "RF03_SIGNED_GH_ARCHIVE_INVALID"):
                signed.verify_pinned_binary(archive, binary)
            # Synthetic forced archive checksum exercises the member-byte
            # comparison only; never trust this patched test as real gh.
            with patch.object(legacy, "GH_ARCHIVE_SHA", signed.file_digest(
                    archive, signed.MAX_ARCHIVE)[0]):
                self.assertEqual(
                    signed.verify_pinned_binary(archive, binary),
                    signed.file_digest(binary, signed.MAX_BINARY)[0])
                binary.write_bytes(b"synthetic-gh-tampered")
                with self.assertRaisesRegex(
                        rf.Blocked, "RF03_SIGNED_GH_TAR_MEMBER_INVALID|RF03_SIGNED_GH_BINARY_CHANGED"):
                    signed.verify_pinned_binary(archive, binary)

    def test_old_legacy_publisher_stays_fixed_and_result_does_not_authorize(self):
        self.assertEqual(legacy.GH_VERSION, "2.103.3")
        self.assertEqual(signed.SUBJECTS, ca.SUBJECTS)
        self.assertIn("BLOCKED_INDEPENDENT_OWNER_PROMOTION_AND_REGISTRY_PROOF",
                      Path(signed.__file__).read_text())


if __name__ == "__main__":
    unittest.main()
