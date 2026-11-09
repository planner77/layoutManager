#!/usr/bin/env python3
"""RF-03 version-generic Candidate/Promotion evidence handoff, PURE PLAN only.

The contract binds exact release identity, per-role OCI descriptors, two distinct
Owner review *claims*, and independent candidate/promotion executions. Nothing
here authenticates claims, verifies signatures or authorizes GHCR writes.
The existing 0.61.0 writer remains pinned until the independent live proofs
and protected write path have been implemented and reviewed.
"""
from __future__ import annotations

import hashlib
import json
import re

import rf03_exact_release as release
import release_finalizer as rf

KIND = "RF03_RELEASE_HANDOFF_V1"
PACKAGE = rf.PACKAGE
ROLES = release.TARGET_ROLES
CANDIDATE_WORKFLOW = ".github/workflows/release-finalizer-rf03-candidate.yml"
PROMOTION_WORKFLOW = ".github/workflows/release-finalizer-rf03-promote.yml"
MAX_BYTES = 32768
HEX64 = re.compile(r"[0-9a-f]{64}\Z")
DIGEST = re.compile(r"sha256:[0-9a-f]{64}\Z")
MEDIA_TYPES = {
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.docker.distribution.manifest.v2+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
}
MAX_DESCRIPTOR = 8 * 1024 * 1024


def exact(obj, names, code):
    rf.need(type(obj) is dict and set(obj) == set(names), code)


def sha40(value):
    return type(value) is str and bool(rf.HEX40.fullmatch(value))


def sha64(value):
    return type(value) is str and bool(HEX64.fullmatch(value))


def digest(value):
    return type(value) is str and bool(DIGEST.fullmatch(value))


def positive(value):
    return type(value) is int and 0 < value <= 2**63 - 1


def unique(pairs):
    obj = {}
    for name, value in pairs:
        rf.need(name not in obj, "RF03_DUPLICATE_JSON_KEY")
        obj[name] = value
    return obj


def parse(raw: bytes, sha256: str):
    rf.need(type(raw) is bytes and 0 < len(raw) <= MAX_BYTES
            and sha64(sha256) and hashlib.sha256(raw).hexdigest() == sha256,
            "RF03_HANDOFF_HASH_INVALID")
    try:
        obj = json.loads(raw, object_pairs_hook=unique,
                         parse_constant=lambda _: (_ for _ in ()).throw(
                             rf.Blocked("RF03_JSON_INVALID")))
    except rf.Blocked:
        raise
    except (ValueError, UnicodeError, RecursionError, TypeError):
        raise rf.Blocked("RF03_JSON_INVALID") from None
    return obj


def check_run(run, source, tree, workflow):
    exact(run, ("runId", "runAttempt", "workflowPath", "sourceCommit",
                "sourceTree", "workflowCommit", "packetSha256",
                "environmentId", "approvalJobId", "approvalReviewerId",
                "approvalEvidenceSha256"), "RF03_RUN_FIELDS_INVALID")
    rf.need(positive(run["runId"]) and run["runAttempt"] == 1
            and type(run["runAttempt"]) is int
            and run["workflowPath"] == workflow
            and run["sourceCommit"] == source
            and run["sourceTree"] == tree
            and run["workflowCommit"] == source
            and sha64(run["packetSha256"])
            and positive(run["environmentId"]) and positive(run["approvalJobId"])
            and type(run["approvalReviewerId"]) is int
            and run["approvalReviewerId"] == rf.OWNER_ID
            and sha64(run["approvalEvidenceSha256"]),
            "RF03_RUN_CLAIM_INVALID")


def check(packet, original_plan):
    """Validate untrusted shape; return explicit BLOCKED, never a GO."""
    exact(packet, ("kind", "repository", "repositoryId", "ownerId", "package",
                   "packageId", "version", "sourceCommit", "sourceTree",
                   "mainCiRunId", "mainCiAttempt", "prCiRunId", "prCiAttempt",
                   "candidate", "promotion", "promotionSourceCommit",
                   "promotionSourceTree", "artifact", "roles",
                   "rollbackBaseline", "nonce", "stopPolicy"),
          "RF03_HANDOFF_FIELDS_INVALID")
    version = packet["version"]
    finals = release.exact_tags(version)  # rejects preserved <=0.61.0
    rf.need(packet["kind"] == KIND
            and packet["repository"] == rf.REPO
            and type(packet["repositoryId"]) is int
            and packet["repositoryId"] == rf.REPO_ID
            and type(packet["ownerId"]) is int
            and packet["ownerId"] == rf.OWNER_ID
            and packet["package"] == PACKAGE
            and type(packet["packageId"]) is int
            and packet["packageId"] == 14938097
            and sha40(packet["sourceCommit"])
            and sha40(packet["sourceTree"])
            and sha40(packet["promotionSourceCommit"])
            and sha40(packet["promotionSourceTree"])
            and type(packet["nonce"]) is str
            and bool(rf.HEX32.fullmatch(packet["nonce"]))
            and packet["stopPolicy"] == rf.STOP,
            "RF03_HANDOFF_IDENTITY_INVALID")
    rf.need(positive(packet["prCiRunId"]) and packet["prCiAttempt"] == 1
            and type(packet["prCiAttempt"]) is int
            and positive(packet["mainCiRunId"]) and packet["mainCiAttempt"] == 1
            and type(packet["mainCiAttempt"]) is int,
            "RF03_HANDOFF_CI_INVALID")
    # rf03_exact_release.evaluate emits additional informational fields.
    # These are allowlisted here as source data only, never authorization.
    required_plan = ("kind", "state", "releaseVersion", "sourceCommit",
                     "sourceTree", "prCiRunId", "mainCiRunId",
                     "expectedFinalRefs", "roles", "externalWrites",
                     "ownerAuthority", "releaseIntentIsPublishedTag")
    rf.need(type(original_plan) is dict
            and all(k in original_plan for k in required_plan),
            "RF03_PLAN_FIELDS_INVALID")
    rf.need(original_plan["kind"] == "RF03_EXACT_VERSION_PLAN_V1"
            and original_plan["state"] == "BLOCKED_PROTECTED_MAIN_AND_OWNER_RELEASE_APPROVAL_REQUIRED"
            and original_plan["releaseVersion"] == version
            and original_plan["sourceCommit"] == packet["sourceCommit"]
            and original_plan["sourceTree"] == packet["sourceTree"]
            and original_plan["prCiRunId"] == packet["prCiRunId"]
            and original_plan["mainCiRunId"] == packet["mainCiRunId"]
            and original_plan["expectedFinalRefs"] == finals
            and original_plan["roles"] == list(ROLES)
            and original_plan["externalWrites"] == 0
            and original_plan["ownerAuthority"] == "NOT_VERIFIED"
            and original_plan["releaseIntentIsPublishedTag"] is False,
            "RF03_HANDOFF_SOURCE_PLAN_MISMATCH")
    check_run(packet["candidate"], packet["sourceCommit"],
              packet["sourceTree"], CANDIDATE_WORKFLOW)
    check_run(packet["promotion"], packet["promotionSourceCommit"],
              packet["promotionSourceTree"], PROMOTION_WORKFLOW)
    candidate, promotion = packet["candidate"], packet["promotion"]
    rf.need(candidate["runId"] != promotion["runId"]
            and candidate["approvalJobId"] != promotion["approvalJobId"]
            and candidate["approvalEvidenceSha256"] != promotion["approvalEvidenceSha256"]
            and candidate["packetSha256"] != promotion["packetSha256"],
            "RF03_INDEPENDENT_REVIEWS_REQUIRED")
    artifact = packet["artifact"]
    exact(artifact, ("id", "size", "digest", "candidateReceiptSha256",
                     "signatureBundleSha256", "verificationSha256"),
          "RF03_ARTIFACT_FIELDS_INVALID")
    rf.need(positive(artifact["id"]) and positive(artifact["size"])
            and artifact["size"] <= 16*1024*1024
            and digest(artifact["digest"])
            and all(sha64(artifact[k]) for k in (
                "candidateReceiptSha256", "signatureBundleSha256",
                "verificationSha256")),
            "RF03_ARTIFACT_DESCRIPTOR_INVALID")
    roles = packet["roles"]
    exact(roles, ROLES, "RF03_ROLE_SET_INVALID")
    expected_digests = set()
    for role in ROLES:
        item = roles[role]
        exact(item, ("role", "candidateRef", "finalRef", "manifestDigest",
                     "platformManifestDigest", "configDigest", "mediaType",
                     "size", "platform", "sourceCommit", "candidateReceiptSha256"),
              "RF03_ROLE_DESCRIPTOR_FIELDS_INVALID")
        candidate_ref = (PACKAGE + ":candidate-" + packet["sourceCommit"]
                         + "-" + str(candidate["runId"]) + "-1-" + role)
        rf.need(item["role"] == role
                and item["candidateRef"] == candidate_ref
                and len(candidate_ref.split(":")[-1]) <= 128
                and item["finalRef"] == finals[role]
                and item["sourceCommit"] == packet["sourceCommit"]
                and item["candidateReceiptSha256"] == artifact["candidateReceiptSha256"]
                and item["platform"] == "linux/amd64"
                and type(item["mediaType"]) is str
                and item["mediaType"] in MEDIA_TYPES
                and positive(item["size"]) and item["size"] <= MAX_DESCRIPTOR
                and all(digest(item[k]) for k in (
                    "manifestDigest", "platformManifestDigest", "configDigest")),
                "RF03_ROLE_IDENTITY_INVALID")
        expected_digests.add(item["manifestDigest"])
    rf.need(len(expected_digests) == 3, "RF03_ROLE_DIGEST_COLLISION")
    baseline = packet["rollbackBaseline"]
    exact(baseline, ("version", "sourceCommit", "roles", "automaticRollback"),
          "RF03_BASELINE_FIELDS_INVALID")
    exact(baseline["roles"], ROLES, "RF03_BASELINE_ROLES_INVALID")
    rf.need(baseline["version"] == "0.61.0" and
            sha40(baseline["sourceCommit"]) and
            baseline["automaticRollback"] is False and
            all(digest(baseline["roles"][role]) for role in ROLES),
            "RF03_BASELINE_INVALID")
    # All review, signature and OCI values in this input are still user claims.
    # A real protected live reviewer/cryptographic verifier must re-check them.
    return {
        "kind": "RF03_RELEASE_HANDOFF_CHECKED_V1",
        "version": version,
        "sourceCommit": packet["sourceCommit"],
        "promotionSourceCommit": packet["promotionSourceCommit"],
        "candidateRunId": candidate["runId"],
        "promotionRunId": promotion["runId"],
        "expectedFinalRefs": finals,
        "state": "BLOCKED_LIVE_OWNER_CRYPTO_REGISTRY_PROOF_REQUIRED",
        "sourceProof": "STRUCTURAL_ONLY",
        "ownerAuthority": "NOT_VERIFIED",
        "signatureVerification": "NOT_VERIFIED",
        "ociGraphReadback": "NOT_VERIFIED",
        "registryPublication": "NOT_RUN",
        "externalWrites": 0,
    }
