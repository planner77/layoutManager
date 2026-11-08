#!/usr/bin/env python3
"""Release Finalizer RF-01: read-only, fail-closed exact-source preflight.

This module cannot merge, publish GHCR, alter release HOLD, or close issues.
Its result is NEVER an authorization for a write. Future writer stages must
independently bind actual Owner/environment reviews and signed 3-role receipts.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

REPO = "planner77/layoutManager"
PACKAGE = "ghcr.io/planner77/layoutmanager"
REPO_ID = 1359528829
OWNER_ID = 45478892
PR_WORKFLOW = ".github/workflows/pr-ci.yml"
MAIN_WORKFLOW = ".github/workflows/main-hold.yml"
REQUIRED = ("Typecheck, lint, test, build, E2E",
            "Classify PR scope and audit merge defaults")
ROLES = ("app", "migrator", "cpu-worker")
MAX_PACKET = 8192
MAX_API_RESPONSE = 2 * 1024 * 1024
HEX40 = re.compile(r"[0-9a-f]{40}\Z")
HEX64 = re.compile(r"[0-9a-f]{64}\Z")
HEX32 = re.compile(r"[0-9a-f]{32}\Z")
VERSION = re.compile(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\Z")
STOP = "HALT-no-bypass-retry-delete-overwrite-rollback"


class Blocked(ValueError):
    """Only an allowlisted safe error code is exposed to Actions output."""


def need(value: bool, code: str) -> None:
    if not value:
        raise Blocked(code)


def unique(pairs):
    result = {}
    for key, value in pairs:
        need(key not in result, "RF_DUPLICATE_JSON_KEY")
        result[key] = value
    return result


def parse_packet(raw: bytes, digest: str, now: int | None = None) -> dict:
    need(type(raw) is bytes and len(raw) <= MAX_PACKET
         and type(digest) is str and HEX64.fullmatch(digest) is not None
         and hashlib.sha256(raw).hexdigest() == digest, "RF_PACKET_HASH_INVALID")
    try:
        p = json.loads(raw, object_pairs_hook=unique,
                       parse_constant=lambda _: (_ for _ in ()).throw(Blocked("RF_JSON_INVALID")))
    except (ValueError, UnicodeError, RecursionError):
        raise Blocked("RF_JSON_INVALID") from None
    keys = {"kind", "repository", "repositoryId", "ownerId", "issueNumber",
            "prNumber", "prHeadSha", "prTreeSha", "baseSha", "version",
            "releaseRequired", "closeIssue", "roles", "nonce", "stopPolicy",
            "releaseTarget", "acceptanceIds", "ownerIntent", "issuedAtEpoch",
            "expiresAtEpoch"}
    need(type(p) is dict and set(p) == keys, "RF_PACKET_FIELDS_INVALID")
    need(p["kind"] == "RELEASE_FINALIZER_REQUEST_V1"
         and p["repository"] == REPO and type(p["repositoryId"]) is int
         and p["repositoryId"] == REPO_ID and type(p["ownerId"]) is int
         and p["ownerId"] == OWNER_ID, "RF_REPOSITORY_INVALID")
    need(all(type(p[k]) is int and 1 <= p[k] <= 2147483647
             for k in ("issueNumber", "prNumber"))
         and p["issueNumber"] != p["prNumber"], "RF_ISSUE_PR_INVALID")
    need(all(type(p[k]) is str and HEX40.fullmatch(p[k])
             for k in ("prHeadSha", "prTreeSha", "baseSha"))
         and len({p["prHeadSha"], p["baseSha"]}) == 2, "RF_SHA_INVALID")
    match = VERSION.fullmatch(p["version"]) if type(p["version"]) is str else None
    need(match is not None and len(p["version"]) <= 32
         and (0, 61, 0) <= tuple(map(int, match.groups()))
         and all(int(part) <= 2147483647 for part in match.groups()),
         "RF_VERSION_INVALID")
    need(type(p["releaseRequired"]) is bool and type(p["closeIssue"]) is bool
         and p["roles"] == list(ROLES) and
         type(p["nonce"]) is str and HEX32.fullmatch(p["nonce"]) is not None
         and p["stopPolicy"] == STOP, "RF_SCOPE_INVALID")
    # Packet intent is not protected Owner authority or a release approval.
    need(type(p["releaseTarget"]) is str
         and p["releaseTarget"] == PACKAGE + ":v" + p["version"],
         "RF_RELEASE_TARGET_INVALID")
    instant = int(time.time()) if now is None else now
    need(type(instant) is int
         and type(p["issuedAtEpoch"]) is int
         and type(p["expiresAtEpoch"]) is int
         and 0 < p["issuedAtEpoch"] <= instant <= p["expiresAtEpoch"]
         and 0 <= p["expiresAtEpoch"] - p["issuedAtEpoch"] <= 86400,
         "RF_PACKET_EXPIRED_OR_CLOCK_INVALID")
    intent = p["ownerIntent"]
    need(type(intent) is dict
         and set(intent) == {"integrate", "release", "closeIssue"}
         and all(type(value) is bool for value in intent.values())
         and intent["integrate"] is True
         and intent["release"] is p["releaseRequired"]
         and intent["closeIssue"] is p["closeIssue"],
         "RF_OWNER_INTENT_INVALID")
    ac = p["acceptanceIds"]
    need(type(ac) is list and len(ac) <= 64
         and all(type(name) is str and
                 re.fullmatch(r"[A-Z][A-Z0-9_-]{1,31}", name) for name in ac)
         and len(set(ac)) == len(ac)
         and (not p["closeIssue"] or bool(ac)),
         "RF_ACCEPTANCE_SCOPE_INVALID")
    return p


def read_run(rows: dict, head: str, workflow: str, event: str,
             pr_number=None, pr_branch=None, pr_merged=False):
    need(type(rows) is dict and type(rows.get("workflow_runs")) is list
         and type(rows.get("total_count")) is int
         and 0 <= rows["total_count"] <= 100
         and len(rows["workflow_runs"]) == rows["total_count"], "RF_RUN_PAGE_UNVERIFIED")
    candidates = [r for r in rows["workflow_runs"]
                  if type(r) is dict and r.get("head_sha") == head
                  and r.get("path") == workflow and r.get("event") == event]
    if pr_number is not None:
        # Association with a *different* PR must never satisfy this PR's
        # required CI, even if a same-repo branch/commit is reused.
        # GitHub can clear associations after squash; only then, and only
        # for an actually merged PR, allow exact same-repo branch+SHA.
        candidates = [
            r for r in candidates
            if type(r.get("pull_requests")) is list
            and (
                any(type(q) is dict and type(q.get("number")) is int
                    and q["number"] == pr_number for q in r["pull_requests"])
                or (
                    pr_merged is True and r["pull_requests"] == []
                    and type(pr_branch) is str and bool(pr_branch)
                    and r.get("head_branch") == pr_branch
                    and type(r.get("head_repository")) is dict
                    and r["head_repository"].get("id") == REPO_ID
                )
            )
        ]
    if not candidates:
        return None
    need(all(type(r.get("run_number")) is int and
             type(r.get("id")) is int and r["id"] > 0
             for r in candidates), "RF_RUN_ID_INVALID")
    latest = max(candidates, key=lambda x: x["run_number"])
    need(sum(r.get("run_number") == latest["run_number"] for r in candidates) == 1,
         "RF_RUN_AMBIGUOUS")
    need(type(latest.get("run_attempt")) is int
         and latest["run_attempt"] == 1, "RF_RUN_REATTEMPT_BLOCKED")
    need(latest.get("status") == "completed" and latest.get("conclusion") == "success",
         "RF_LATEST_CI_NOT_SUCCESS")
    return latest


def check_jobs(payload: dict, run_id: int, required: tuple[str, ...]) -> None:
    need(type(payload) is dict and type(payload.get("jobs")) is list
         and type(payload.get("total_count")) is int
         and payload["total_count"] <= 100
         and len(payload["jobs"]) == payload["total_count"], "RF_JOBS_PAGE_UNVERIFIED")
    for name in required:
        matches = [j for j in payload["jobs"]
                   if type(j) is dict and j.get("name") == name]
        need(len(matches) == 1 and matches[0].get("run_id") == run_id
             and matches[0].get("run_attempt") == 1
             and matches[0].get("status") == "completed"
             and matches[0].get("conclusion") == "success",
             "RF_REQUIRED_JOB_NOT_SUCCESS")
    need(not any(j.get("conclusion") in ("failure", "cancelled", "timed_out")
                 for j in payload["jobs"] if type(j) is dict),
         "RF_APPLICABLE_JOB_FAILURE")


def plan(p: dict, api) -> dict:
    """Evaluate current GitHub evidence through a fixed read-only GET adapter."""
    pr = api.get(f"/pulls/{p['prNumber']}")
    need(type(pr) is dict and pr.get("number") == p["prNumber"]
         and pr.get("base", {}).get("ref") == "main"
         and pr.get("head", {}).get("sha") == p["prHeadSha"]
         and pr.get("head", {}).get("repo", {}).get("id") == REPO_ID
         and (pr.get("merged") is True or
              pr.get("base", {}).get("sha") == p["baseSha"]),
         "RF_PR_IDENTITY_CHANGED")
    commit = api.get("/git/commits/" + p["prHeadSha"])
    need(commit.get("sha") == p["prHeadSha"]
         and commit.get("tree", {}).get("sha") == p["prTreeSha"],
         "RF_TREE_CHANGED")
    manifest = api.get("/contents/src/package.json?ref=" + p["prHeadSha"])
    need(type(manifest) is dict and manifest.get("type") == "file"
         and manifest.get("encoding") == "base64"
         and type(manifest.get("content")) is str, "RF_PACKAGE_UNVERIFIED")
    try:
        encoded = manifest["content"].replace("\n", "")
        need(len(encoded) <= 1000000
             and re.fullmatch("[A-Za-z0-9+/]*={0,2}", encoded) is not None,
             "RF_PACKAGE_UNVERIFIED")
        package = json.loads(base64.b64decode(encoded, validate=True))
    except (ValueError, UnicodeError):
        raise Blocked("RF_PACKAGE_UNVERIFIED") from None
    need(type(package) is dict and package.get("version") == p["version"],
         "RF_PACKAGE_VERSION_CHANGED")
    issue = api.get(f"/issues/{p['issueNumber']}")
    need(type(issue) is dict and issue.get("number") == p["issueNumber"]
         and "pull_request" not in issue
         and issue.get("state") in ("open", "closed"), "RF_ISSUE_IDENTITY_INVALID")
    runs = api.get("/actions/runs?head_sha=" + p["prHeadSha"]
                   + "&event=pull_request&per_page=100")
    pr_run = read_run(runs, p["prHeadSha"], PR_WORKFLOW,
                      "pull_request", p["prNumber"], pr.get("head", {}).get("ref"),
                      pr_merged=pr.get("merged") is True)
    output = {"kind": "RELEASE_FINALIZER_PLAN_V1", "repository": REPO,
              "issueNumber": p["issueNumber"], "prNumber": p["prNumber"],
              "sourceSha": p["prHeadSha"], "sourceTree": p["prTreeSha"],
              "version": p["version"], "releaseTarget": p["releaseTarget"],
              "acceptanceScopeCount": len(p["acceptanceIds"]), "externalWrites": 0,
              "ownerAuthority": "NOT_VERIFIED",
              "releaseAuthorization": "NOT_VERIFIED",
              "issueAcceptance": "NOT_VERIFIED"}
    if pr_run is None:
        return {**output, "state": "WAITING_EXACT_PR_CI"}
    check_jobs(api.get(f"/actions/runs/{pr_run['id']}/jobs?per_page=100"),
               pr_run["id"], REQUIRED)
    output["prCiRunId"] = pr_run["id"]
    output["prCiAttempt"] = 1
    if not pr.get("merged"):
        need(pr.get("state") == "open", "RF_PR_CLOSED_UNMERGED")
        return {**output, "state": "WAITING_READY_CI" if pr.get("draft")
                else "AWAITING_REVIEW_AND_PROTECTED_MERGE"}
    need(pr.get("state") == "closed"
         and type(pr.get("merge_commit_sha")) is str
         and HEX40.fullmatch(pr["merge_commit_sha"]) is not None,
         "RF_MERGE_NOT_PROVEN")
    merged = api.get("/git/commits/" + pr["merge_commit_sha"])
    need(merged.get("sha") == pr["merge_commit_sha"]
         and merged.get("tree", {}).get("sha") == p["prTreeSha"]
         and type(merged.get("parents")) is list
         and len(merged["parents"]) == 1
         and merged["parents"][0].get("sha") == p["baseSha"],
         "RF_MERGE_TREE_OR_PARENT_INVALID")
    output["mergeSha"] = merged["sha"]
    main_runs = api.get("/actions/runs?head_sha=" + merged["sha"]
                        + "&event=push&per_page=100")
    main_run = read_run(main_runs, merged["sha"], MAIN_WORKFLOW, "push")
    if main_run is None:
        return {**output, "state": "WAITING_EXACT_MAIN_CI"}
    check_jobs(api.get(f"/actions/runs/{main_run['id']}/jobs?per_page=100"),
               main_run["id"], ("Verify read-only GHCR release HOLD",))
    output["mainCiRunId"] = main_run["id"]
    output["mainCiAttempt"] = 1
    # Neither a request packet nor CI success is an Owner release or AC proof.
    # RF-03 must bind actual signed three-role promotion to this exact source.
    if p["releaseRequired"]:
        return {**output, "state": "AWAITING_PROTECTED_THREE_ROLE_RELEASE"}
    return {**output, "state": "AWAITING_INDEPENDENT_ISSUE_ACCEPTANCE"}


class ReadOnlyGitHub:
    """Fixed-repository GET only. No redirects/URLs or write verbs from packet."""
    def __init__(self, token: str):
        need(type(token) is str and token != "", "RF_READ_TOKEN_MISSING")
        self.token = token

    def get(self, path: str):
        need(type(path) is str and path.startswith("/")
             and "://" not in path and ".." not in path, "RF_API_PATH_INVALID")
        url = "https://api.github.com/repos/" + REPO + path
        request = urllib.request.Request(url, headers={
            "Accept": "application/vnd.github+json",
            "Authorization": "Bearer " + self.token,
            "X-GitHub-Api-Version": "2022-11-28"}, method="GET")
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                raw = response.read(MAX_API_RESPONSE + 1)
                need(response.status == 200 and len(raw) <= MAX_API_RESPONSE,
                     "RF_API_RESPONSE_INVALID")
                return json.loads(raw, object_pairs_hook=unique)
        except (OSError, ValueError, UnicodeError):
            raise Blocked("RF_API_READ_UNVERIFIED") from None


def main() -> int:
    try:
        need(sys.argv[1:] == ["plan"] and os.getenv("GITHUB_REPOSITORY") == REPO
             and os.getenv("GITHUB_REPOSITORY_ID") == str(REPO_ID)
             and os.getenv("GITHUB_REPOSITORY_OWNER_ID") == str(OWNER_ID)
             and os.getenv("GITHUB_ACTOR_ID") == str(OWNER_ID)
             and os.getenv("GITHUB_REF") == "refs/heads/main"
             and os.getenv("GITHUB_EVENT_NAME") == "workflow_dispatch"
             and os.getenv("GITHUB_RUN_ATTEMPT") == "1",
             "RF_READ_ONLY_CONTEXT_INVALID")
        p = parse_packet(os.environ.get("RF_PACKET_JSON", "").encode("utf-8"),
                         os.environ.get("RF_PACKET_SHA256", ""))
        result = plan(p, ReadOnlyGitHub(os.environ.get("RF_READ_TOKEN", "")))
        print(json.dumps(result, sort_keys=True, separators=(",", ":")))
        return 0
    except Blocked as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
