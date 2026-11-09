#!/usr/bin/env python3
"""RF-03 candidate-only evidence chain: GitHub -> ZIP -> OCI -> Sigstore.

The integrated read-only Candidate verifier is deliberately NOT a Candidate
publisher, a Promotion authorization or an Issue close decision. Signed hashes
and existing Owner review history cannot authorize a future release.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import candidate_policy as legacy
import release_finalizer as rf
import rf03_candidate_archive as archive
import rf03_live_evidence as live
import rf03_oci_readback as oci
import rf03_readback as github
import rf03_release_handoff as handoff
import rf03_signed_candidate as signed


def require(ok, code):
    rf.need(ok, code)


def digest_receipt(value):
    return hashlib.sha256(json.dumps(
        value, sort_keys=True, separators=(",", ":"),
        ensure_ascii=True).encode("ascii")).hexdigest()


def verify_tag_set(reader, packet):
    """A final read-only candidate-tag check after Sigstore verification."""
    for role in handoff.ROLES:
        claim = packet["roles"][role]
        name = claim["candidateRef"].rsplit(":", 1)[1]
        try:
            item = reader.manifest(name)
        except legacy.Pending:
            raise rf.Blocked("RF03_CHAIN_FINAL_TAG_UNVERIFIED") from None
        require(type(item) is dict
                and all(item.get(k) == v for k, v in (
                    ("digest", claim["manifestDigest"]),
                    ("size", claim["size"]),
                    ("mediaType", claim["mediaType"]))),
                "RF03_CHAIN_FINAL_TAG_DRIFT")


def audit(packet, prior_plan, api, zip_path, reader, workspace,
          gh_archive, gh_binary, token):
    """Bind existing Candidate proof to actual bytes; still block promotion.

    A FakeAPI/FakeRegistry in tests is always labelled SYNTHETIC_ONLY. Real
    evidence requires the exact allowlisted GitHub GET adapter and pull-only
    authenticated GHCR adapter, a GitHub ZIP byte digest and the pinned CLI.
    """
    handoff.check(packet, prior_plan)
    root = Path(workspace)
    require(root.is_dir() and not root.is_symlink(),
            "RF03_CHAIN_WORKSPACE_INVALID")
    meta = live.audit_candidate(packet, prior_plan, api)
    authentic = (type(api) is github.SafeReadOnlyGitHub and
                 type(reader) is oci.ReadOnlyGHCR)
    extracted = root / "rf03-artifact"
    archive_result = archive.verify_and_extract(
        zip_path, packet, prior_plan, extracted)
    graph_result = oci.check(packet, prior_plan, reader, root)
    signed_result = signed.audit(
        packet, prior_plan, extracted, root, gh_archive, gh_binary, token)
    require(type(signed_result) is dict and
            signed_result.get("kind") == "RF03_SIGNED_CANDIDATE_READBACK_V1"
            and signed_result.get("sourceCommit") == packet["sourceCommit"]
            and signed_result.get("candidateRunId") == meta["candidateRunId"]
            and signed_result.get("version") == packet["version"]
            and signed_result.get("externalWrites") == 0,
            "RF03_CHAIN_SIGNED_RESULT_UNVERIFIED")
    require(type(graph_result) is dict and
            graph_result.get("candidateSourceCommit") == packet["sourceCommit"]
            and graph_result.get("candidateRunId") == meta["candidateRunId"]
            and graph_result.get("externalWrites") == 0
            and set(graph_result.get("graphs", {})) == set(handoff.ROLES),
            "RF03_CHAIN_GRAPH_RESULT_UNVERIFIED")
    required_subjects = {
        signed.SUBJECTS[role]: (
            packet["roles"][role]["manifestDigest"] if role != "receipt"
            else "sha256:" + packet["artifact"]["candidateReceiptSha256"])
        for role in (*handoff.ROLES, "receipt")
    }
    require(signed_result.get("subjectDigests") == required_subjects
            and archive_result["artifactId"] == meta["artifactId"]
            and archive_result["candidateRunId"] == meta["candidateRunId"]
            and archive_result["zipSha256"] == meta["artifactDigest"],
            "RF03_CHAIN_EVIDENCE_IDENTITY_MISMATCH")
    for role in handoff.ROLES:
        claim = packet["roles"][role]
        graph = graph_result["graphs"][role]
        require(type(graph) is dict
                and graph.get("candidateRef") == claim["candidateRef"]
                and graph.get("manifestDigest") == claim["manifestDigest"]
                and graph.get("platformManifestDigest") ==
                    claim["platformManifestDigest"]
                and graph.get("configDigest") == claim["configDigest"],
                "RF03_CHAIN_ROLE_DESCRIPTOR_CHANGED")
    # Actual GitHub run/job/environment/ZIP metadata and candidate tags can
    # drift during a long network+Sigstore check. Re-read; unknown = HALT.
    require(live.audit_candidate(packet, prior_plan, api) == meta,
            "RF03_CHAIN_GITHUB_EVIDENCE_DRIFT")
    verify_tag_set(reader, packet)
    binding = {
        "sourceCommit": packet["sourceCommit"],
        "sourceTree": packet["sourceTree"],
        "version": packet["version"],
        "candidateRunId": meta["candidateRunId"],
        "reviewEvidenceSha256": meta["candidateReviewEvidenceSha256"],
        "artifactId": meta["artifactId"],
        "archiveDigest": archive_result["zipSha256"],
        "subjects": required_subjects,
        "promotionSourceCommit": packet["promotionSourceCommit"],
    }
    return {
        "kind": "RF03_CANDIDATE_EVIDENCE_CHAIN_V1",
        "state": ("BLOCKED_PROMOTION_OWNER_AND_FINAL_REGISTRY_PROOF_REQUIRED"
                  if authentic else "BLOCKED_SYNTHETIC_NOT_LIVE_EVIDENCE"),
        "sourceCommit": packet["sourceCommit"],
        "candidateRunId": meta["candidateRunId"],
        "version": packet["version"],
        "candidateEvidenceSha256": digest_receipt(binding),
        "candidateMetadata": "MATCHED_READ_ONLY",
        "artifactZip": "HASH_MATCHED_NOT_OWNER_GO",
        "ociGraphReadback": ("AUTHENTICATED_GHCR_BYTES_MATCHED"
                             if authentic else "SYNTHETIC_ONLY"),
        "signatureVerification": (
            "CANDIDATE_SUBJECTS_CLI_CHECKED_NOT_RELEASE_GO"
            if authentic else "SYNTHETIC_ONLY"),
        "candidateReviewHistory": "OBSERVED_NOT_RELEASE_AUTHORITY",
        "promotionReviewHistory": "NOT_VERIFIED",
        "ownerReleaseGO": "NOT_VERIFIED",
        "finalRegistryPublication": "NOT_VERIFIED",
        "registryPublication": "NOT_RUN",
        "externalWrites": 0,
    }
