#!/usr/bin/env python3
"""RF-02 owner-scoped, exact-source protected PR integration.

This module is intentionally incapable of GHCR/Tag/Issue writes.
RF-01 remains the source of truth for packet, PR CI, tree and version checks.
The Owner manual dispatch permits one GitHub protected squash only; neither
the packet nor the workflow constitutes RF-03/RF-04 authorization.
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request

import release_finalizer as rf

RULESET_ID = 26731716
REQUIRED_FULL = (
    "Classify PR scope and audit merge defaults",
    "Static, unit, benchmark and production build",
    "Docker image size, migration and runtime smoke",
    "G7 signed runtime and legacy migration E2E",
    "G7 Greenfield UI E2E (#109)",
    "General Chromium E2E (shard 1/2)",
    "General Chromium E2E (shard 2/2)",
    "Typecheck, lint, test, build, E2E",
)
WORKFLOW = ".github/workflows/release-finalizer-integrate.yml"
REVIEW_QUERY = """
query($owner:String!, $repo:String!, $number:Int!, $cursor:String) {
  repository(owner:$owner,name:$repo) {
    pullRequest(number:$number) {
      number
      headRefOid
      reviewThreads(first:100,after:$cursor) {
        nodes {isResolved}
        pageInfo {hasNextPage endCursor}
      }
    }
  }
}
"""


def check_context(env: dict, mode: str) -> None:
    rf.need(mode in ("plan", "integrate", "readback"),
            "RF02_MODE_INVALID")
    rf.need(env.get("GITHUB_REPOSITORY") == rf.REPO
            and env.get("GITHUB_REPOSITORY_ID") == str(rf.REPO_ID)
            and env.get("GITHUB_REPOSITORY_OWNER_ID") == str(rf.OWNER_ID)
            and env.get("GITHUB_ACTOR_ID") == str(rf.OWNER_ID)
            and env.get("RF_SENDER_ID") == str(rf.OWNER_ID)
            and env.get("GITHUB_EVENT_NAME") == "workflow_dispatch"
            and env.get("GITHUB_RUN_ATTEMPT") == "1"
            and env.get("GITHUB_REF") == "refs/heads/main"
            and re.fullmatch("[0-9a-f]{40}", env.get("GITHUB_SHA", "")),
            "RF02_OWNER_DISPATCH_INVALID")


def check_ruleset(ruleset: dict) -> None:
    rf.need(type(ruleset) is dict
            and ruleset.get("id") == RULESET_ID
            and ruleset.get("enforcement") == "active"
            and ruleset.get("target") == "branch"
            and ruleset.get("source") == rf.REPO
            and ruleset.get("bypass_actors") == []
            and ruleset.get("current_user_can_bypass") == "never"
            and "refs/heads/main" in ruleset.get("conditions", {}).get(
                "ref_name", {}).get("include", []),
            "RF02_RULESET_IDENTITY_INVALID")
    rules = ruleset.get("rules")
    rf.need(type(rules) is list, "RF02_RULESET_UNVERIFIED")
    pr_rules = [x["parameters"] for x in rules
                if type(x) is dict and x.get("type") == "pull_request"
                and type(x.get("parameters")) is dict]
    ci_rules = [x["parameters"] for x in rules
                if type(x) is dict and x.get("type") == "required_status_checks"
                and type(x.get("parameters")) is dict]
    rf.need(len(pr_rules) == 1 and len(ci_rules) == 1,
            "RF02_RULESET_UNVERIFIED")
    pr, ci = pr_rules[0], ci_rules[0]
    rf.need(pr.get("allowed_merge_methods") == ["squash"]
            and pr.get("required_review_thread_resolution") is True
            and type(pr.get("required_approving_review_count")) is int
            and pr.get("required_approving_review_count") == 0
            and ci.get("strict_required_status_checks_policy") is True
            and type(ci.get("required_status_checks")) is list
            and {"context": rf.REQUIRED[0], "integration_id": 15368}
            in ci["required_status_checks"],
            "RF02_RULESET_POLICY_CHANGED")


def check_reviews(data: list, threads: list) -> None:
    rf.need(type(data) is list and len(data) < 100
            and all(type(v) is dict for v in data),
            "RF02_REVIEWS_PAGE_UNVERIFIED")
    # A pending CHANGES_REQUESTED review is a stopping condition; no admin bypass.
    # Even if subsequently dismissed, require an explicit review/plan update.
    rf.need(not any(v.get("state") == "CHANGES_REQUESTED" for v in data),
            "RF02_CHANGES_REQUESTED")
    rf.need(type(threads) is list and
            all(type(t) is dict and type(t.get("isResolved")) is bool
                for t in threads)
            and all(t["isResolved"] for t in threads),
            "RF02_UNRESOLVED_REVIEW_THREAD")


def check_scope(api, pr_num: int, ci_run_id: int) -> None:
    files = api.get("/pulls/" + str(pr_num) + "/files?per_page=100")
    rf.need(type(files) is list and 0 < len(files) < 100
            and all(type(f) is dict and type(f.get("filename")) is str
                    for f in files), "RF02_CHANGED_FILES_UNVERIFIED")
    docs_only = all(f["filename"].endswith(".md") for f in files)
    names = rf.REQUIRED if docs_only else REQUIRED_FULL
    jobs = api.get("/actions/runs/" + str(ci_run_id) + "/jobs?per_page=100")
    rf.check_jobs(jobs, ci_run_id, names)
    rf.need(type(jobs.get("jobs")) is list
            and all(j.get("conclusion") in ("success", "skipped")
                    for j in jobs["jobs"] if type(j) is dict),
            "RF02_APPLICABLE_JOB_UNVERIFIED")


def premerge(packet: dict, api, workflow_sha: str) -> dict:
    """No writes. Return bounded evidence used for a single protected merge."""
    rf.need(type(workflow_sha) is str and rf.HEX40.fullmatch(workflow_sha)
            and workflow_sha == packet["baseSha"],
            "RF02_DISPATCH_BASE_DRIFT")
    initial = rf.plan(packet, api)
    rf.need(initial.get("state") == "AWAITING_REVIEW_AND_PROTECTED_MERGE",
            "RF02_PR_CI_OR_READY_INCOMPLETE")
    pr = api.get("/pulls/" + str(packet["prNumber"]))
    rf.need(pr.get("merged") is False and pr.get("state") == "open"
            and pr.get("draft") is False and pr.get("mergeable") is True
            and pr.get("base", {}).get("ref") == "main"
            and pr.get("base", {}).get("sha") == packet["baseSha"]
            and pr.get("head", {}).get("sha") == packet["prHeadSha"],
            "RF02_PR_NOT_MERGEABLE")
    title = pr.get("title")
    rf.need(type(title) is str and len(title) < 180
            and title.startswith("#" + str(packet["issueNumber"]) + " | "),
            "RF02_PR_ISSUE_SCOPE_MISMATCH")
    issue = api.get("/issues/" + str(packet["issueNumber"]))
    rf.need(issue.get("state") == "open",
            "RF02_ISSUE_NOT_OPEN")
    main_ref = api.get("/git/ref/heads/main")
    rf.need(main_ref.get("ref") == "refs/heads/main"
            and main_ref.get("object", {}).get("sha") == packet["baseSha"]
            and main_ref.get("object", {}).get("type") == "commit",
            "RF02_MAIN_BASE_DRIFT")
    check_ruleset(api.get("/rulesets/" + str(RULESET_ID)))
    check_reviews(api.get("/pulls/" + str(packet["prNumber"]) +
                          "/reviews?per_page=100"),
                  api.review_threads(packet["prNumber"],
                                     packet["prHeadSha"]))
    check_scope(api, packet["prNumber"], initial["prCiRunId"])
    return {**initial, "state": "PROTECTED_SQUASH_READY",
            "baseSha": packet["baseSha"], "prCiAttempt": 1,
            "rulesetId": RULESET_ID, "reviewThreads": "RESOLVED",
            "mergeMethod": "squash", "externalWrites": 0}


def readback(packet: dict, api, merge_sha=None) -> dict:
    """Prove exactly one squash and same tree/base; Main CI may be pending."""
    pr = api.get("/pulls/" + str(packet["prNumber"]))
    sha = pr.get("merge_commit_sha")
    rf.need(pr.get("merged") is True and pr.get("state") == "closed"
            and pr.get("head", {}).get("sha") == packet["prHeadSha"]
            and type(sha) is str and rf.HEX40.fullmatch(sha)
            and (merge_sha is None or sha == merge_sha),
            "RF02_MERGED_PR_IDENTITY_INVALID")
    commit = api.get("/git/commits/" + sha)
    rf.need(commit.get("sha") == sha
            and commit.get("tree", {}).get("sha") == packet["prTreeSha"]
            and type(commit.get("parents")) is list
            and len(commit["parents"]) == 1
            and commit["parents"][0].get("sha") == packet["baseSha"],
            "RF02_MERGE_TREE_PARENT_INVALID")
    # Main push CI is asynchronous. A successful merge cannot be marked
    # failed merely because the exact Main HOLD run is still in progress.
    # Check PR CI and the entire merged identity through the RF-01 planner,
    # treating ONLY the observed pending Main run as a waiting checkpoint.
    main_query = ("/actions/runs?head_sha=" + sha +
                  "&event=push&per_page=100")
    runs = api.get(main_query)
    rf.need(type(runs) is dict and type(runs.get("workflow_runs")) is list
            and type(runs.get("total_count")) is int
            and 0 <= runs["total_count"] <= 100
            and len(runs["workflow_runs"]) == runs["total_count"],
            "RF02_MAIN_RUN_PAGE_UNVERIFIED")
    candidates = [r for r in runs["workflow_runs"]
                  if type(r) is dict and r.get("head_sha") == sha
                  and r.get("path") == rf.MAIN_WORKFLOW
                  and r.get("event") == "push"]
    if candidates:
        rf.need(all(type(r.get("run_number")) is int for r in candidates),
                "RF02_MAIN_RUN_UNVERIFIED")
        latest = max(candidates, key=lambda r: r["run_number"])
        rf.need(latest.get("run_attempt") == 1, "RF02_MAIN_REATTEMPT_BLOCKED")
        if latest.get("status") in ("queued", "in_progress", "waiting", "requested", "pending"):
            rf.need(latest.get("conclusion") is None, "RF02_MAIN_STATE_UNVERIFIED")
            class PendingMainAdapter:
                def get(self, path):
                    if path == main_query:
                        return {"total_count": 0, "workflow_runs": []}
                    return api.get(path)
            evidence = rf.plan(packet, PendingMainAdapter())
            rf.need(evidence.get("state") == "WAITING_EXACT_MAIN_CI",
                    "RF02_READBACK_UNVERIFIED")
            return {**evidence, "kind": "RELEASE_FINALIZER_INTEGRATION_V1",
                    "mergeMethod": "squash", "stage": "MERGED_WAITING_MAIN_CI",
                    "releaseAuthorization": "NOT_VERIFIED",
                    "issueAcceptance": "NOT_VERIFIED",
                    "ghcrWrites": 0, "issueWrites": 0}
    evidence = rf.plan(packet, api)
    rf.need(evidence.get("mergeSha") == sha
            and evidence.get("state") in (
                "WAITING_EXACT_MAIN_CI",
                "AWAITING_PROTECTED_THREE_ROLE_RELEASE",
                "AWAITING_INDEPENDENT_ISSUE_ACCEPTANCE"),
            "RF02_READBACK_UNVERIFIED")
    return {**evidence, "kind": "RELEASE_FINALIZER_INTEGRATION_V1",
            "mergeMethod": "squash",
            "stage": ("MAIN_VERIFIED" if evidence.get("mainCiRunId")
                      else "MERGED_WAITING_MAIN_CI"),
            "releaseAuthorization": "NOT_VERIFIED",
            "issueAcceptance": "NOT_VERIFIED",
            "ghcrWrites": 0, "issueWrites": 0}


def integrate(packet: dict, api, workflow_sha: str) -> dict:
    """Single merge mutation under Owner workflow_dispatch and normal Ruleset."""
    verified = premerge(packet, api, workflow_sha)
    # Re-read immutable identity immediately before server-enforced protected merge.
    pr = api.get("/pulls/" + str(packet["prNumber"]))
    main_ref = api.get("/git/ref/heads/main")
    rf.need(pr.get("head", {}).get("sha") == packet["prHeadSha"]
            and pr.get("base", {}).get("sha") == packet["baseSha"]
            and pr.get("draft") is False
            and main_ref.get("object", {}).get("sha") == packet["baseSha"],
            "RF02_PREMERGE_CAS_CHANGED")
    result = api.merge(packet["prNumber"], packet["prHeadSha"],
                       pr["title"], packet["issueNumber"])
    rf.need(type(result) is dict and result.get("merged") is True
            and type(result.get("sha")) is str
            and rf.HEX40.fullmatch(result["sha"]),
            "RF02_MERGE_RESULT_UNVERIFIED")
    return {**readback(packet, api, merge_sha=result["sha"]),
            "prCiRunId": verified["prCiRunId"],
            "mergeMutation": "ONE_PROTECTED_SQUASH"}


class GitHubAPI(rf.ReadOnlyGitHub):
    """Restrict network to fixed-repository GET, read-only GraphQL and one merge."""
    def _request(self, url: str, payload: dict) -> dict:
        body = json.dumps(payload, sort_keys=True,
                          separators=(",", ":")).encode("utf-8")
        req = urllib.request.Request(url, data=body, headers={
            "Accept": "application/vnd.github+json",
            "Authorization": "Bearer " + self.token,
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=15) as response:
                raw = response.read(rf.MAX_API_RESPONSE + 1)
                rf.need(response.status == 200
                        and len(raw) <= rf.MAX_API_RESPONSE,
                        "RF02_GRAPHQL_RESPONSE_INVALID")
                return json.loads(raw, object_pairs_hook=rf.unique)
        except (OSError, ValueError, UnicodeError):
            raise rf.Blocked("RF02_GRAPHQL_UNVERIFIED") from None

    def review_threads(self, pr_num: int, head_sha: str) -> list:
        cursor = None
        all_threads = []
        for _ in range(10):
            payload = self._request("https://api.github.com/graphql", {
                "query": REVIEW_QUERY,
                "variables": {"owner": "planner77", "repo": "layoutManager",
                              "number": pr_num, "cursor": cursor}})
            rf.need(type(payload) is dict and not payload.get("errors")
                    and type(payload.get("data")) is dict,
                    "RF02_GRAPHQL_UNVERIFIED")
            repo = payload["data"].get("repository")
            pr = repo.get("pullRequest") if type(repo) is dict else None
            rf.need(type(pr) is dict and pr.get("number") == pr_num
                    and pr.get("headRefOid") == head_sha,
                    "RF02_THREAD_PR_IDENTITY_CHANGED")
            page = pr.get("reviewThreads")
            rf.need(type(page) is dict and type(page.get("nodes")) is list
                    and type(page.get("pageInfo")) is dict
                    and len(page["nodes"]) <= 100,
                    "RF02_THREAD_PAGE_UNVERIFIED")
            all_threads.extend(page["nodes"])
            info = page["pageInfo"]
            if info.get("hasNextPage") is False:
                return all_threads
            cursor = info.get("endCursor")
            rf.need(info.get("hasNextPage") is True
                    and type(cursor) is str and bool(cursor),
                    "RF02_THREAD_PAGE_UNVERIFIED")
        raise rf.Blocked("RF02_THREAD_PAGE_OVERFLOW")

    def merge(self, pr_num: int, head: str, title: str, issue: int) -> dict:
        path = "/pulls/" + str(pr_num) + "/merge"
        url = "https://api.github.com/repos/" + rf.REPO + path
        payload = {"sha": head, "merge_method": "squash",
                   "commit_title": title, "commit_message": "Refs #" + str(issue)}
        req = urllib.request.Request(
            url, data=json.dumps(payload).encode("utf-8"), headers={
                "Accept": "application/vnd.github+json",
                "Authorization": "Bearer " + self.token,
                "Content-Type": "application/json",
                "X-GitHub-Api-Version": "2022-11-28"}, method="PUT")
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                raw = response.read(65537)
                rf.need(response.status == 200 and len(raw) <= 65536,
                        "RF02_MERGE_RESULT_UNVERIFIED")
                return json.loads(raw, object_pairs_hook=rf.unique)
        except (OSError, ValueError, UnicodeError):
            # A network timeout after PUT has UNKNOWN remote state. Do not retry.
            raise rf.Blocked("RF02_MERGE_RESULT_UNKNOWN_NO_RETRY") from None


def main() -> int:
    try:
        mode = os.environ.get("RF02_MODE", "")
        check_context(os.environ, mode)
        p = rf.parse_packet(os.environ.get("RF_PACKET_JSON", "").encode("utf-8"),
                            os.environ.get("RF_PACKET_SHA256", ""))
        api = GitHubAPI(os.environ.get("RF_JOB_TOKEN", ""))
        if mode == "plan":
            result = premerge(p, api, os.environ["GITHUB_SHA"])
        elif mode == "readback":
            result = readback(p, api)
        else:
            result = integrate(p, api, os.environ["GITHUB_SHA"])
        print(json.dumps(result, sort_keys=True, separators=(",", ":")))
        if os.environ.get("RF02_RECEIPT_FILE"):
            with open(os.environ["RF02_RECEIPT_FILE"], "w", encoding="utf-8") as output:
                json.dump(result, output, sort_keys=True, separators=(",", ":"))
        return 0
    except rf.Blocked as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
