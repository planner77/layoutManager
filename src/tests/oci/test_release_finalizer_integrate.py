#!/usr/bin/env python3
"""Deterministic RF-02 owner/Ruleset/CI protected integration regressions."""
from __future__ import annotations

import copy
import importlib.util
from pathlib import Path
import time
import unittest

import release_finalizer as rf
import release_finalizer_integrate as ri
from test_release_finalizer import API, BASE, HEAD, MERGE, packet, parse, job

TEST_SHA = "e" * 64


RULESET = {
    "id": ri.RULESET_ID,
    "source": rf.REPO,
    "target": "branch",
    "enforcement": "active",
    "bypass_actors": [],
    "current_user_can_bypass": "never",
    "conditions": {"ref_name": {"include": ["refs/heads/main"], "exclude": []}},
    "rules": [
        {"type": "pull_request", "parameters": {
            "allowed_merge_methods": ["squash"],
            "required_review_thread_resolution": True,
            "required_approving_review_count": 0}},
        {"type": "required_status_checks", "parameters": {
            "strict_required_status_checks_policy": True,
            "required_status_checks": [
                {"context": rf.REQUIRED[0], "integration_id": 15368}]}},
    ],
}


class IntegrationAPI(API):
    def __init__(self):
        super().__init__(merged=False)
        pr = self.values["/pulls/272"]
        pr.update(title="#218 | deterministic sample integration",
                  mergeable=True)
        self.values["/git/ref/heads/main"] = {
            "ref": "refs/heads/main", "object": {"sha": BASE, "type": "commit"}}
        self.values["/issues/218"]["state"] = "open"
        self.values["/rulesets/" + str(ri.RULESET_ID)] = copy.deepcopy(RULESET)
        self.values["/pulls/272/reviews?per_page=100"] = []
        self.values["/pulls/272/files?per_page=100"] = [
            {"filename": "src/tests/oci/test_release_finalizer_integrate.py"}]
        self.values["/actions/runs/701/jobs?per_page=100"]["jobs"] = [
            job(name, 701) for name in ri.REQUIRED_FULL
        ] + [
            {"name": "#218 P1-A2 CPU-only Debian/headless synthetic proof",
             "run_id": 701, "status": "completed", "conclusion": "skipped"}
        ]
        self.values["/actions/runs/701/jobs?per_page=100"]["total_count"] = 9
        self.thread_values = [{"isResolved": True}]
        self.merge_calls = []
        self.dispatch_calls = []
        self.values["/actions/runs?head_sha=" + MERGE +
                    "&event=workflow_dispatch&per_page=100"] = {
                        "total_count": 0, "workflow_runs": []}

    def review_threads(self, number, head):
        if number != 272 or head != HEAD:
            raise rf.Blocked("TEST_WRONG_THREAD_TARGET")
        return copy.deepcopy(self.thread_values)

    def dispatch_main(self, sha, packet_sha):
        if (sha != MERGE or packet_sha != TEST_SHA or
                self.values["/git/ref/heads/main"]["object"]["sha"] != MERGE):
            raise rf.Blocked("TEST_BAD_DISPATCH")
        self.dispatch_calls.append((sha, packet_sha))

    def merge(self, number, head, title, issue):
        self.merge_calls.append((number, head, title, issue))
        if number != 272 or head != HEAD or issue != 218:
            raise rf.Blocked("TEST_UNEXPECTED_MERGE")
        p = self.values["/pulls/272"]
        p.update(state="closed", merged=True, merge_commit_sha=MERGE)
        self.values["/git/ref/heads/main"]["object"]["sha"] = MERGE
        return {"merged": True, "sha": MERGE}


class RF02Tests(unittest.TestCase):
    def test_read_only_premerge_binds_exact_run_ruleset_threads_and_base(self):
        api = IntegrationAPI()
        result = ri.premerge(parse(packet()), api, BASE)
        self.assertEqual(result["state"], "PROTECTED_SQUASH_READY")
        self.assertEqual(result["prCiRunId"], 701)
        self.assertEqual(result["rulesetId"], ri.RULESET_ID)
        self.assertEqual(result["externalWrites"], 0)
        self.assertFalse(api.merge_calls)

    def test_actual_merge_is_one_protected_squash_and_readback(self):
        api = IntegrationAPI()
        result = ri.integrate(parse(packet()), api, BASE, TEST_SHA)
        self.assertEqual(result["stage"], "MAIN_VERIFIED")
        self.assertEqual(result["mergeSha"], MERGE)
        self.assertEqual(result["mainCiRunId"], 26)
        self.assertEqual(result["mergeMutation"], "ONE_PROTECTED_SQUASH")
        self.assertEqual(result["releaseAuthorization"], "NOT_VERIFIED")
        self.assertEqual(result["issueAcceptance"], "NOT_VERIFIED")
        self.assertEqual(result["ghcrWrites"], 0)
        self.assertEqual(result["issueWrites"], 0)
        self.assertEqual(api.merge_calls, [(272, HEAD, api.values["/pulls/272"]["title"], 218)])

    def test_duplicate_merge_is_not_mutated_again(self):
        api = IntegrationAPI()
        p = parse(packet())
        ri.integrate(p, api, BASE, TEST_SHA)
        with self.assertRaises(rf.Blocked):
            ri.integrate(p, api, BASE, TEST_SHA)
        self.assertEqual(len(api.merge_calls), 1)
        self.assertEqual(ri.readback(p, api)["stage"], "MAIN_VERIFIED")

    def test_pr_and_base_drift_draft_or_wrong_merge_method_stop(self):
        for label, mutate in (
            ("not-ready", lambda a: a.values["/pulls/272"].update(draft=True)),
            ("mergeable-null", lambda a: a.values["/pulls/272"].update(mergeable=None)),
            ("base-drift", lambda a: a.values["/git/ref/heads/main"]["object"].update(sha="f" * 40)),
            ("ruleset-bypass", lambda a: a.values["/rulesets/" + str(ri.RULESET_ID)].update(bypass_actors=[{"id": 123}])),
            ("ruleset-policy", lambda a: a.values["/rulesets/" + str(ri.RULESET_ID)]["rules"][0]["parameters"].update(allowed_merge_methods=["merge"])),
            ("issue-closed", lambda a: a.values["/issues/218"].update(state="closed")),
        ):
            with self.subTest(label=label):
                api = IntegrationAPI()
                mutate(api)
                with self.assertRaises(rf.Blocked):
                    ri.premerge(parse(packet()), api, BASE)
                self.assertEqual(api.merge_calls, [])

    def test_review_thread_and_requested_changes_block_without_mutation(self):
        api = IntegrationAPI()
        api.thread_values = [{"isResolved": False}]
        with self.assertRaisesRegex(rf.Blocked, "RF02_UNRESOLVED_REVIEW_THREAD"):
            ri.integrate(parse(packet()), api, BASE, TEST_SHA)
        self.assertFalse(api.merge_calls)
        api = IntegrationAPI()
        api.values["/pulls/272/reviews?per_page=100"] = [
            {"state": "CHANGES_REQUESTED"}]
        with self.assertRaisesRegex(rf.Blocked, "RF02_CHANGES_REQUESTED"):
            ri.integrate(parse(packet()), api, BASE, TEST_SHA)
        self.assertFalse(api.merge_calls)

    def test_latest_wrong_pr_success_cannot_hide_failed_own_pr(self):
        api = IntegrationAPI()
        key = "/actions/runs?head_sha=" + HEAD + "&event=pull_request&per_page=100"
        own = api.values[key]["workflow_runs"][0]
        own["conclusion"] = "failure"
        foreign = copy.deepcopy(own)
        foreign.update(id=702, run_number=702, conclusion="success",
                       pull_requests=[{"number": 999}])
        api.values[key]["workflow_runs"].append(foreign)
        api.values[key]["total_count"] = 2
        with self.assertRaisesRegex(rf.Blocked, "RF_LATEST_CI_NOT_SUCCESS"):
            ri.integrate(parse(packet()), api, BASE, TEST_SHA)
        self.assertFalse(api.merge_calls)

    def test_required_full_jobs_missing_or_skipped_rejected(self):
        api = IntegrationAPI()
        k = "/actions/runs/701/jobs?per_page=100"
        api.values[k]["jobs"][2]["conclusion"] = "skipped"
        with self.assertRaisesRegex(rf.Blocked, "RF_REQUIRED_JOB_NOT_SUCCESS"):
            ri.premerge(parse(packet()), api, BASE)
        api = IntegrationAPI()
        api.values["/pulls/272/files?per_page=100"] = [
            {"filename": "AGENTS.md"}]
        self.assertEqual(ri.premerge(parse(packet()), api, BASE)["state"],
                         "PROTECTED_SQUASH_READY")

    def test_main_check_not_invented_by_successful_merge(self):
        api = IntegrationAPI()
        key = "/actions/runs?head_sha=" + MERGE + "&event=push&per_page=100"
        api.values[key] = {"total_count": 0, "workflow_runs": []}
        value = ri.integrate(parse(packet()), api, BASE, TEST_SHA)
        self.assertEqual(value["stage"], "MERGED_WAITING_MAIN_CI")
        self.assertNotIn("mainCiRunId", value)
        self.assertEqual(value["ghcrWrites"], 0)

    def test_in_progress_main_is_pending_not_verified_or_failed(self):
        api = IntegrationAPI()
        key = "/actions/runs?head_sha=" + MERGE + "&event=push&per_page=100"
        api.values[key]["workflow_runs"][0].update(
            status="in_progress", conclusion=None)
        value = ri.integrate(parse(packet()), api, BASE, TEST_SHA)
        self.assertEqual(value["stage"], "MERGED_WAITING_MAIN_CI")
        self.assertNotIn("mainCiRunId", value)
        self.assertEqual(value["releaseAuthorization"], "NOT_VERIFIED")
        self.assertEqual(len(api.merge_calls), 1)

    def test_failed_main_never_becomes_verified(self):
        api = IntegrationAPI()
        key = "/actions/runs?head_sha=" + MERGE + "&event=push&per_page=100"
        api.values[key]["workflow_runs"][0]["conclusion"] = "failure"
        with self.assertRaisesRegex(rf.Blocked, "RF_LATEST_CI_NOT_SUCCESS"):
            ri.integrate(parse(packet()), api, BASE, TEST_SHA)
        self.assertEqual(len(api.merge_calls), 1)  # never retry an uncertain write

    def test_github_token_merge_dispatches_exact_sha_and_hash_once(self):
        api = IntegrationAPI()
        key = "/actions/runs?head_sha=" + MERGE + "&event=push&per_page=100"
        api.values[key] = {"total_count": 0, "workflow_runs": []}
        result = ri.integrate(parse(packet()), api, BASE, TEST_SHA)
        self.assertEqual(result["stage"], "MERGED_WAITING_MAIN_CI")
        self.assertEqual(result["mainDispatch"], "REQUESTED")
        self.assertEqual(api.dispatch_calls, [(MERGE, TEST_SHA)])
        self.assertEqual(result["ghcrWrites"], 0)
        self.assertEqual(result["issueWrites"], 0)

    def test_exact_dispatch_run_success_is_real_main_evidence(self):
        api = IntegrationAPI()
        push = "/actions/runs?head_sha=" + MERGE + "&event=push&per_page=100"
        disp = "/actions/runs?head_sha=" + MERGE + "&event=workflow_dispatch&per_page=100"
        api.values[push] = {"total_count": 0, "workflow_runs": []}
        result = ri.integrate(parse(packet()), api, BASE, TEST_SHA)
        self.assertNotIn("mainCiRunId", result)
        main = {"id": 51, "run_number": 42, "run_attempt": 1,
                "head_sha": MERGE, "head_branch": "main",
                "repository": {"id": rf.REPO_ID}, "event": "workflow_dispatch",
                "path": rf.MAIN_WORKFLOW,
                "display_title": "MAIN CI | RF02 | " + MERGE + " | " + TEST_SHA,
                "status": "in_progress", "conclusion": None}
        api.values[disp] = {"total_count": 1, "workflow_runs": [main]}
        waiting = ri.readback(parse(packet()), api, packet_sha=TEST_SHA)
        self.assertEqual(waiting["stage"], "MERGED_WAITING_MAIN_CI")
        self.assertEqual(waiting["mainCiPendingRunId"], 51)
        main.update(status="completed", conclusion="success")
        api.values["/actions/runs/51/jobs?per_page=100"] = {
            "total_count": 1,
            "jobs": [job("Verify read-only GHCR release HOLD", 51)]}
        verified = ri.readback(parse(packet()), api, packet_sha=TEST_SHA)
        self.assertEqual(verified["stage"], "MAIN_VERIFIED")
        self.assertEqual(verified["mainCiEvent"], "workflow_dispatch")
        self.assertEqual(verified["mainCiRunId"], 51)
        self.assertEqual(api.dispatch_calls, [(MERGE, TEST_SHA)])

    def test_dispatch_run_wrong_packet_retry_or_failure_never_passes(self):
        api = IntegrationAPI()
        push = "/actions/runs?head_sha=" + MERGE + "&event=push&per_page=100"
        disp = "/actions/runs?head_sha=" + MERGE + "&event=workflow_dispatch&per_page=100"
        api.values[push] = {"total_count": 0, "workflow_runs": []}
        ri.integrate(parse(packet()), api, BASE, TEST_SHA)
        run = {"id": 51, "run_number": 42, "run_attempt": 1,
               "head_sha": MERGE, "head_branch": "main",
               "repository": {"id": rf.REPO_ID}, "event": "workflow_dispatch",
               "path": rf.MAIN_WORKFLOW,
               "display_title": "MAIN CI | RF02 | " + MERGE + " | " + TEST_SHA,
               "status": "completed", "conclusion": "success"}
        api.values[disp] = {"total_count": 1, "workflow_runs": [run]}
        api.values["/actions/runs/51/jobs?per_page=100"] = {
            "total_count": 1,
            "jobs": [job("Verify read-only GHCR release HOLD", 51)]}
        for label, patch in (
            ("wrong-packet", {"display_title": "MAIN CI | RF02 | " + MERGE + " | " + "f"*64}),
            ("wrong-commit", {"head_sha": "f"*40}),
            ("wrong-owner-repo", {"repository": {"id": 10}}),
        ):
            with self.subTest(label=label):
                original = copy.deepcopy(run)
                run.update(patch)
                self.assertEqual(ri.readback(parse(packet()), api, packet_sha=TEST_SHA)["stage"],
                                 "MERGED_WAITING_MAIN_CI")
                run.clear(); run.update(original)
        for label, patch, expected in (
            ("retry", {"run_attempt": 2}, "RF02_MAIN_REATTEMPT_BLOCKED"),
            ("failure", {"conclusion": "failure"}, "RF02_MAIN_DISPATCH_NOT_SUCCESS"),
            ("cancelled", {"conclusion": "cancelled"}, "RF02_MAIN_DISPATCH_NOT_SUCCESS"),
        ):
            with self.subTest(label=label):
                original = copy.deepcopy(run)
                run.update(patch)
                with self.assertRaisesRegex(rf.Blocked, expected):
                    ri.readback(parse(packet()), api, packet_sha=TEST_SHA)
                run.clear(); run.update(original)
        api.values["/actions/runs/51/jobs?per_page=100"]["jobs"][0]["conclusion"] = "skipped"
        with self.assertRaisesRegex(rf.Blocked, "RF_REQUIRED_JOB_NOT_SUCCESS"):
            ri.readback(parse(packet()), api, packet_sha=TEST_SHA)

    def test_unknown_dispatch_after_merge_never_autoretries(self):
        class UnknownDispatchAPI(IntegrationAPI):
            def dispatch_main(self, sha, packet_sha):
                self.dispatch_calls.append((sha, packet_sha))
                raise rf.Blocked("RF02_MAIN_DISPATCH_UNKNOWN_NO_RETRY")
        api = UnknownDispatchAPI()
        key = "/actions/runs?head_sha=" + MERGE + "&event=push&per_page=100"
        api.values[key] = {"total_count": 0, "workflow_runs": []}
        with self.assertRaisesRegex(rf.Blocked, "RF02_MAIN_DISPATCH_UNKNOWN_NO_RETRY"):
            ri.integrate(parse(packet()), api, BASE, TEST_SHA)
        self.assertEqual(len(api.merge_calls), 1)
        self.assertEqual(api.dispatch_calls, [(MERGE, TEST_SHA)])

    def test_workflow_merge_authority_and_explicit_dispatch_configuration(self):
        root = Path(__file__).resolve().parents[3]
        integration = (root / ".github/workflows/release-finalizer-integrate.yml").read_text()
        main = (root / ".github/workflows/main-hold.yml").read_text()
        self.assertIn("      contents: write\n      pull-requests: write", integration)
        self.assertIn("      actions: write", integration)
        self.assertIn("      contents: read\n      pull-requests: read", integration)
        self.assertIn("rf02_merge_sha:", main)
        self.assertIn("rf02_packet_sha256:", main)
        self.assertIn("LP_RF02_DISPATCH_PACKET_OR_SHA_INVALID", main)

    def test_owner_dispatch_context_enforced(self):
        env = {
            "GITHUB_REPOSITORY": rf.REPO,
            "GITHUB_REPOSITORY_ID": str(rf.REPO_ID),
            "GITHUB_REPOSITORY_OWNER_ID": str(rf.OWNER_ID),
            "GITHUB_ACTOR_ID": str(rf.OWNER_ID),
            "RF_SENDER_ID": str(rf.OWNER_ID),
            "GITHUB_EVENT_NAME": "workflow_dispatch",
            "GITHUB_RUN_ATTEMPT": "1",
            "GITHUB_REF": "refs/heads/main",
            "GITHUB_SHA": BASE,
        }
        ri.check_context(env, "integrate")
        for key, bad in (
            ("GITHUB_ACTOR_ID", "1"),
            ("RF_SENDER_ID", "1"),
            ("GITHUB_RUN_ATTEMPT", "2"),
            ("GITHUB_SHA", "not-a-sha"),
            ("GITHUB_REPOSITORY", "other/repo"),
        ):
            with self.subTest(key=key), self.assertRaises(rf.Blocked):
                ri.check_context({**env, key: bad}, "integrate")


if __name__ == "__main__":
    unittest.main()
