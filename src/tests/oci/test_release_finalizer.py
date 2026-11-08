#!/usr/bin/env python3
"""RF-01 contract: exact source, CI, merge, read-only Main HOLD; no write permits."""
import base64
import copy
import hashlib
import importlib.util
import json
import time
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location(
    "release_finalizer", Path(__file__).with_name("release_finalizer.py"))
RF = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RF)

HEAD = "b" * 40
TREE = "c" * 40
BASE = "a" * 40
MERGE = "d" * 40
VERSION = "0.61.1"


def packet():
    return {
        "kind": "RELEASE_FINALIZER_REQUEST_V1",
        "repository": RF.REPO, "repositoryId": RF.REPO_ID, "ownerId": RF.OWNER_ID,
        "issueNumber": 218, "prNumber": 272, "prHeadSha": HEAD,
        "prTreeSha": TREE, "baseSha": BASE, "version": VERSION,
        "releaseRequired": True, "closeIssue": True,
        "roles": list(RF.ROLES), "nonce": "e" * 32,
        "stopPolicy": RF.STOP,
        "releaseTarget": RF.PACKAGE + ":v" + VERSION,
        "acceptanceIds": ["RF01", "RF02", "RF03", "RF04", "RF05"],
        "ownerIntent": {"integrate": True, "release": True, "closeIssue": True},
        "issuedAtEpoch": int(time.time()) - 20,
        "expiresAtEpoch": int(time.time()) + 3600,
    }


def parse(p):
    raw = json.dumps(p, sort_keys=True).encode()
    return RF.parse_packet(raw, hashlib.sha256(raw).hexdigest())


def job(name, run_id):
    return {"name": name, "run_id": run_id, "run_attempt": 1,
            "status": "completed", "conclusion": "success"}


class API:
    """Only synthetic trusted-API-like GET responses; no real network."""
    def __init__(self, merged=False):
        pr = {"number": 272, "state": "closed" if merged else "open",
              "merged": merged, "draft": False,
              "merge_commit_sha": MERGE if merged else None,
              "base": {"ref": "main", "sha": BASE},
              "head": {"sha": HEAD, "ref": "feat/release-test",
                       "repo": {"id": RF.REPO_ID}}}
        ci = {"id": 701, "run_number": 701, "head_sha": HEAD,
              "event": "pull_request", "path": RF.PR_WORKFLOW,
              "run_attempt": 1, "status": "completed", "conclusion": "success",
              "pull_requests": [{"number": 272}],
              "head_branch": "feat/release-test",
              "head_repository": {"id": RF.REPO_ID}}
        main = {"id": 26, "run_number": 26, "head_sha": MERGE,
                "event": "push", "path": RF.MAIN_WORKFLOW,
                "run_attempt": 1, "status": "completed", "conclusion": "success"}
        encoded = base64.b64encode(json.dumps({"version": VERSION}).encode()).decode()
        self.values = {
            "/pulls/272": pr,
            "/git/commits/" + HEAD: {"sha": HEAD, "tree": {"sha": TREE}},
            "/git/commits/" + MERGE: {"sha": MERGE, "tree": {"sha": TREE},
                                     "parents": [{"sha": BASE}]},
            "/contents/src/package.json?ref=" + HEAD: {
                "type": "file", "encoding": "base64", "content": encoded + "\n"},
            "/issues/218": {"number": 218, "state": "open"},
            "/actions/runs?head_sha=" + HEAD + "&event=pull_request&per_page=100": {
                "total_count": 1, "workflow_runs": [ci]},
            "/actions/runs/701/jobs?per_page=100": {
                "total_count": 3,
                "jobs": [job(name, 701) for name in RF.REQUIRED]
                        + [{"name": "Scope limited A2", "run_id": 701,
                            "status": "completed", "conclusion": "skipped"}]},
            "/actions/runs?head_sha=" + MERGE + "&event=push&per_page=100": {
                "total_count": 1, "workflow_runs": [main]},
            "/actions/runs/26/jobs?per_page=100": {
                "total_count": 1,
                "jobs": [job("Verify read-only GHCR release HOLD", 26)]},
        }
        self.requested = []

    def get(self, path):
        self.requested.append(path)
        return copy.deepcopy(self.values[path])


class PolicyTest(unittest.TestCase):
    def test_packet_rejects_wrong_target_clock_owner_and_ac(self):
        for label, change, code in (
            ("foreign-target", {"releaseTarget": "ghcr.io/other/app:v0.61.1"}, "RF_RELEASE_TARGET_INVALID"),
            ("wrong-tag", {"releaseTarget": RF.PACKAGE + ":latest"}, "RF_RELEASE_TARGET_INVALID"),
            ("expired", {"expiresAtEpoch": int(time.time()) - 1}, "RF_PACKET_EXPIRED_OR_CLOCK_INVALID"),
            ("too-long", {"expiresAtEpoch": int(time.time()) + 86401}, "RF_PACKET_EXPIRED_OR_CLOCK_INVALID"),
            ("intent", {"ownerIntent": {"integrate": True, "release": False, "closeIssue": True}}, "RF_OWNER_INTENT_INVALID"),
            ("missing-ac", {"acceptanceIds": []}, "RF_ACCEPTANCE_SCOPE_INVALID"),
            ("duplicate-ac", {"acceptanceIds": ["RF01", "RF01"]}, "RF_ACCEPTANCE_SCOPE_INVALID"),
        ):
            with self.subTest(label=label), self.assertRaisesRegex(RF.Blocked, "^" + code + "$"):
                parse({**packet(), **change})

    def test_attempt_two_never_reuses_pr_main_or_required_job(self):
        key = "/actions/runs?head_sha=" + HEAD + "&event=pull_request&per_page=100"
        api = API()
        api.values[key]["workflow_runs"][0]["run_attempt"] = 2
        with self.assertRaisesRegex(RF.Blocked, "^RF_RUN_REATTEMPT_BLOCKED$"):
            RF.plan(parse(packet()), api)
        api = API()
        api.values["/actions/runs/701/jobs?per_page=100"]["jobs"][0]["run_attempt"] = 2
        with self.assertRaisesRegex(RF.Blocked, "^RF_REQUIRED_JOB_NOT_SUCCESS$"):
            RF.plan(parse(packet()), api)
        api = API(merged=True)
        api.values["/actions/runs?head_sha=" + MERGE + "&event=push&per_page=100"]["workflow_runs"][0]["run_attempt"] = 2
        with self.assertRaisesRegex(RF.Blocked, "^RF_RUN_REATTEMPT_BLOCKED$"):
            RF.plan(parse(packet()), api)

    def test_packet_is_strict_and_sha_bound(self):
        self.assertEqual(parse(packet())["version"], VERSION)
        raw = json.dumps(packet()).encode()
        with self.assertRaisesRegex(RF.Blocked, "^RF_PACKET_HASH_INVALID$"):
            RF.parse_packet(raw + b" ", hashlib.sha256(raw).hexdigest())
        for label, value in (
            ("version-downgrade", {"version": "0.60.0"}),
            ("version-prerelease", {"version": "0.61.1-dev"}),
            ("extra-field", {"untrusted": "true"}),
            ("roles-missing", {"roles": ["app", "migrator"]}),
            ("wrong-owner", {"ownerId": 7}),
            ("wrong-repo", {"repository": "foreign/layoutManager"}),
            ("same-parent", {"baseSha": HEAD}),
            ("nonce", {"nonce": "short"}),
            ("unsafe-stop", {"stopPolicy": "IGNORE"}),
            ("bool-as-number", {"issueNumber": True}),
        ):
            with self.subTest(label=label), self.assertRaises(RF.Blocked):
                parse({**packet(), **value})
        bad = raw[:-1] + b',"version":"0.61.2"}'
        with self.assertRaises(RF.Blocked):
            RF.parse_packet(bad, hashlib.sha256(bad).hexdigest())

    def test_open_pr_checks_exact_head_and_waits_for_protected_merge(self):
        api = API()
        plan = RF.plan(parse(packet()), api)
        self.assertEqual(plan["state"], "AWAITING_REVIEW_AND_PROTECTED_MERGE")
        self.assertEqual(plan["prCiRunId"], 701)
        self.assertEqual(plan["externalWrites"], 0)
        self.assertEqual(plan["releaseAuthorization"], "NOT_VERIFIED")
        self.assertNotIn("/git/commits/" + MERGE, api.requested)

    def test_draft_requires_fresh_ready_check(self):
        api = API()
        api.values["/pulls/272"]["draft"] = True
        self.assertEqual(RF.plan(parse(packet()), api)["state"], "WAITING_READY_CI")

    def test_merged_pr_ci_empty_association_uses_exact_branch_and_sha(self):
        api = API(merged=True)
        key = "/actions/runs?head_sha=" + HEAD + "&event=pull_request&per_page=100"
        api.values[key]["workflow_runs"][0]["pull_requests"] = []
        self.assertEqual(RF.plan(parse(packet()), api)["state"],
                         "AWAITING_PROTECTED_THREE_ROLE_RELEASE")
        api = API(merged=True)
        api.values[key]["workflow_runs"][0]["pull_requests"] = []
        api.values[key]["workflow_runs"][0]["head_branch"] = "feat/foreign"
        self.assertEqual(RF.plan(parse(packet()), api)["state"], "WAITING_EXACT_PR_CI")

    def test_newer_ci_failure_cannot_reuse_older_success(self):
        api = API()
        runs = api.values["/actions/runs?head_sha=" + HEAD
                          + "&event=pull_request&per_page=100"]
        new = copy.deepcopy(runs["workflow_runs"][0])
        new.update(id=702, run_number=702, conclusion="failure")
        runs["workflow_runs"].append(new); runs["total_count"] = 2
        with self.assertRaisesRegex(RF.Blocked, "^RF_LATEST_CI_NOT_SUCCESS$"):
            RF.plan(parse(packet()), api)

    def test_required_check_and_ci_page_fail_closed(self):
        api = API()
        api.values["/actions/runs/701/jobs?per_page=100"]["jobs"][0]["conclusion"] = "skipped"
        with self.assertRaisesRegex(RF.Blocked, "RF_REQUIRED_JOB_NOT_SUCCESS"):
            RF.plan(parse(packet()), api)
        api = API()
        runs = api.values["/actions/runs?head_sha=" + HEAD
                          + "&event=pull_request&per_page=100"]
        runs["total_count"] = 101
        with self.assertRaisesRegex(RF.Blocked, "RF_RUN_PAGE_UNVERIFIED"):
            RF.plan(parse(packet()), api)

    def test_source_base_package_and_issue_are_not_inferred(self):
        for key, value in (("head", {"sha": "f" * 40, "repo": {"id": RF.REPO_ID}}),
                           ("base", {"ref": "main", "sha": "f" * 40})):
            api = API()
            api.values["/pulls/272"][key] = value
            with self.subTest(key=key), self.assertRaises(RF.Blocked):
                RF.plan(parse(packet()), api)
        api = API()
        api.values["/contents/src/package.json?ref=" + HEAD]["content"] = (
            base64.b64encode(b'{"version":"0.61.0"}').decode())
        with self.assertRaisesRegex(RF.Blocked, "RF_PACKAGE_VERSION_CHANGED"):
            RF.plan(parse(packet()), api)
        api = API()
        api.values["/issues/218"]["pull_request"] = {"url": "foreign"}
        with self.assertRaisesRegex(RF.Blocked, "RF_ISSUE_IDENTITY_INVALID"):
            RF.plan(parse(packet()), api)

    def test_merged_checks_tree_and_main_hold_then_stops_before_release(self):
        api = API(merged=True)
        plan = RF.plan(parse(packet()), api)
        self.assertEqual(plan["state"], "AWAITING_PROTECTED_THREE_ROLE_RELEASE")
        self.assertEqual((plan["mergeSha"], plan["mainCiRunId"]), (MERGE, 26))
        self.assertEqual(plan["externalWrites"], 0)
        self.assertEqual(plan["issueAcceptance"], "NOT_VERIFIED")
        api = API(merged=True)
        api.values["/pulls/272"]["base"]["sha"] = "f" * 40
        self.assertEqual(RF.plan(parse(packet()), api)["mergeSha"], MERGE)
        api = API(merged=True)
        api.values["/git/commits/" + MERGE]["tree"]["sha"] = "f" * 40
        with self.assertRaisesRegex(RF.Blocked, "RF_MERGE_TREE_OR_PARENT_INVALID"):
            RF.plan(parse(packet()), api)

    def test_promotion_and_issue_close_are_not_claimed_by_packet(self):
        api = API(merged=True)
        self.assertEqual(RF.plan(parse(packet()), api)["releaseAuthorization"],
                         "NOT_VERIFIED")
        p = packet(); p["releaseRequired"] = False
        p["ownerIntent"]["release"] = False
        self.assertEqual(RF.plan(parse(p), API(merged=True))["state"],
                         "AWAITING_INDEPENDENT_ISSUE_ACCEPTANCE")
        p["closeIssue"] = False
        p["ownerIntent"]["closeIssue"] = False
        self.assertNotEqual(RF.plan(parse(p), API(merged=True))["state"], "ISSUE_CLOSED")

    def test_main_hold_failure_and_missing_do_not_allow_release(self):
        api = API(merged=True)
        api.values["/actions/runs?head_sha=" + MERGE +
                   "&event=push&per_page=100"]["workflow_runs"] = []
        api.values["/actions/runs?head_sha=" + MERGE +
                   "&event=push&per_page=100"]["total_count"] = 0
        self.assertEqual(RF.plan(parse(packet()), api)["state"], "WAITING_EXACT_MAIN_CI")
        api = API(merged=True)
        api.values["/actions/runs/26/jobs?per_page=100"]["jobs"][0]["conclusion"] = "failure"
        with self.assertRaisesRegex(RF.Blocked, "RF_REQUIRED_JOB_NOT_SUCCESS"):
            RF.plan(parse(packet()), api)


if __name__ == "__main__":
    unittest.main()
