#!/usr/bin/env python3
"""RF-01 checkpoint + RF-04 fully gated Issue closure, Owner dispatch only.

PLAN has zero writes. RECORD-MAIN appends only a verified CI checkpoint.
CLOSE independently revalidates original signed Candidate, fresh separate
Owner Promotion, exact three final GHCR graphs, historical baseline, original
operation receipt and every explicit Issue AC before writing CLOSE_INTENT.
A missing/uncertain result HALTs: never auto-retry Issue PATCH or GHCR PUT.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import sys

import release_finalizer as rf
import release_finalizer_checkpoint as cp
import release_finalizer_release_proof as proof
import rf03_readback as github

WORKFLOW = ".github/workflows/release-finalizer-finish.yml"
ENVIRONMENT = "issue225-candidate-publish"
JOB_NAME = "RF-04 protected Issue close"
CHECKED = re.compile(r"^- \[([ xX])\] \*\*([A-Z][A-Z0-9_-]{1,31})\*\*")
MAX_BUNDLE = 60000


def need(value, code):
    rf.need(value, code)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def load_bundle(env):
    raw = env.get("RF_BUNDLE_JSON", "").encode()
    expected = env.get("RF_BUNDLE_SHA256", "")
    need(type(expected) is str and rf.HEX64.fullmatch(expected)
         and 0 < len(raw) <= MAX_BUNDLE and digest(raw) == expected,
         "RF04_BUNDLE_HASH_INVALID")
    try:
        parsed = json.loads(raw, object_pairs_hook=rf.unique,
                            parse_constant=lambda _: (_ for _ in ()).throw(
                                rf.Blocked("RF04_BUNDLE_NONFINITE")))
    except rf.Blocked:
        raise
    except (ValueError, UnicodeError, RecursionError):
        raise rf.Blocked("RF04_BUNDLE_JSON_INVALID") from None
    need(type(parsed) is dict and
         0 < len(cp.canonical(parsed)) <= MAX_BUNDLE,
         "RF04_BUNDLE_INVALID")
    return parsed


def acceptance(issue, packet, body_sha):
    """Exact issue-body acceptance scope, not caller-asserted PASS flags."""
    need(type(issue) is dict and issue.get("number") == packet["issueNumber"]
         and issue.get("state") == "open" and "pull_request" not in issue
         and type(issue.get("body")) is str and
         len(issue["body"].encode()) <= 256 * 1024
         and type(body_sha) is str and rf.HEX64.fullmatch(body_sha)
         and digest(issue["body"].encode("utf-8")) == body_sha,
         "RF04_ISSUE_OR_AC_BODY_CHANGED")
    values = []
    for line in issue["body"].splitlines():
        match = CHECKED.match(line)
        if match:
            values.append((match.group(2), match.group(1).lower() == "x"))
    ids = [name for name, _ in values]
    need(len(ids) == len(set(ids)) and set(ids) == set(packet["acceptanceIds"])
         and len(ids) > 0 and all(done for _, done in values),
         "RF04_AC_INCOMPLETE_OR_MISMATCH")
    need(packet["closeIssue"] is True and
         packet["releaseRequired"] is True and
         packet["ownerIntent"] == {
             "integrate": True, "release": True, "closeIssue": True},
         "RF04_OWNER_CLOSE_INTENT_REQUIRED")
    return {"issueBodySha256": body_sha, "checkedAcceptanceIds": sorted(ids)}


def main_proof(packet, token, github_sha):
    """Reuse actual RF-01 PR/Main proof, including required CI and HOLD job."""
    need(packet["releaseRequired"] is True
         and packet["closeIssue"] is True,
         "RFCP_REQUEST_SCOPE_NOT_RELEASE_CLOSE")
    api = rf.ReadOnlyGitHub(token)
    result = rf.plan(packet, api)
    need(result.get("state") == "AWAITING_PROTECTED_THREE_ROLE_RELEASE"
         and result.get("mergeSha") == github_sha
         and type(result.get("prCiRunId")) is int
         and type(result.get("mainCiRunId")) is int
         and result.get("mainCiAttempt") == 1
         and result.get("prCiAttempt") == 1,
         "RFCP_MAIN_OR_REQUIRED_CI_NOT_VERIFIED")
    main = api.get("/git/ref/heads/main")
    need(main.get("ref") == "refs/heads/main"
         and main.get("object", {}).get("sha") == github_sha
         and main["object"].get("type") == "commit",
         "RFCP_CURRENT_MAIN_DRIFT")
    return {"kind": "RFCP_EXACT_MAIN_PROOF_V1", "mainSha": github_sha,
            "prCiRunId": result["prCiRunId"],
            "mainCiRunId": result["mainCiRunId"],
            "prHeadSha": packet["prHeadSha"],
            "treeSha": packet["prTreeSha"],
            "externalWrites": 0}


def owner_review(token, env, packet_sha, candidate_run, promotion_run):
    """Independent *third* actual protected environment approval for Close."""
    api = github.SafeReadOnlyGitHub(token)
    runid = int(env["GITHUB_RUN_ID"])
    run = api.get("/actions/runs/" + str(runid) + "/attempts/1")
    need(type(run) is dict and run.get("id") == runid
         and run.get("path") == WORKFLOW
         and run.get("head_sha") == env["GITHUB_SHA"]
         and run.get("event") == "workflow_dispatch"
         and run.get("run_attempt") == 1
         and run.get("status") == "in_progress"
         and run.get("actor", {}).get("id") == rf.OWNER_ID
         and run.get("triggering_actor", {}).get("id") == rf.OWNER_ID
         and run.get("display_title") ==
         "FINALIZER ISSUE CLOSE | " + packet_sha
         and runid not in (candidate_run, promotion_run),
         "RF04_CLOSE_OWNER_RUN_UNVERIFIED")
    jobs = api.get("/actions/runs/" + str(runid) +
                   "/attempts/1/jobs?per_page=100")
    matches = [j for j in jobs.get("jobs", [])
               if type(j) is dict and j.get("name") == JOB_NAME]
    need(len(matches) == 1 and matches[0].get("run_id") == runid
         and matches[0].get("head_sha") == env["GITHUB_SHA"]
         and matches[0].get("status") == "in_progress"
         and type(matches[0].get("id")) is int,
         "RF04_CLOSE_JOB_UNVERIFIED")
    reviews = api.get("/actions/runs/" + str(runid) + "/approvals")
    need(type(reviews) is list and len(reviews) == 1
         and reviews[0].get("state") == "approved"
         and reviews[0].get("user", {}).get("id") == rf.OWNER_ID
         and type(reviews[0].get("environments")) is list
         and len(reviews[0]["environments"]) == 1
         and reviews[0]["environments"][0].get("name") == ENVIRONMENT,
         "RF04_CLOSE_FRESH_OWNER_APPROVAL_MISSING")
    policy = api.get("/environments/" + ENVIRONMENT)
    need(policy.get("id") == reviews[0]["environments"][0].get("id")
         and policy.get("can_admins_bypass") is False,
         "RF04_CLOSE_ENV_ADMIN_BYPASS_UNKNOWN")
    return {"kind": "RF04_FRESH_OWNER_CLOSE_REVIEW_V1",
            "runId": runid, "jobId": matches[0]["id"],
            "environmentId": policy["id"], "reviewerId": rf.OWNER_ID}


def execute(mode, env, token, store, release_verify=proof.verify):
    """Release verifier dependency-injected only to run isolated negative tests.

    Production main() always passes the real live GHCR + GitHub/Sigstore
    verifier. No check is satisfiable by a user-declared PASS receipt.
    """
    runid = cp.runtime(env, WORKFLOW)
    raw = env.get("RF_PACKET_JSON", "").encode()
    psha = env.get("RF_PACKET_SHA256", "")
    packet = rf.parse_packet(raw, psha)
    main_sha = env["GITHUB_SHA"]
    before = main_proof(packet, token, main_sha)
    issue = store.issue_read()
    need(issue.get("state") == "open", "RF04_ISSUE_ALREADY_CLOSED")
    stages, previous = cp.chain(store.comments(), packet, main_sha)
    if mode == "plan":
        return {"kind": "RF_FINALIZER_PLAN_WITH_CHECKPOINT_V1",
                "state": stages[-1]["stage"] if stages else "READY_TO_RECORD_MAIN",
                "nextStage": cp.STAGES[len(stages)] if len(stages) < 4 else "MANUAL_RECONCILIATION_REQUIRED",
                "checkpointSha256": previous,
                "mainCiRunId": before["mainCiRunId"],
                "ownerAuthority": "NOT_VERIFIED",
                "releaseAuthorization": "NOT_VERIFIED",
                "issueAcceptance": "NOT_VERIFIED", "externalWrites": 0}
    need(mode in ("record-main", "close"), "RFCP_MODE_INVALID")
    need(type(env.get("RF_EXPECTED_PREVIOUS_SHA256")) is str
         and env["RF_EXPECTED_PREVIOUS_SHA256"] ==
         (previous or ""), "RFCP_PREVIOUS_CHECKPOINT_CHANGED")
    if mode == "record-main":
        need(not stages, "RFCP_MAIN_ALREADY_RECORDED")
        proof_main = {**before, "evidenceSource": "RF01_LIVE_PLAN",
                      "noExternalPublication": True}
        proposed = cp.proposed_event(packet, psha, main_sha, stages, previous,
                                     "MAIN_VERIFIED", proof_main, runid)
        last = store.append(proposed, packet, main_sha)
        return {"kind": "RFCP_MAIN_RECORDED_V1", "stage": "MAIN_VERIFIED",
                "checkpointSha256": last, "externalWrites": 1,
                "releaseAuthorization": "NOT_VERIFIED"}
    need(1 <= len(stages) <= 3 and stages[0]["stage"] == "MAIN_VERIFIED",
         "RF04_CHECKPOINT_SEQUENCE_NOT_READY")
    need(all(e["packetSha256"] != psha for e in stages),
         "RF04_NONCE_OR_REQUEST_PACKET_REPLAYED")
    bundle = load_bundle(env)
    ac = acceptance(issue, packet, bundle["issueBodySha256"])
    workspace = Path(env.get("RF_WORKSPACE", ""))
    need(workspace.is_absolute() and workspace.is_dir()
         and not workspace.is_symlink(),
         "RF04_WORKSPACE_INVALID")
    evidence = release_verify(packet, bundle, main_sha, env["GITHUB_ACTOR"],
                              token, workspace, Path(env["RF_GH_ARCHIVE"]),
                              Path(env["RF_GH_BINARY"]))
    need(type(evidence) is dict and evidence.get("kind") ==
         "RF04_LIVE_VERIFIED_RELEASE_V1"
         and evidence.get("mainSha") == main_sha
         and evidence.get("version") == packet["version"]
         and evidence.get("externalWrites") == 0
         and type(evidence.get("roleDigests")) is dict
         and set(evidence["roleDigests"]) == set(rf.ROLES),
         "RF04_RELEASE_INDEPENDENT_PROOF_MISSING")
    closing_review = owner_review(token, env, psha,
                                  evidence["candidateRunId"],
                                  evidence["promotionRunId"])
    # Repeat exact issue-body gate immediately before any external state write.
    need(acceptance(store.issue_read(), packet,
                    bundle["issueBodySha256"]) == ac,
         "RF04_AC_DRIFT_BEFORE_WRITE")
    proof_stage = {"acSha256": ac["issueBodySha256"],
                   "verifiedRelease": evidence, "ownerCloseReview": closing_review,
                   "main": before}
    last = previous
    for stage in cp.STAGES[len(stages):]:
        updated, observed = cp.chain(store.comments(), packet, main_sha)
        need(observed == last, "RF04_CHECKPOINT_DRIFT")
        stage_proof = {**proof_stage, "stage": stage,
                       "transition": "NO_GHCR_OR_TAG_WRITE"}
        event = cp.proposed_event(packet, psha, main_sha, updated, last,
                                  stage, stage_proof, runid)
        last = store.append(event, packet, main_sha)
    # CLOSE_INTENT persisted *before* the one PATCH. Unknown network result
    # must be reconciled manually and must never trigger an automatic retry.
    need(acceptance(store.issue_read(), packet,
                    bundle["issueBodySha256"]) == ac,
         "RF04_AC_DRIFT_BEFORE_CLOSE")
    result = store.close_once(packet, main_sha, last)
    return {**result, "rf04VerifiedAcceptanceIds": ac["checkedAcceptanceIds"],
            "candidateRunId": evidence["candidateRunId"],
            "promotionRunId": evidence["promotionRunId"]}


def main():
    try:
        args = sys.argv[1:]
        need(len(args) == 1 and args[0] in ("plan", "record-main", "close"),
             "RFCP_COMMAND_INVALID")
        mode = args[0]
        token = os.environ.get("RF_JOB_TOKEN", "")
        p = rf.parse_packet(os.environ.get("RF_PACKET_JSON", "").encode(),
                            os.environ.get("RF_PACKET_SHA256", ""))
        store = cp.IssueStore(token, p["issueNumber"])
        result = execute(mode, os.environ, token, store)
        print(json.dumps(result, sort_keys=True, separators=(",", ":")))
        return 0
    except (rf.Blocked, ValueError) as error:
        # No credentials or API payloads in diagnostics.
        message = str(error)
        print(message if re.fullmatch(r"[A-Z][A-Z0-9_]{3,100}", message)
              else "RFCP_OPERATION_BLOCKED_OR_UNCERTAIN", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
