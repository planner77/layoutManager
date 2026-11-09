#!/usr/bin/env python3
"""RF-03 exact-version three-role release PLAN, with no registry writer.

The existing 0.61.0 candidate and promotion workflows have immutable fixed
contracts; this module MUST NOT reinterpret their approval as 0.61.1 authority.
The result is a source-bound plan, never an approved candidate or promotion.
"""
from __future__ import annotations

import json
import os
import re
import sys

import release_finalizer as rf

# Legacy #225 candidate/promotion writer contracts remain pinned to 0.61.0.
LEGACY_VERSION = (0, 61, 0)
SEMVER = re.compile(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\Z")
TARGET_ROLES = ("app", "migrator", "cpu-worker")
STOP = "HALT-no-retry-delete-overwrite-rollback"
REQUIRED_MAIN_STATUS = "AWAITING_PROTECTED_THREE_ROLE_RELEASE"


def version_parts(value: object) -> tuple[int, int, int]:
    rf.need(type(value) is str and len(value) <= 32, "RF03_VERSION_INVALID")
    match = SEMVER.fullmatch(value)
    rf.need(match is not None, "RF03_VERSION_INVALID")
    parts = tuple(int(g) for g in match.groups())
    rf.need(all(n <= 2147483647 for n in parts), "RF03_VERSION_INVALID")
    return parts


def exact_tags(version: str) -> dict[str, str]:
    """Canonical *actual* three-role GHCR tags, not the RF-01 intent label."""
    rf.need(version_parts(version) > LEGACY_VERSION, "RF03_LEGACY_IMMUTABLE")
    return {
        "app": rf.PACKAGE + ":" + version,
        "migrator": rf.PACKAGE + ":" + version + "-migrate",
        "cpu-worker": rf.PACKAGE + ":" + version + "-cpu-worker",
    }


def evaluate(request: dict, verified: dict, actual_main_ref: dict) -> dict:
    """Require a completed exact RF-01 PR+Main proof before planning release."""
    rf.need(type(request) is dict and type(verified) is dict
            and type(actual_main_ref) is dict,
            "RF03_INPUT_INVALID")
    release_version = request.get("version")
    tags = exact_tags(release_version)
    rf.need(request.get("repository") == rf.REPO
            and request.get("repositoryId") == rf.REPO_ID
            and request.get("ownerId") == rf.OWNER_ID
            and request.get("roles") == list(TARGET_ROLES)
            and request.get("releaseRequired") is True
            and request.get("stopPolicy") == rf.STOP
            and request.get("releaseTarget") == rf.PACKAGE + ":v" + release_version,
            "RF03_REQUEST_SCOPE_INVALID")
    rf.need(verified.get("kind") == "RELEASE_FINALIZER_PLAN_V1"
            and verified.get("state") == REQUIRED_MAIN_STATUS
            and verified.get("repository") == rf.REPO
            and verified.get("issueNumber") == request.get("issueNumber")
            and verified.get("prNumber") == request.get("prNumber")
            and verified.get("sourceSha") == request.get("prHeadSha")
            and verified.get("sourceTree") == request.get("prTreeSha")
            and verified.get("version") == release_version
            and verified.get("releaseTarget") == request.get("releaseTarget")
            and verified.get("releaseAuthorization") == "NOT_VERIFIED"
            and verified.get("issueAcceptance") == "NOT_VERIFIED"
            and verified.get("externalWrites") == 0,
            "RF03_MAIN_EVIDENCE_MISMATCH")
    merge_sha = verified.get("mergeSha")
    rf.need(type(merge_sha) is str and rf.HEX40.fullmatch(merge_sha)
            and type(verified.get("prCiRunId")) is int
            and verified["prCiRunId"] > 0
            and verified.get("prCiAttempt") == 1
            and type(verified.get("mainCiRunId")) is int
            and verified["mainCiRunId"] > 0
            and verified.get("mainCiAttempt") == 1,
            "RF03_MAIN_CI_REQUIRED")
    rf.need(actual_main_ref.get("ref") == "refs/heads/main"
            and type(actual_main_ref.get("object")) is dict
            and actual_main_ref["object"].get("type") == "commit"
            and actual_main_ref["object"].get("sha") == merge_sha,
            "RF03_MAIN_HEAD_DRIFT")
    # This is explicitly not a proof of registry absence, image availability,
    # signatures, digest role identity, Owner approval, or persistent nonce.
    return {
        "kind": "RF03_EXACT_VERSION_PLAN_V1",
        "state": "BLOCKED_PROTECTED_MAIN_AND_OWNER_RELEASE_APPROVAL_REQUIRED",
        "repository": rf.REPO,
        "issueNumber": request["issueNumber"],
        "releaseVersion": release_version,
        "releaseIntent": request["releaseTarget"],
        "releaseIntentIsPublishedTag": False,
        "expectedFinalRefs": tags,
        "roles": list(TARGET_ROLES),
        "platform": "linux/amd64",
        "sourceCommit": merge_sha,
        "sourceTree": request["prTreeSha"],
        "prCiRunId": verified["prCiRunId"],
        "mainCiRunId": verified["mainCiRunId"],
        "mainCiAttempt": 1,
        "candidateApproval": "SEPARATE_FRESH_OWNER_REVIEW_REQUIRED",
        "promotionApproval": "SEPARATE_FRESH_OWNER_REVIEW_REQUIRED",
        "candidateSignedArtifact": "NOT_VERIFIED",
        "ociRoleDigests": "NOT_VERIFIED",
        "registryReadback": "NOT_VERIFIED",
        "rollbackBaseline": "NOT_VERIFIED",
        "previousImmutableRelease": "0.61.0_READ_ONLY",
        "existingWriterVersion": "0.61.0",
        "ownerAuthority": "NOT_VERIFIED",
        "issueAcceptance": "NOT_VERIFIED",
        "externalWrites": 0,
        "stopPolicy": STOP,
    }


def main() -> int:
    try:
        rf.need(sys.argv[1:] == ["plan"]
                and os.getenv("GITHUB_REPOSITORY") == rf.REPO
                and os.getenv("GITHUB_REPOSITORY_ID") == str(rf.REPO_ID)
                and os.getenv("GITHUB_REPOSITORY_OWNER_ID") == str(rf.OWNER_ID)
                and os.getenv("GITHUB_ACTOR_ID") == str(rf.OWNER_ID)
                and os.getenv("GITHUB_REF") == "refs/heads/main"
                and os.getenv("GITHUB_EVENT_NAME") == "workflow_dispatch"
                and os.getenv("GITHUB_RUN_ATTEMPT") == "1",
                "RF03_READ_ONLY_CONTEXT_INVALID")
        raw = os.environ.get("RF_PACKET_JSON", "").encode("utf-8")
        p = rf.parse_packet(raw, os.environ.get("RF_PACKET_SHA256", ""))
        api = rf.ReadOnlyGitHub(os.environ.get("RF_READ_TOKEN", ""))
        prior = rf.plan(p, api)
        rf.need(type(prior.get("mergeSha")) is str
                and os.environ.get("GITHUB_SHA") == prior["mergeSha"],
                "RF03_WORKFLOW_MAIN_SHA_CHANGED")
        result = evaluate(p, prior, api.get("/git/ref/heads/main"))
        print(json.dumps(result, sort_keys=True, separators=(",", ":")))
        return 0
    except rf.Blocked as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
