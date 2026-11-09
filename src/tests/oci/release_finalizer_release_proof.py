#!/usr/bin/env python3
"""RF-04 independent live release readback before any AC/Issue mutation.

Reuse RF-03's *actual* GitHub metadata, original artifact ZIP, OCI graph and
pinned Sigstore verifier. Never rely on user-supplied PASS booleans. This
module has no GitHub Issue or GHCR write route.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import stat
import zipfile

import rf03_candidate_policy as ca
import release_finalizer as rf
import rf03_candidate_evidence as evidence
import rf03_download as download
import rf03_live_evidence as live
import rf03_oci_readback as oci
import rf03_readback as github
import rf03_release_handoff as handoff
import rf03_promotion_policy as policy
import rf03_registry_promotion as registry
import rf03_release_promote as release


def need(ok, code):
    rf.need(ok, code)


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=True,
                      separators=(",", ":"), allow_nan=False).encode("ascii")


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


class FinalReadOnlyGHCR(oci.ReadOnlyGHCR):
    """The same pull-only registry reader, scoped additionally to three finals
    and historical immutable 0.61.0 + latest readback; no mutation methods."""
    def __init__(self, token, actor, packet, prior_plan):
        super().__init__(token, actor, packet, prior_plan)
        self.allowed_tags.update(registry.FINALS.values())
        self.allowed_tags.update((
            "0.61.0", "0.61.0-migrate", "0.61.0-cpu-worker", "latest"))


def exact_release_binding(h, p, rf_packet, current_main, promotion_sha):
    need(p["version"] == h["version"] == rf_packet["version"]
         and p["candidate"]["sourceCommit"] == h["sourceCommit"]
         and p["candidate"]["sourceTree"] == h["sourceTree"]
         and int(p["candidate"]["runId"]) == h["candidate"]["runId"]
         and p["candidate"]["packetSha256"] == h["candidate"]["packetSha256"]
         and p["candidate"]["artifact"]["id"] == h["artifact"]["id"]
         and p["candidate"]["artifact"]["digest"] == h["artifact"]["digest"]
         and p["candidate"]["artifact"]["size"] == h["artifact"]["size"]
         and p["promotion"]["sourceCommit"] == h["promotionSourceCommit"] == current_main
         and p["promotion"]["sourceTree"] == h["promotionSourceTree"]
         and h["promotion"]["packetSha256"] == promotion_sha
         and h["mainCiRunId"] > 0
         and h["prCiRunId"] > 0
         and h["candidate"]["runId"] != h["promotion"]["runId"],
         "RF04_RELEASE_SOURCE_IDENTITY_MISMATCH")
    for role in ca.ROLES:
        want, got = h["roles"][role], p["roles"][role]
        need(got["digest"] == want["manifestDigest"]
             and got["configDigest"] == want["configDigest"]
             and got["platformManifestDigest"] == want["platformManifestDigest"]
             and got["size"] == want["size"] and got["mediaType"] == want["mediaType"]
             and want["finalRef"] == ca.PACKAGE + ":" + registry.FINALS[role],
             "RF04_ROLE_DIGEST_MISMATCH")
    need(p["candidate"]["artifact"]["files"]["candidate-receipt.json"] ==
         h["artifact"]["candidateReceiptSha256"]
         and p["candidate"]["artifact"]["files"]["candidate-bundle.sigstore.json"] ==
         h["artifact"]["signatureBundleSha256"]
         and p["candidate"]["artifact"]["files"]["verification.json"] ==
         h["artifact"]["verificationSha256"],
         "RF04_CANDIDATE_ARTIFACT_MISMATCH")


def promotion_operation(api, h, p, token, workspace, promotion_sha):
    """Read the one successful promotion's exact GitHub artifact and operation receipt."""
    runid = h["promotion"]["runId"]
    rows = ca.rows(api, ca.BASE + "/actions/runs/" + str(runid) + "/artifacts", "artifacts")
    want = "issue225-promotion-progress-" + str(runid) + "-1"
    matches = [a for a in rows if a.get("name") == want]
    need(len(rows) == 1 and len(matches) == 1
         and type(matches[0].get("id")) is int
         and type(matches[0].get("size_in_bytes")) is int
         and type(matches[0].get("digest")) is str
         and matches[0].get("expired") is False
         and matches[0].get("workflow_run", {}).get("id") == runid
         and matches[0]["workflow_run"].get("head_sha") ==
         h["promotionSourceCommit"],
         "RF04_PROMOTION_ARTIFACT_METADATA_INVALID")
    artifact = matches[0]
    zip_file = Path(workspace) / "promotion-progress.zip"
    download.download(artifact["id"], artifact["size_in_bytes"],
                      artifact["digest"], token, zip_file)
    try:
        with zipfile.ZipFile(zip_file, "r", allowZip64=False) as archive:
            names = archive.namelist()
            need(len(names) == 2 and set(names) ==
                 {"progress.json", "operation-receipt.json"},
                 "RF04_PROMOTION_ARTIFACT_FILES_INVALID")
            blobs = {}
            for item in archive.infolist():
                mode = stat.S_IFMT(item.external_attr >> 16)
                need(mode in (0, stat.S_IFREG) and item.file_size > 0
                     and item.file_size <= 2 * 1024 * 1024
                     and item.compress_size > 0 and item.compress_type in (
                         zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)
                     and not (item.flag_bits & 1)
                     and item.file_size <= max(1024, item.compress_size * 300),
                     "RF04_PROMOTION_ARTIFACT_UNSAFE")
                blobs[item.filename] = archive.read(item)
    except rf.Blocked:
        raise
    except (zipfile.BadZipFile, zipfile.LargeZipFile, OSError, ValueError,
            RuntimeError, NotImplementedError):
        raise rf.Blocked("RF04_PROMOTION_ARTIFACT_UNVERIFIED") from None
    op = ca.decode(blobs["operation-receipt.json"])
    progress = ca.decode(blobs["progress.json"])
    expected = {"packetSha256": promotion_sha, "runId": str(runid),
                "sourceCommit": h["promotionSourceCommit"],
                "sourceTree": h["promotionSourceTree"]}
    release.validate_operation(op, p, expected)
    need(op["runId"] == str(runid)
         and op["state"] in ("COMPLETE", "NO_OP")
         and progress.get("kind") == "PROMOTION_PROGRESS_NOT_PROVENANCE_V1"
         and progress.get("state") == op["state"]
         and progress.get("runId") == str(runid)
         and progress.get("ownerPacketSha256") == promotion_sha
         and progress.get("attempted") is not None
         and progress.get("observation") == "JOURNAL_ONLY_NOT_NEW_REGISTRY_READBACK",
         "RF04_OPERATION_RECEIPT_AND_PROGRESS_INCONSISTENT")
    return {"operationSha256": hashlib.sha256(blobs["operation-receipt.json"]).hexdigest(),
            "runId": runid, "promotionArtifactId": artifact["id"],
            "operationState": op["state"]}


def verify(rf_packet, bundle, current_main, actor, token, working, gh_archive,
           gh_binary):
    """Perform real GitHub, byte-level Sigstore and final registry checks.

    This is a read-only gate. A valid result binds proofs but does not, alone,
    imply Owner ISSUE-CLOSE approval or completed acceptance checkboxes.
    """
    need(type(bundle) is dict and set(bundle) == {
        "kind", "handoff", "originalPlan", "promotionPacket",
        "promotionPacketSha256", "issueBodySha256", "ownerIssueClose"
    } and bundle["kind"] == "RF04_EXACT_CLOSE_INPUT_V1"
         and bundle["ownerIssueClose"] is True
         and type(bundle["issueBodySha256"]) is str and
         re.fullmatch("[0-9a-f]{64}", bundle["issueBodySha256"]),
         "RF04_CLOSE_INPUT_FIELDS_INVALID")
    h, plan = bundle["handoff"], bundle["originalPlan"]
    need(type(h) is dict and type(plan) is dict
         and type(bundle["promotionPacket"]) is dict,
         "RF04_RELEASE_INPUT_INVALID")
    handoff.check(h, plan)
    raw = ca.canonical(bundle["promotionPacket"])
    promotion_sha = bundle["promotionPacketSha256"]
    p = policy.packet(raw, promotion_sha)
    exact_release_binding(h, p, rf_packet, current_main, promotion_sha)
    need(type(actor) is str and actor == "planner77"
         and type(token) is str and token
         and Path(working).is_dir() and not Path(working).is_symlink(),
         "RF04_REAL_READER_CONTEXT_INVALID")
    api = github.SafeReadOnlyGitHub(token)
    first = live.audit(h, plan, api)
    need(first.get("githubEvidence") == "MATCHED_READ_ONLY"
         and first.get("candidateRunId") == h["candidate"]["runId"]
         and first.get("promotionRunId") == h["promotion"]["runId"]
         and first.get("environmentPolicy") == "OBSERVED_NO_ADMIN_BYPASS",
         "RF04_LIVE_OWNER_REVIEWS_NOT_VERIFIED")
    # Original GitHub Artifact ZIP: authenticate identity and SHA256 before
    # verifying its contents. No caller-provided ZIP or PASS receipts.
    metadata_api = release.API(token)
    original = policy.candidate_metadata(metadata_api, p)
    zip_path = Path(working) / "original-candidate.zip"
    download.download(original["id"], original["size"], original["digest"],
                      token, zip_path)
    candidate_reader = oci.ReadOnlyGHCR(token, actor, h, plan)
    candidate = evidence.audit(h, plan, api, zip_path, candidate_reader,
                               Path(working), gh_archive, gh_binary, token)
    need(candidate["state"] ==
         "BLOCKED_PROMOTION_OWNER_AND_FINAL_REGISTRY_PROOF_REQUIRED"
         and candidate["ociGraphReadback"] == "AUTHENTICATED_GHCR_BYTES_MATCHED"
         and candidate["signatureVerification"] ==
         "CANDIDATE_SUBJECTS_CLI_CHECKED_NOT_RELEASE_GO",
         "RF04_CANDIDATE_CRYPTO_UNVERIFIED")
    operation = promotion_operation(metadata_api, h, p, token, working,
                                    promotion_sha)
    final_reader = FinalReadOnlyGHCR(token, actor, h, plan)
    baseline = release.protected_baseline_readback(final_reader, p)
    transport = release.Transport(final_reader, p, None)  # read methods only
    packet = policy.rt_packet(p)
    need(registry.read_final_set(packet, transport) == "NO_OP",
         "RF04_FINAL_THREE_ROLE_TAGS_MISSING_OR_PARTIAL")
    for role in ca.ROLES:
        expected = packet["candidates"][role]
        tag = registry.FINALS[role]
        observed = transport.get_manifest(ca.PACKAGE, tag)
        registry.verify_graph(transport, expected, observed)
    need(release.protected_baseline_readback(final_reader, p) == baseline
         and registry.read_final_set(packet, transport) == "NO_OP",
         "RF04_REGISTRY_OR_HISTORICAL_TAG_DRIFT")
    need(live.audit(h, plan, api) == first,
         "RF04_RELEASE_GITHUB_EVIDENCE_DRIFT")
    return {
        "kind": "RF04_LIVE_VERIFIED_RELEASE_V1",
        "version": h["version"], "mainSha": current_main,
        "candidateRunId": h["candidate"]["runId"],
        "promotionRunId": h["promotion"]["runId"],
        "candidateEvidenceSha256": candidate["candidateEvidenceSha256"],
        "operationReceiptSha256": operation["operationSha256"],
        "promotionArtifactId": operation["promotionArtifactId"],
        "approvalEvidenceSha256": {
            "candidate": h["candidate"]["approvalEvidenceSha256"],
            "promotion": h["promotion"]["approvalEvidenceSha256"],
        },
        "roleDigests": {r: p["roles"][r]["digest"] for r in ca.ROLES},
        "historicBaseline": baseline,
        "externalWrites": 0,
    }
