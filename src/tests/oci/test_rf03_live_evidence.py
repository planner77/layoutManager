#!/usr/bin/env python3
"""RF-03 live GitHub readback regression: synthetic API != actual Owner approval."""
from __future__ import annotations

import base64
import copy
import json
import unittest

import release_finalizer as rf
import rf03_live_evidence as live
import rf03_release_handoff as handoff
from test_rf03_release_handoff import receipt


class FakeAPI:
    def __init__(self):
        self.packet, self.plan = receipt()
        self.values = {}
        self.calls = []
        p = self.packet
        self.values["/git/ref/heads/main"] = {
            "ref": "refs/heads/main",
            "object": {"type": "commit", "sha": p["promotionSourceCommit"]}}
        for name, source, tree in (
            ("candidate", p["sourceCommit"], p["sourceTree"]),
            ("promotion", p["promotionSourceCommit"], p["promotionSourceTree"]),
        ):
            self.values["/git/commits/" + source] = {
                "sha": source, "tree": {"sha": tree}}
            self.values["/contents/src/package.json?ref=" + source] = {
                "type": "file", "encoding": "base64",
                "content": base64.b64encode(
                    json.dumps({"version": p["version"]}).encode()).decode()}
        for stage in ("candidate", "promotion"):
            info = p[stage]
            rid = info["runId"]
            workflow, job_prefix, title_prefix = live.STAGES[stage]
            info["approvalEvidenceSha256"] = live.evidence_sha(
                live.approval_receipt(stage, info))
            self.values["/actions/runs/" + str(rid) + "/attempts/1"] = {
                "id": rid, "run_attempt": 1,
                "repository": {"id": rf.REPO_ID},
                "head_sha": info["sourceCommit"],
                "head_branch": "main", "path": workflow,
                "event": "workflow_dispatch",
                "status": "completed", "conclusion": "success",
                "display_title": title_prefix + info["packetSha256"],
                "actor": {"id": rf.OWNER_ID},
                "triggering_actor": {"id": rf.OWNER_ID}}
            self.values["/actions/runs/" + str(rid) +
                        "/attempts/1/jobs?per_page=100"] = {
                "total_count": 2,
                "jobs": [
                    {"id": info["approvalJobId"], "run_id": rid,
                     "head_sha": info["sourceCommit"],
                     "name": job_prefix + info["packetSha256"],
                     "status": "completed", "conclusion": "success"},
                    {"id": 333 + rid, "run_id": rid, "head_sha": info["sourceCommit"],
                     "name": "Environment prerequisites",
                     "status": "completed", "conclusion": "success"}
                ]}
            self.values["/actions/runs/" + str(rid) + "/approvals"] = [
                {"state": "approved", "user": {"id": rf.OWNER_ID},
                 "environments": [{"id": info["environmentId"],
                                   "name": live.ENVIRONMENT}]}]
        self.values["/environments/" + live.ENVIRONMENT] = {
            "id": p["candidate"]["environmentId"],
            "name": live.ENVIRONMENT,
            "deployment_branch_policy": {
                "protected_branches": False,
                "custom_branch_policies": True},
            "can_admins_bypass": False,
            "protection_rules": [
                {"type": "required_reviewers", "prevent_self_review": False,
                 "reviewers": [{
                     "type": "User", "reviewer": {"id": rf.OWNER_ID}}]}
            ],
        }
        a = p["artifact"]
        c = p["candidate"]
        obj = {"id": a["id"], "name": "issue225-candidate-proof-" +
               str(c["runId"]) + "-1",
               "size_in_bytes": a["size"], "digest": a["digest"],
               "expired": False,
               "workflow_run": {
                   "id": c["runId"], "repository_id": rf.REPO_ID,
                   "head_sha": p["sourceCommit"]}}
        self.values["/actions/artifacts/" + str(a["id"])] = obj
        self.values["/actions/runs/" + str(c["runId"]) +
                    "/artifacts?per_page=100"] = {
            "total_count": 1, "artifacts": [copy.deepcopy(obj)]}

    def get(self, path):
        self.calls.append(path)
        return copy.deepcopy(self.values[path])


class LiveReadbackTests(unittest.TestCase):
    def test_real_metadata_separate_reviews_still_block_cryptography(self):
        api = FakeAPI()
        output = live.audit(api.packet, api.plan, api)
        self.assertEqual(output["state"],
                         "BLOCKED_CRYPTOGRAPHIC_OCI_AND_REGISTRY_PROOF_REQUIRED")
        self.assertEqual(output["githubEvidence"], "MATCHED_READ_ONLY")
        self.assertEqual(output["ownerReviewHistory"],
                         "OBSERVED_NOT_RELEASE_AUTHORITY")
        self.assertEqual(output["environmentPolicy"],
                         "OBSERVED_NO_ADMIN_BYPASS")
        self.assertEqual(output["ownerAuthority"], "NOT_VERIFIED")
        self.assertEqual(output["signatureVerification"], "NOT_VERIFIED")
        self.assertEqual(output["registryPublication"], "NOT_RUN")
        self.assertEqual(output["externalWrites"], 0)
        self.assertEqual(len(set(api.calls)), len(api.calls))
        self.assertTrue(all(p.startswith("/") and ".." not in p for p in api.calls))
        self.assertEqual(output["candidateArtifactId"], api.packet["artifact"]["id"])

    def test_api_client_is_get_only_allowlisted_and_blocks_foreign_paths(self):
        import rf03_readback as audit_cli
        client = audit_cli.SafeReadOnlyGitHub("synthetic-token")
        for allowed in (
            "/git/ref/heads/main",
            "/git/commits/" + "a"*40,
            "/contents/src/package.json?ref=" + "a"*40,
            "/actions/runs/81/attempts/1",
            "/actions/runs/81/attempts/1/jobs?per_page=100",
            "/actions/runs/81/approvals",
            "/actions/runs/81/artifacts?per_page=100",
            "/actions/artifacts/91",
            "/environments/issue225-candidate-publish",
        ):
            with self.subTest(allowed=allowed):
                self.assertTrue(any(rule.fullmatch(allowed)
                                    for rule in client.ALLOWED))
        for blocked in (
            "/issues/273",
            "/pulls/277/merge",
            "https://attacker.example",
            "/git/refs/heads/main",
            "/actions/runs/81/attempts/2",
            "/actions/artifacts/91/zip",
            "/actions/runs/81/artifacts?per_page=99",
            "/actions/runs/81/approvals/../secrets",
        ):
            with self.subTest(blocked=blocked), self.assertRaisesRegex(
                    rf.Blocked, "RF03_API_PATH_REJECTED"):
                client.get(blocked)

    def test_read_only_workflow_and_owner_context(self):
        import hashlib
        import rf03_readback as audit_cli
        from pathlib import Path
        root = Path(__file__).resolve().parents[3]
        wf = (root / ".github/workflows/release-finalizer-rf03-readback.yml").read_text()
        self.assertIn("permissions: {}", wf)
        self.assertIn("contents: read", wf)
        self.assertIn("actions: read", wf)
        self.assertNotIn("packages: write", wf)
        self.assertNotIn("issues: write", wf)
        self.assertNotIn("pull-requests: write", wf)
        self.assertNotIn("id-token: write", wf)
        env = {
            "GITHUB_REPOSITORY": rf.REPO,
            "GITHUB_REPOSITORY_ID": str(rf.REPO_ID),
            "GITHUB_REPOSITORY_OWNER_ID": str(rf.OWNER_ID),
            "GITHUB_ACTOR_ID": str(rf.OWNER_ID),
            "RF03_SENDER_ID": str(rf.OWNER_ID),
            "GITHUB_EVENT_NAME": "workflow_dispatch",
            "GITHUB_REF": "refs/heads/main",
            "GITHUB_RUN_ATTEMPT": "1",
            "GITHUB_SHA": "e"*40,
            "GITHUB_WORKFLOW_SHA": "e"*40,
        }
        audit_cli.check_context(env)
        api = FakeAPI()
        handoff_raw = json.dumps(api.packet, sort_keys=True).encode()
        plan_raw = json.dumps(api.plan, sort_keys=True).encode()
        env.update({
            "RF03_HANDOFF_JSON": handoff_raw.decode(),
            "RF03_HANDOFF_SHA256": hashlib.sha256(handoff_raw).hexdigest(),
            "RF03_PRIOR_PLAN_JSON": plan_raw.decode(),
            "RF03_PRIOR_PLAN_SHA256": hashlib.sha256(plan_raw).hexdigest(),
        })
        packet, prior = audit_cli.parse_inputs(env)
        self.assertEqual(packet, api.packet)
        self.assertEqual(prior, api.plan)
        for key, value in (
            ("GITHUB_ACTOR_ID", "999"),
            ("GITHUB_WORKFLOW_SHA", "f"*40),
            ("GITHUB_RUN_ATTEMPT", "2"),
            ("RF03_SENDER_ID", "999"),
        ):
            with self.subTest(key=key), self.assertRaisesRegex(
                    rf.Blocked, "RF03_EVIDENCE_CONTEXT_INVALID"):
                audit_cli.check_context({**env, key: value})
        with self.assertRaisesRegex(
                rf.Blocked, "RF03_EVIDENCE_WORKFLOW_SOURCE_DRIFT"):
            audit_cli.parse_inputs({**env, "GITHUB_SHA": "f"*40})
        with self.assertRaisesRegex(
                rf.Blocked, "RF03_HANDOFF_HASH_INVALID"):
            audit_cli.parse_inputs({**env, "RF03_HANDOFF_SHA256": "a"*64})

    def test_promotion_must_be_current_main_not_stale_source(self):
        api = FakeAPI()
        api.values["/git/ref/heads/main"]["object"]["sha"] = "0"*40
        with self.assertRaisesRegex(rf.Blocked, "RF03_PROMOTION_MAIN_DRIFT"):
            live.audit(api.packet, api.plan, api)

    def test_exact_source_or_version_mismatch_refused(self):
        for stage, mutate, code in (
            ("candidate", ("tree", "bad"), "RF03_GIT_SOURCE_TREE_INVALID"),
            ("promotion", ("tree", "bad"), "RF03_GIT_SOURCE_TREE_INVALID"),
            ("candidate", ("package", "0.61.0"), "RF03_SOURCE_PACKAGE_VERSION_MISMATCH"),
            ("promotion", ("package", "0.61.2"), "RF03_SOURCE_PACKAGE_VERSION_MISMATCH"),
        ):
            with self.subTest(stage=stage, mutate=mutate):
                api = FakeAPI()
                c = api.packet[stage]
                src = c["sourceCommit"]
                if mutate[0] == "tree":
                    api.values["/git/commits/" + src]["tree"]["sha"] = mutate[1]
                else:
                    api.values["/contents/src/package.json?ref=" + src]["content"] = (
                        base64.b64encode(json.dumps({"version": mutate[1]}).encode()).decode())
                with self.assertRaisesRegex(rf.Blocked, code):
                    live.audit(api.packet, api.plan, api)

    def test_run_identity_approval_attempt_and_status_fail_closed(self):
        for stage, field, value in (
            ("candidate", "run_attempt", 2),
            ("candidate", "status", "in_progress"),
            ("promotion", "conclusion", "failure"),
            ("promotion", "event", "push"),
            ("candidate", "head_branch", "feat/foreign"),
            ("candidate", "display_title", "PROMOTION PUBLISH | " + "a"*64),
            ("promotion", "path", handoff.CANDIDATE_WORKFLOW),
            ("promotion", "repository", {"id": 777}),
            ("promotion", "actor", {"id": 123}),
            ("candidate", "triggering_actor", {"id": 7}),
        ):
            with self.subTest(stage=stage, field=field):
                api = FakeAPI()
                rid = api.packet[stage]["runId"]
                api.values["/actions/runs/" + str(rid) +
                           "/attempts/1"][field] = value
                with self.assertRaisesRegex(rf.Blocked, "RF03_GITHUB_RUN_NOT_VERIFIED"):
                    live.audit(api.packet, api.plan, api)

    def test_job_and_approval_metadata_must_match_each_execution(self):
        for stage in ("candidate", "promotion"):
            rid = FakeAPI().packet[stage]["runId"]
            path = "/actions/runs/" + str(rid) + "/attempts/1/jobs?per_page=100"
            for label, key, value in (
                ("skipped", "conclusion", "skipped"),
                ("wrong-run", "run_id", 777),
                ("bad-job", "id", 1),
                ("wrong-head", "head_sha", "0"*40),
            ):
                with self.subTest(stage=stage, label=label):
                    api = FakeAPI()
                    api.values[path]["jobs"][0][key] = value
                    with self.assertRaisesRegex(rf.Blocked, "RF03_PUBLISH_JOB_NOT_SUCCESS"):
                        live.audit(api.packet, api.plan, api)
            for label, mutate in (
                ("wrong-reviewer", lambda x: x["user"].update(id=7)),
                ("rejected", lambda x: x.update(state="rejected")),
                ("wrong-env", lambda x: x["environments"][0].update(id=5)),
                ("wrong-name", lambda x: x["environments"][0].update(name="other")),
            ):
                with self.subTest(stage=stage, label=label):
                    api = FakeAPI()
                    a = api.values["/actions/runs/" + str(rid) + "/approvals"][0]
                    mutate(a)
                    with self.assertRaisesRegex(rf.Blocked, "RF03_OWNER_APPROVAL_NOT_OBSERVED"):
                        live.audit(api.packet, api.plan, api)

    def test_review_receipt_not_an_unverified_user_hash(self):
        api = FakeAPI()
        api.packet["candidate"]["approvalEvidenceSha256"] = "f"*64
        with self.assertRaisesRegex(rf.Blocked, "RF03_APPROVAL_RECEIPT_CHANGED"):
            live.audit(api.packet, api.plan, api)

    def test_admin_bypass_unknown_or_enabled_and_env_changes_block(self):
        for label, key, value, code in (
            ("unknown-bypass", "can_admins_bypass", None,
             "RF03_ENV_ADMIN_BYPASS_UNKNOWN"),
            ("enabled-bypass", "can_admins_bypass", True,
             "RF03_ENV_ADMIN_BYPASS_UNKNOWN"),
            ("wrong-env", "id", 1234, "RF03_ENVIRONMENT_NOT_VERIFIED"),
            ("wrong-branch-policy", "deployment_branch_policy", {},
             "RF03_ENVIRONMENT_NOT_VERIFIED"),
            ("missing-reviewers", "protection_rules", [],
             "RF03_ENV_REVIEW_POLICY_UNVERIFIED"),
        ):
            with self.subTest(label=label):
                api = FakeAPI()
                api.values["/environments/" + live.ENVIRONMENT][key] = value
                with self.assertRaisesRegex(rf.Blocked, code):
                    live.audit(api.packet, api.plan, api)

    def test_artifact_inventory_exact_digest_source_and_expiry(self):
        def source_mismatch(a): a["workflow_run"]["head_sha"] = "f"*40
        for label, transform in (
            ("expired", lambda x: x.update(expired=True)),
            ("digest", lambda x: x.update(digest="sha256:"+"0"*64)),
            ("source", source_mismatch),
            ("name", lambda x: x.update(name="unrelated")),
            ("size", lambda x: x.update(size_in_bytes=0)),
        ):
            with self.subTest(label=label):
                api = FakeAPI()
                aid = api.packet["artifact"]["id"]
                transform(api.values["/actions/artifacts/" + str(aid)])
                with self.assertRaisesRegex(rf.Blocked, "RF03_ARTIFACT_METADATA_UNVERIFIED"):
                    live.audit(api.packet, api.plan, api)
        api = FakeAPI()
        rid = api.packet["candidate"]["runId"]
        api.values["/actions/runs/" + str(rid) +
                   "/artifacts?per_page=100"]["total_count"] = 2
        with self.assertRaisesRegex(rf.Blocked, "RF03_ARTIFACT_INVENTORY_UNVERIFIED"):
            live.audit(api.packet, api.plan, api)


if __name__ == "__main__":
    unittest.main()
