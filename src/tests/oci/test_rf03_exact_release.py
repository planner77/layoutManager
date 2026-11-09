#!/usr/bin/env python3
"""RF-03 read-only exact-version release candidate planning safety contract."""
import copy
from pathlib import Path
import unittest

import release_finalizer as rf
import rf03_exact_release as rf03
from test_release_finalizer import API, BASE, HEAD, TREE, MERGE, VERSION, packet, parse


def prepared():
    p = parse(packet())
    api = API(merged=True)
    api.values["/git/ref/heads/main"] = {
        "ref": "refs/heads/main", "object": {"type": "commit", "sha": MERGE}
    }
    proof = rf.plan(p, api)
    return p, proof, api.values["/git/ref/heads/main"]


class RF03SafetyTest(unittest.TestCase):
    def test_exact_three_role_ref_mapping_and_plan_cannot_publish(self):
        p, proof, head = prepared()
        value = rf03.evaluate(p, proof, head)
        self.assertEqual(value["state"], "BLOCKED_PROTECTED_MAIN_AND_OWNER_RELEASE_APPROVAL_REQUIRED")
        self.assertEqual(value["sourceCommit"], MERGE)
        self.assertEqual(value["sourceTree"], TREE)
        self.assertEqual(value["releaseVersion"], VERSION)
        self.assertEqual(value["releaseIntent"], rf.PACKAGE + ":v" + VERSION)
        self.assertFalse(value["releaseIntentIsPublishedTag"])
        self.assertEqual(value["expectedFinalRefs"], {
            "app": rf.PACKAGE + ":" + VERSION,
            "migrator": rf.PACKAGE + ":" + VERSION + "-migrate",
            "cpu-worker": rf.PACKAGE + ":" + VERSION + "-cpu-worker",
        })
        self.assertEqual(value["externalWrites"], 0)
        self.assertEqual(value["ownerAuthority"], "NOT_VERIFIED")
        self.assertEqual(value["candidateSignedArtifact"], "NOT_VERIFIED")
        self.assertEqual(value["registryReadback"], "NOT_VERIFIED")
        self.assertEqual(value["issueAcceptance"], "NOT_VERIFIED")

    def test_versions_are_generic_but_legacy_immutable(self):
        self.assertEqual(rf03.version_parts("2.1.0"), (2, 1, 0))
        for version in ("0.61.1", "0.61.9", "0.62.0", "1.0.0"):
            with self.subTest(version=version):
                self.assertEqual(rf03.exact_tags(version)["app"],
                                 rf.PACKAGE + ":" + version)
        for version in ("0.60.0", "0.61.0"):
            with self.subTest(legacy=version), self.assertRaisesRegex(
                    rf.Blocked, "RF03_LEGACY_IMMUTABLE"):
                rf03.exact_tags(version)
        for version in ("v0.61.1", "0.61.1-rc1", "0.61.01",
                        "99999999999999999999.0.0", None, True):
            with self.subTest(invalid=version), self.assertRaisesRegex(
                    rf.Blocked, "RF03_VERSION_INVALID"):
                rf03.exact_tags(version)

    def test_wrong_source_ci_issue_or_version_never_reuses_evidence(self):
        for label, change in (
            ("source", {"sourceSha": "f"*40}),
            ("tree", {"sourceTree": "f"*40}),
            ("issue", {"issueNumber": 999}),
            ("version", {"version": "0.61.2"}),
            ("prci", {"prCiAttempt": 2}),
            ("mainci", {"mainCiAttempt": 2}),
            ("mainCIUnknown", {"mainCiRunId": None}),
            ("releaseApproved", {"releaseAuthorization": "APPROVED"}),
            ("closeApproved", {"issueAcceptance": "APPROVED"}),
            ("externalWrite", {"externalWrites": 1}),
            ("wrongState", {"state": "WAITING_EXACT_MAIN_CI"}),
        ):
            with self.subTest(label=label):
                p, proof, head = prepared()
                proof.update(change)
                with self.assertRaises(rf.Blocked):
                    rf03.evaluate(p, proof, head)

    def test_main_head_drift_or_wrong_type_never_authorizes_release(self):
        for patch in (
            {"ref": "refs/heads/feat/foo"},
            {"object": {"type": "commit", "sha": "f"*40}},
            {"object": {"type": "tag", "sha": MERGE}},
        ):
            p, proof, head = prepared()
            head.update(patch)
            with self.assertRaisesRegex(rf.Blocked, "RF03_MAIN_HEAD_DRIFT"):
                rf03.evaluate(p, proof, head)

    def test_request_changes_never_expand_approval_scope(self):
        for changes in (
            {"roles": ["app", "migrator"]},
            {"releaseRequired": False},
            {"stopPolicy": "ALLOW"},
            {"releaseTarget": rf.PACKAGE + ":" + VERSION},
            {"ownerId": 7},
            {"repositoryId": 1},
        ):
            p, proof, head = prepared()
            p.update(changes)
            with self.assertRaisesRegex(rf.Blocked, "RF03_REQUEST_SCOPE_INVALID"):
                rf03.evaluate(p, proof, head)

    def test_legacy_candidate_promotion_implementation_is_unchanged(self):
        # Historic writers remain intentionally pinned until a separately
        # reviewed version-aware, real-approval and signed-proof RF-03 change.
        import candidate_policy as ca
        import registry_promotion as registry
        import promotion_policy as promo
        self.assertEqual(registry.VERSION, "0.61.0")
        self.assertEqual(ca.ROLES, rf03.TARGET_ROLES)
        self.assertEqual(promo.template()["version"], "0.61.0")

    def test_read_only_manual_dispatch_has_no_writers(self):
        workflow = (Path(__file__).resolve().parents[3] /
                    ".github/workflows/release-finalizer-rf03-plan.yml").read_text()
        self.assertIn("permissions: {}", workflow)
        self.assertIn("contents: read", workflow)
        self.assertIn("actions: read", workflow)
        self.assertNotIn("packages: write", workflow)
        self.assertNotIn("pull-requests: write", workflow)
        self.assertNotIn("issues: write", workflow)
        self.assertNotIn("id-token: write", workflow)


if __name__ == "__main__":
    unittest.main()
