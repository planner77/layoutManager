#!/usr/bin/env python3
"""RF-03 independent GitHub readback of Candidate/Promotion runs and reviews.

Read-only metadata audit. A successful audit proves only that GitHub run, job,
environment review and artifact metadata match submitted handoff claims. It
does NOT verify Sigstore cryptography, OCI graph bytes, Owner release GO, or
GHCR publication. The original 0.61.0 publisher remains immutable.
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import json

import candidate_policy as ca
import release_finalizer as rf
import rf03_release_handoff as handoff

ENVIRONMENT = ca.ENVIRONMENT
STAGES = {
    "candidate": (handoff.CANDIDATE_WORKFLOW,
                  "Candidate publish | ", "CANDIDATE PUBLISH | "),
    "promotion": (handoff.PROMOTION_WORKFLOW,
                  "Promote exact digests | ", "PROMOTION PUBLISH | "),
}


def require(ok, code):
    rf.need(ok, code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True).encode("utf-8")


def evidence_sha(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def check_source(api, source, tree, version):
    commit = api.get("/git/commits/" + source)
    require(type(commit) is dict and commit.get("sha") == source
            and type(commit.get("tree")) is dict
            and commit["tree"].get("sha") == tree,
            "RF03_GIT_SOURCE_TREE_INVALID")
    doc = api.get("/contents/src/package.json?ref=" + source)
    require(type(doc) is dict and doc.get("type") == "file"
            and doc.get("encoding") == "base64"
            and type(doc.get("content")) is str,
            "RF03_PACKAGE_METADATA_UNVERIFIED")
    encoded = doc["content"].replace("\n", "")
    require(0 < len(encoded) <= 1000000,
            "RF03_PACKAGE_METADATA_UNVERIFIED")
    try:
        value = json.loads(base64.b64decode(encoded, validate=True),
                           object_pairs_hook=handoff.unique)
    except (binascii.Error, UnicodeError, ValueError, RecursionError,
            TypeError):
        raise rf.Blocked("RF03_PACKAGE_UNVERIFIED") from None
    require(type(value) is dict and value.get("version") == version,
            "RF03_SOURCE_PACKAGE_VERSION_MISMATCH")


def approval_receipt(stage, claim):
    return {
        "runId": claim["runId"],
        "runAttempt": 1,
        "workflowPath": STAGES[stage][0],
        "sourceCommit": claim["sourceCommit"],
        "packetSha256": claim["packetSha256"],
        "jobId": claim["approvalJobId"],
        "environmentId": claim["environmentId"],
        "environmentName": ENVIRONMENT,
        "reviewerId": rf.OWNER_ID,
        "state": "approved",
    }


def check_run(api, stage, claim):
    workflow, job_prefix, title_prefix = STAGES[stage]
    rid = claim["runId"]
    run = api.get("/actions/runs/" + str(rid) + "/attempts/1")
    require(type(run) is dict
            and run.get("id") == rid
            and type(run.get("repository")) is dict
            and run["repository"].get("id") == rf.REPO_ID
            and run.get("head_sha") == claim["sourceCommit"]
            and run.get("head_branch") == "main"
            and run.get("path") == workflow
            and run.get("event") == "workflow_dispatch"
            and type(run.get("run_attempt")) is int
            and run["run_attempt"] == 1
            and run.get("status") == "completed"
            and run.get("conclusion") == "success"
            and run.get("display_title") == title_prefix + claim["packetSha256"]
            and type(run.get("actor")) is dict
            and run["actor"].get("id") == rf.OWNER_ID
            and type(run.get("triggering_actor")) is dict
            and run["triggering_actor"].get("id") == rf.OWNER_ID,
            "RF03_GITHUB_RUN_NOT_VERIFIED")

    jobs = api.get("/actions/runs/" + str(rid) +
                   "/attempts/1/jobs?per_page=100")
    require(type(jobs) is dict and type(jobs.get("jobs")) is list
            and type(jobs.get("total_count")) is int
            and 0 <= jobs["total_count"] <= 100
            and len(jobs["jobs"]) == jobs["total_count"],
            "RF03_RUN_JOBS_PAGE_UNVERIFIED")
    matching = [j for j in jobs["jobs"]
                if type(j) is dict and
                j.get("name") == job_prefix + claim["packetSha256"]]
    require(len(matching) == 1
            and matching[0].get("id") == claim["approvalJobId"]
            and matching[0].get("run_id") == rid
            and matching[0].get("head_sha") == claim["sourceCommit"]
            and matching[0].get("status") == "completed"
            and matching[0].get("conclusion") == "success"
            and all(type(j) is dict
                    and j.get("conclusion") in ("success", "skipped")
                    for j in jobs["jobs"]),
            "RF03_PUBLISH_JOB_NOT_SUCCESS")

    approvals = api.get("/actions/runs/" + str(rid) + "/approvals")
    require(type(approvals) is list and len(approvals) == 1,
            "RF03_APPROVAL_HISTORY_UNVERIFIED")
    entry = approvals[0]
    require(type(entry) is dict
            and entry.get("state") == "approved"
            and type(entry.get("user")) is dict
            and entry["user"].get("id") == rf.OWNER_ID
            and type(entry.get("environments")) is list
            and len(entry["environments"]) == 1
            and type(entry["environments"][0]) is dict
            and entry["environments"][0].get("id") == claim["environmentId"]
            and entry["environments"][0].get("name") == ENVIRONMENT,
            "RF03_OWNER_APPROVAL_NOT_OBSERVED")
    # Canonicalized REST data is a binding checksum, NOT a signed GO.
    require(evidence_sha(approval_receipt(stage, claim)) ==
            claim["approvalEvidenceSha256"],
            "RF03_APPROVAL_RECEIPT_CHANGED")
    return {"runId": rid, "jobId": claim["approvalJobId"],
            "reviewerId": rf.OWNER_ID,
            "environmentId": claim["environmentId"],
            "evidenceSha256": claim["approvalEvidenceSha256"]}


def check_artifact(api, packet):
    claim = packet["candidate"]
    artifact = packet["artifact"]
    rid, aid = claim["runId"], artifact["id"]
    meta = api.get("/actions/artifacts/" + str(aid))
    require(type(meta) is dict
            and meta.get("id") == aid
            and meta.get("name") ==
            "issue225-candidate-proof-" + str(rid) + "-1"
            and meta.get("size_in_bytes") == artifact["size"]
            and meta.get("digest") == artifact["digest"]
            and meta.get("expired") is False
            and type(meta.get("workflow_run")) is dict
            and meta["workflow_run"].get("id") == rid
            and meta["workflow_run"].get("repository_id") == rf.REPO_ID
            and meta["workflow_run"].get("head_sha") ==
            packet["sourceCommit"],
            "RF03_ARTIFACT_METADATA_UNVERIFIED")
    inventory = api.get("/actions/runs/" + str(rid) +
                        "/artifacts?per_page=100")
    require(type(inventory) is dict
            and inventory.get("total_count") == 1
            and type(inventory.get("artifacts")) is list
            and len(inventory["artifacts"]) == 1
            and inventory["artifacts"][0] == meta,
            "RF03_ARTIFACT_INVENTORY_UNVERIFIED")
    return {"id": aid, "digest": artifact["digest"]}


def check_environment(api, expected_ids):
    """Unknown administrator-bypass UI policy is a blocker, not false."""
    env = api.get("/environments/" + ENVIRONMENT)
    require(type(env) is dict and env.get("name") == ENVIRONMENT
            and type(env.get("id")) is int
            and expected_ids == {env["id"]}
            and env.get("deployment_branch_policy") ==
            {"protected_branches": False,
             "custom_branch_policies": True}
            and type(env.get("protection_rules")) is list,
            "RF03_ENVIRONMENT_NOT_VERIFIED")
    rules = env["protection_rules"]
    reviewers = [x for x in rules
                 if type(x) is dict and x.get("type") == "required_reviewers"]
    require(len(reviewers) == 1
            and type(reviewers[0].get("reviewers")) is list
            and len(reviewers[0]["reviewers"]) == 1
            and reviewers[0]["reviewers"][0].get("type") == "User"
            and reviewers[0]["reviewers"][0].get(
                "reviewer", {}).get("id") == rf.OWNER_ID
            and reviewers[0].get("prevent_self_review") is False,
            "RF03_ENV_REVIEW_POLICY_UNVERIFIED")
    require(env.get("can_admins_bypass") is False,
            "RF03_ENV_ADMIN_BYPASS_UNKNOWN")
    return {"environmentId": env["id"], "policy": "OBSERVED_NO_ADMIN_BYPASS"}


def audit(packet, original_plan, api):
    """Observe GitHub metadata, no release authorization or network writes."""
    structure = handoff.check(packet, original_plan)
    version = packet["version"]
    # A candidate may have been built from an older exact Main commit A.
    # The promotion verifier must itself be the *current* protected Main B.
    main_ref = api.get("/git/ref/heads/main")
    require(type(main_ref) is dict
            and main_ref.get("ref") == "refs/heads/main"
            and type(main_ref.get("object")) is dict
            and main_ref["object"].get("type") == "commit"
            and main_ref["object"].get("sha") ==
            packet["promotionSourceCommit"],
            "RF03_PROMOTION_MAIN_DRIFT")
    check_source(api, packet["sourceCommit"],
                 packet["sourceTree"], version)
    check_source(api, packet["promotionSourceCommit"],
                 packet["promotionSourceTree"], version)
    ca_run = check_run(api, "candidate", packet["candidate"])
    pr_run = check_run(api, "promotion", packet["promotion"])
    require(ca_run["runId"] != pr_run["runId"]
            and ca_run["jobId"] != pr_run["jobId"]
            and ca_run["evidenceSha256"] != pr_run["evidenceSha256"],
            "RF03_OWNER_APPROVAL_REUSED")
    env = check_environment(
        api, {packet["candidate"]["environmentId"],
              packet["promotion"]["environmentId"]})
    art = check_artifact(api, packet)
    return {**structure,
            "state": "BLOCKED_CRYPTOGRAPHIC_OCI_AND_REGISTRY_PROOF_REQUIRED",
            "githubEvidence": "MATCHED_READ_ONLY",
            "ownerReviewHistory": "OBSERVED_NOT_RELEASE_AUTHORITY",
            "environmentPolicy": env["policy"],
            "artifactMetadata": "MATCHED_NOT_ARTIFACT_BYTES",
            "candidateRunId": ca_run["runId"],
            "promotionRunId": pr_run["runId"],
            "candidateArtifactId": art["id"],
            "ownerAuthority": "NOT_VERIFIED",
            "signatureVerification": "NOT_VERIFIED",
            "ociGraphReadback": "NOT_VERIFIED",
            "registryPublication": "NOT_RUN",
            "externalWrites": 0}


def audit_candidate(packet, original_plan, api):
    """Candidate-only GitHub metadata gate, before separate Promotion exists.

    Reuse the original strict run/approval/environment/artifact validators.
    Promotion run/job/review are intentionally NOT asserted to have happened.
    This is read-only metadata, not downloaded archive bytes or Owner GO.
    """
    shape = handoff.check(packet, original_plan)
    main = api.get("/git/ref/heads/main")
    require(type(main) is dict and main.get("ref") == "refs/heads/main"
            and type(main.get("object")) is dict
            and main["object"].get("type") == "commit"
            and main["object"].get("sha") == packet["promotionSourceCommit"],
            "RF03_CANDIDATE_MAIN_DRIFT")
    version = packet["version"]
    check_source(api, packet["sourceCommit"], packet["sourceTree"], version)
    check_source(api, packet["promotionSourceCommit"],
                 packet["promotionSourceTree"], version)
    candidate_run = check_run(api, "candidate", packet["candidate"])
    environment = check_environment(api, {
        packet["candidate"]["environmentId"],
        packet["promotion"]["environmentId"]})
    artifact = check_artifact(api, packet)
    return {
        "kind": "RF03_CANDIDATE_METADATA_READBACK_V1",
        "state": "BLOCKED_CANDIDATE_BYTES_SIGNATURE_AND_PROMOTION_REQUIRED",
        "version": version,
        "sourceCommit": shape["sourceCommit"],
        "sourceTree": packet["sourceTree"],
        "promotionCodeSource": packet["promotionSourceCommit"],
        "candidateRunId": candidate_run["runId"],
        "candidateApprovalJobId": candidate_run["jobId"],
        "candidateReviewEvidenceSha256": candidate_run["evidenceSha256"],
        "environmentPolicy": environment["policy"],
        "artifactId": artifact["id"],
        "artifactDigest": artifact["digest"],
        "candidateReviewHistory": "OBSERVED_NOT_RELEASE_AUTHORITY",
        "promotionReviewHistory": "NOT_VERIFIED",
        "archiveBytes": "NOT_VERIFIED",
        "signatureVerification": "NOT_VERIFIED",
        "ownerAuthority": "NOT_VERIFIED",
        "registryPublication": "NOT_RUN",
        "externalWrites": 0,
    }
