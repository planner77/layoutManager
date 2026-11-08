#!/usr/bin/env python3
"""RF-03 Candidate metadata/ZIP/OCI/Sigstore chain: synthetic negatives only."""
from __future__ import annotations

import copy
import hashlib
import shutil
import stat
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import release_finalizer as rf
import rf03_candidate_archive as archive
import rf03_candidate_evidence as chain
import rf03_live_evidence as live
import rf03_signed_candidate as signed
import rf03_release_handoff as handoff
import rf03_material_preflight as material
from test_rf03_live_evidence import FakeAPI
from test_rf03_oci_readback import fixture
from test_rf03_signed_candidate import setup_case


def build(folder):
    """One deterministic four-file downloaded ZIP and matching fake API."""
    root = Path(folder)
    packet, plan, original_files = setup_case(root)
    other_packet, other_plan, registry = fixture(index=True)
    for role in handoff.ROLES:
        assert packet["roles"][role]["manifestDigest"] == (
            other_packet["roles"][role]["manifestDigest"])
    # setup_case already read and populated these graph files; the actual
    # integrated verifier must populate a fresh private graph workspace.
    shutil.rmtree(root / "rf03-candidate-oci")
    zip_path = root / "original-github-archive.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name in material.FILES:
            zf.write(original_files / name, arcname=name)
    raw = zip_path.read_bytes()
    packet["artifact"]["size"] = len(raw)
    packet["artifact"]["digest"] = "sha256:" + hashlib.sha256(raw).hexdigest()
    api = FakeAPI()
    for stage in ("candidate", "promotion"):
        packet[stage]["approvalEvidenceSha256"] = (
            api.packet[stage]["approvalEvidenceSha256"])
    aid, rid = packet["artifact"]["id"], packet["candidate"]["runId"]
    m = api.values["/actions/artifacts/" + str(aid)]
    m["size_in_bytes"] = len(raw)
    m["digest"] = packet["artifact"]["digest"]
    api.values["/actions/runs/" + str(rid) +
               "/artifacts?per_page=100"]["artifacts"] = [copy.deepcopy(m)]
    return packet, plan, api, registry, zip_path


def synthetic_signer(packet, plan, downloaded, workspace, *unused):
    paths, mapping, _ = signed.prepare(packet, plan, downloaded, workspace)
    return {
        "kind": "RF03_SIGNED_CANDIDATE_READBACK_V1",
        "sourceCommit": packet["sourceCommit"],
        "candidateRunId": packet["candidate"]["runId"],
        "version": packet["version"],
        "subjectDigests": {signed.SUBJECTS[r]: "sha256:" + mapping[r]
                           for r in (*handoff.ROLES, "receipt")},
        "externalWrites": 0,
    }


class CandidateArchiveAndChainTests(unittest.TestCase):
    def test_candidate_only_git_metadata_never_requires_promotion_run(self):
        with tempfile.TemporaryDirectory() as folder:
            packet, plan, api, _, _ = build(folder)
            for key in list(api.values):
                if "/actions/runs/" + str(packet["promotion"]["runId"]) + "/" in key:
                    del api.values[key]
            out = live.audit_candidate(packet, plan, api)
            self.assertEqual(out["candidateRunId"], packet["candidate"]["runId"])
            self.assertEqual(out["promotionReviewHistory"], "NOT_VERIFIED")
            self.assertEqual(out["ownerAuthority"], "NOT_VERIFIED")
            self.assertEqual(out["externalWrites"], 0)
            self.assertEqual(out["signatureVerification"], "NOT_VERIFIED")

    def test_verified_zip_extracts_exact_subject_set_no_release_authority(self):
        with tempfile.TemporaryDirectory() as folder:
            packet, plan, _, _, zip_path = build(folder)
            out = archive.verify_and_extract(
                zip_path, packet, plan, Path(folder) / "private-extracted")
            self.assertEqual(out["zipSha256"], packet["artifact"]["digest"])
            self.assertEqual(set(out["files"]), set(material.FILES))
            self.assertEqual(out["signatureVerification"], "NOT_VERIFIED")
            self.assertEqual(out["registryPublication"], "NOT_RUN")
            self.assertEqual(out["externalWrites"], 0)
            self.assertEqual(
                {p.name for p in (Path(folder) / "private-extracted").iterdir()},
                set(material.FILES))
            with self.assertRaisesRegex(
                    rf.Blocked, "RF03_ARCHIVE_DESTINATION_INVALID"):
                archive.verify_and_extract(
                    zip_path, packet, plan, Path(folder) / "private-extracted")

    def test_zip_wrong_digest_path_missing_and_extra_files_rejected(self):
        for mutation in ("digest", "path", "missing", "extra", "duplicate",
                         "directory"):
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as folder:
                packet, plan, _, _, zip_path = build(folder)
                if mutation == "digest":
                    raw = zip_path.read_bytes()
                    zip_path.write_bytes(raw[:-1] + bytes([raw[-1] ^ 1]))
                else:
                    origin = zipfile.ZipFile(zip_path, "r")
                    contents = {item.filename: origin.read(item)
                                for item in origin.infolist()}
                    origin.close()
                    if mutation == "path":
                        contents["../candidate-receipt.json"] = contents.pop(
                            "candidate-receipt.json")
                    elif mutation == "missing":
                        contents.pop("verification.json")
                    elif mutation == "extra":
                        contents["secret.txt"] = b"token"
                    elif mutation == "directory":
                        contents["folder/"] = b""
                    with zipfile.ZipFile(zip_path, "w",
                                         compression=zipfile.ZIP_DEFLATED) as zf:
                        for name, raw in contents.items():
                            zf.writestr(name, raw)
                        if mutation == "duplicate":
                            zf.writestr("candidate-receipt.json",
                                        contents["candidate-receipt.json"])
                    updated = zip_path.read_bytes()
                    packet["artifact"]["size"] = len(updated)
                    packet["artifact"]["digest"] = (
                        "sha256:" + hashlib.sha256(updated).hexdigest())
                code = ("RF03_ARCHIVE_DIGEST_INVALID" if mutation == "digest"
                        else "RF03_ARCHIVE_FILE_SET_INVALID")
                with self.assertRaisesRegex(rf.Blocked, code):
                    archive.verify_and_extract(
                        zip_path, packet, plan, Path(folder) / "never-extract")

    def test_zip_symlink_and_resource_bomb_rejected_before_extraction(self):
        for mutation in ("symlink", "oversize", "unsupported"):
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as folder:
                packet, plan, _, _, zip_path = build(folder)
                with zipfile.ZipFile(zip_path) as zf:
                    files = {item.filename: zf.read(item)
                             for item in zf.infolist()}
                with zipfile.ZipFile(zip_path, "w") as zf:
                    for name, raw in files.items():
                        if mutation == "oversize" and name == "verification.json":
                            raw = b"A" * (material.LIMIT + 1)
                        if mutation == "symlink" and name == "verification.json":
                            attr = zipfile.ZipInfo(name)
                            attr.create_system = 3
                            attr.external_attr = (stat.S_IFLNK | 0o777) << 16
                            zf.writestr(attr, "outside-target")
                        elif mutation == "unsupported":
                            zf.writestr(name, raw, compress_type=zipfile.ZIP_BZIP2)
                        else:
                            zf.writestr(name, raw, compress_type=zipfile.ZIP_DEFLATED)
                payload = zip_path.read_bytes()
                packet["artifact"]["size"] = len(payload)
                packet["artifact"]["digest"] = "sha256:" + hashlib.sha256(payload).hexdigest()
                code = ("RF03_ARCHIVE_RESOURCE_LIMIT" if mutation == "oversize"
                        else "RF03_ARCHIVE_UNSAFE_ENTRY")
                with self.assertRaisesRegex(rf.Blocked, code):
                    archive.verify_and_extract(
                        zip_path, packet, plan, Path(folder) / "reject")

    def test_chain_combines_same_run_metadata_archive_oci_and_signed_claims(self):
        with tempfile.TemporaryDirectory() as folder:
            packet, plan, api, store, zip_path = build(folder)
            with patch.object(chain.signed, "audit", side_effect=synthetic_signer) as verifier:
                result = chain.audit(packet, plan, api, zip_path, store, folder,
                                     "/no-real-gh-archive", "/no-gh", "synthetic-token")
            self.assertEqual(verifier.call_count, 1)
            self.assertEqual(result["state"],
                             "BLOCKED_SYNTHETIC_NOT_LIVE_EVIDENCE")
            self.assertEqual(result["ociGraphReadback"], "SYNTHETIC_ONLY")
            self.assertEqual(result["signatureVerification"], "SYNTHETIC_ONLY")
            self.assertEqual(result["promotionReviewHistory"], "NOT_VERIFIED")
            self.assertEqual(result["ownerReleaseGO"], "NOT_VERIFIED")
            self.assertEqual(result["externalWrites"], 0)
            self.assertEqual(len(result["candidateEvidenceSha256"]), 64)
            self.assertTrue(all(c[0] == "GET" for c in store.events))
            self.assertGreaterEqual(api.calls.count("/git/ref/heads/main"), 2)

    def test_bad_candidate_approval_artifact_and_source_fail_before_cryptography(self):
        for label in ("wrong-owner", "expired-artifact", "old-main",
                      "wrong-zip"):
            with self.subTest(label=label), tempfile.TemporaryDirectory() as folder:
                packet, plan, api, store, zip_path = build(folder)
                if label == "wrong-owner":
                    path = "/actions/runs/" + str(packet["candidate"]["runId"]) + "/approvals"
                    api.values[path][0]["user"]["id"] = 888
                elif label == "expired-artifact":
                    path = "/actions/artifacts/" + str(packet["artifact"]["id"])
                    api.values[path]["expired"] = True
                elif label == "old-main":
                    api.values["/git/ref/heads/main"]["object"]["sha"] = "0"*40
                else:
                    raw = zip_path.read_bytes()
                    zip_path.write_bytes(raw[:-1] + bytes([raw[-1] ^ 1]))
                with patch.object(chain.signed, "audit") as signer:
                    with self.assertRaises(rf.Blocked):
                        chain.audit(packet, plan, api, zip_path, store, folder,
                                    "/no-gh", "/no-gh", "synthetic-token")
                    signer.assert_not_called()

    def test_final_tag_race_or_missing_signature_result_fails_closed(self):
        for change in ("tag-drift", "wrong-signer-identity"):
            with self.subTest(change=change), tempfile.TemporaryDirectory() as folder:
                packet, plan, api, store, zip_path = build(folder)
                def corrupted(*args):
                    result = synthetic_signer(*args)
                    if change == "wrong-signer-identity":
                        result["sourceCommit"] = "0"*40
                    return result
                if change == "tag-drift":
                    original = store.manifest
                    tag = packet["roles"]["app"]["candidateRef"].rsplit(":", 1)[1]
                    count = {"n": 0}
                    def changing(ref):
                        if ref == tag:
                            count["n"] += 1
                            if count["n"] >= 3:
                                return None
                        return original(ref)
                    store.manifest = changing
                with patch.object(chain.signed, "audit", side_effect=corrupted):
                    with self.assertRaisesRegex(
                            rf.Blocked,
                            "RF03_CHAIN_FINAL_TAG_DRIFT|RF03_CHAIN_SIGNED_RESULT_UNVERIFIED"):
                        chain.audit(packet, plan, api, zip_path, store, folder,
                                    "/no-gh", "/no-gh", "synthetic-token")


    def test_main_changes_during_crypto_stage_block_final_readback(self):
        with tempfile.TemporaryDirectory() as folder:
            packet, plan, api, store, zip_path = build(folder)
            original_get = api.get
            reads = {"main": 0}
            def changed_get(path):
                result = original_get(path)
                if path == "/git/ref/heads/main":
                    reads["main"] += 1
                    if reads["main"] >= 2:
                        result["object"]["sha"] = "0"*40
                return result
            api.get = changed_get
            with patch.object(chain.signed, "audit", side_effect=synthetic_signer):
                with self.assertRaisesRegex(
                        rf.Blocked, "RF03_CANDIDATE_MAIN_DRIFT"):
                    chain.audit(packet, plan, api, zip_path, store, folder,
                                "/no-gh", "/no-gh", "synthetic-token")
            self.assertEqual(reads["main"], 2)

    def test_owner_candidate_metadata_workflow_is_get_only(self):
        from pathlib import Path
        import rf03_readback as command
        root = Path(__file__).resolve().parents[3]
        wf = (root / ".github/workflows/release-finalizer-rf03-readback.yml").read_text()
        self.assertIn("options: [all, candidate]", wf)
        self.assertIn("python3 src/tests/oci/rf03_readback.py candidate", wf)
        self.assertIn("permissions: {}", wf)
        self.assertIn("actions: read", wf)
        self.assertNotIn("packages: write", wf)
        self.assertNotIn("id-token: write", wf)
        self.assertNotIn("issues: write", wf)
        self.assertNotIn("pull-requests: write", wf)
        packet, plan = FakeAPI().packet, FakeAPI().plan
        api = FakeAPI()
        with patch.object(command.sys, "argv", ["rf03_readback.py", "candidate"]), \
             patch.object(command, "check_context"), \
             patch.object(command, "parse_inputs", return_value=(packet, plan)), \
             patch.object(command, "SafeReadOnlyGitHub", return_value=api), \
             patch.object(command.live, "audit_candidate",
                          return_value={"kind": "RF03_CANDIDATE_METADATA_READBACK_V1",
                                        "externalWrites": 0}) as checked:
            self.assertEqual(command.main(), 0)
            checked.assert_called_once_with(packet, plan, api)


if __name__ == "__main__":
    unittest.main()
