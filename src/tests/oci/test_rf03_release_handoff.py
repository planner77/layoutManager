#!/usr/bin/env python3
"""RF-03 generic handoff: structural proof is never Owner or GHCR authority."""
from __future__ import annotations

import copy
import hashlib
import json
import unittest

import release_finalizer as rf
import rf03_exact_release as rf03
import rf03_release_handoff as handoff
from test_rf03_exact_release import prepared

HEX = "0123456789abcdef"


def receipt():
    source, prior, main = prepared()
    plan = rf03.evaluate(source, prior, main)
    merge = plan["sourceCommit"]
    tree = plan["sourceTree"]
    candidate_id, promote_id = 81001, 81002
    receipt_sha = "d" * 64
    roles = {}
    for i, role in enumerate(handoff.ROLES):
        letter = HEX[i+1]
        roles[role] = {
            "role": role,
            "candidateRef": (
                rf.PACKAGE + ":candidate-" + merge + "-" +
                str(candidate_id) + "-1-" + role),
            "finalRef": plan["expectedFinalRefs"][role],
            "manifestDigest": "sha256:" + letter * 64,
            "platformManifestDigest": "sha256:" + HEX[i+4] * 64,
            "configDigest": "sha256:" + HEX[i+7] * 64,
            "mediaType": "application/vnd.oci.image.index.v1+json",
            "size": 2048,
            "platform": "linux/amd64",
            "sourceCommit": merge,
            "candidateReceiptSha256": receipt_sha,
        }
    data = {
        "kind": handoff.KIND,
        "repository": rf.REPO,
        "repositoryId": rf.REPO_ID,
        "ownerId": rf.OWNER_ID,
        "package": rf.PACKAGE,
        "packageId": 14938097,
        "version": "0.61.1",
        "sourceCommit": merge,
        "sourceTree": tree,
        "mainCiRunId": plan["mainCiRunId"],
        "mainCiAttempt": 1,
        "prCiRunId": plan["prCiRunId"],
        "prCiAttempt": 1,
        "candidate": {
            "runId": candidate_id,
            "runAttempt": 1,
            "workflowPath": handoff.CANDIDATE_WORKFLOW,
            "sourceCommit": merge,
            "sourceTree": tree,
            "workflowCommit": merge,
            "packetSha256": "a" * 64,
            "environmentId": 930,
            "approvalJobId": 555,
            "approvalReviewerId": rf.OWNER_ID,
            "approvalEvidenceSha256": "a" * 64,
        },
        "promotion": {
            "runId": promote_id,
            "runAttempt": 1,
            "workflowPath": handoff.PROMOTION_WORKFLOW,
            "sourceCommit": "e" * 40,
            "sourceTree": "f" * 40,
            "workflowCommit": "e" * 40,
            "packetSha256": "b" * 64,
            "environmentId": 930,
            "approvalJobId": 556,
            "approvalReviewerId": rf.OWNER_ID,
            "approvalEvidenceSha256": "b" * 64,
        },
        "promotionSourceCommit": "e" * 40,
        "promotionSourceTree": "f" * 40,
        "artifact": {
            "id": 10001,
            "size": 4096,
            "digest": "sha256:" + "c" * 64,
            "candidateReceiptSha256": receipt_sha,
            "signatureBundleSha256": "e" * 64,
            "verificationSha256": "f" * 64,
        },
        "roles": roles,
        "rollbackBaseline": {
            "version": "0.61.0",
            "sourceCommit": "a" * 40,
            "roles": {
                role: "sha256:" + HEX[i+10] * 64
                for i, role in enumerate(handoff.ROLES)
            },
            "automaticRollback": False,
        },
        "nonce": "b" * 32,
        "stopPolicy": rf.STOP,
    }
    return data, plan


class RF03HandoffTest(unittest.TestCase):
    def test_strict_complete_handoff_can_only_return_blocked(self):
        data, plan = receipt()
        value = handoff.check(data, plan)
        self.assertEqual(value["kind"], "RF03_RELEASE_HANDOFF_CHECKED_V1")
        self.assertEqual(value["version"], "0.61.1")
        self.assertEqual(value["candidateRunId"], 81001)
        self.assertEqual(value["promotionRunId"], 81002)
        self.assertEqual(value["state"],
                         "BLOCKED_LIVE_OWNER_CRYPTO_REGISTRY_PROOF_REQUIRED")
        self.assertEqual(value["sourceProof"], "STRUCTURAL_ONLY")
        self.assertEqual(value["ownerAuthority"], "NOT_VERIFIED")
        self.assertEqual(value["signatureVerification"], "NOT_VERIFIED")
        self.assertEqual(value["ociGraphReadback"], "NOT_VERIFIED")
        self.assertEqual(value["registryPublication"], "NOT_RUN")
        self.assertEqual(value["externalWrites"], 0)

    def test_packet_bytes_hash_and_duplicate_key_rejected(self):
        data, _ = receipt()
        raw = json.dumps(data, sort_keys=True).encode()
        value = handoff.parse(raw, hashlib.sha256(raw).hexdigest())
        self.assertEqual(value, data)
        for body, digest in (
            (raw + b" ", hashlib.sha256(raw).hexdigest()),
            (raw, "f" * 64),
        ):
            with self.assertRaisesRegex(rf.Blocked, "RF03_HANDOFF_HASH_INVALID"):
                handoff.parse(body, digest)
        dup = b'{"kind":"A","kind":"B"}'
        with self.assertRaisesRegex(rf.Blocked, "RF03_DUPLICATE_JSON_KEY"):
            handoff.parse(dup, hashlib.sha256(dup).hexdigest())
        for malformed in (b'{"x":NaN}', b'{'):
            with self.assertRaisesRegex(rf.Blocked, "RF03_JSON_INVALID"):
                handoff.parse(malformed, hashlib.sha256(malformed).hexdigest())

    def test_version_legacy_and_wrong_identifiers_fail_closed(self):
        for label, change in (
            ("legacy", {"version": "0.61.0"}),
            ("future-prerelease", {"version": "0.62.0-dev"}),
            ("foreign-repo", {"repositoryId": 2}),
            ("wrong-owner", {"ownerId": 2}),
            ("wrong-package", {"package": "ghcr.io/other/pkg"}),
            ("missing-role", {"roles": {}}),
            ("wrong-ci-attempt", {"mainCiAttempt": 2}),
            ("bool-ci-attempt", {"mainCiAttempt": True}),
            ("drift-source", {"sourceCommit": "0" * 40}),
            ("extra-field", {"publish": True}),
        ):
            with self.subTest(label=label), self.assertRaises(rf.Blocked):
                packet, original = receipt()
                packet.update(change)
                handoff.check(packet, original)

    def test_independent_owner_approval_runs_are_required(self):
        for label, key, value in (
            ("same-run", "runId", 81001),
            ("same-job", "approvalJobId", 555),
            ("same-review-hash", "approvalEvidenceSha256", "a" * 64),
            ("same-packet-hash", "packetSha256", "a" * 64),
            ("wrong-attempt", "runAttempt", 2),
            ("wrong-signer", "approvalReviewerId", 7),
            ("wrong-workflow", "workflowPath", handoff.CANDIDATE_WORKFLOW),
        ):
            with self.subTest(label=label), self.assertRaises(rf.Blocked):
                packet, original = receipt()
                packet["promotion"][key] = value
                handoff.check(packet, original)

    def test_candidate_and_promotion_source_identity_cannot_drift(self):
        for stage, key, value in (
            ("candidate", "sourceCommit", "9" * 40),
            ("candidate", "workflowCommit", "9" * 40),
            ("candidate", "sourceTree", "9" * 40),
            ("promotion", "sourceCommit", "9" * 40),
            ("promotion", "workflowCommit", "9" * 40),
            ("promotion", "sourceTree", "9" * 40),
        ):
            with self.subTest(stage=stage, key=key), self.assertRaises(rf.Blocked):
                packet, original = receipt()
                packet[stage][key] = value
                handoff.check(packet, original)

    def test_exact_oci_ref_roles_platform_and_descriptors(self):
        for label, change in (
            ("wrong-final", {"finalRef": rf.PACKAGE + ":latest"}),
            ("wrong-candidate", {"candidateRef": rf.PACKAGE + ":candidate-fake"}),
            ("bad-platform", {"platform": "linux/arm64"}),
            ("bad-source", {"sourceCommit": "a" * 40}),
            ("bad-candidate-receipt", {"candidateReceiptSha256": "a" * 64}),
            ("wrong-mime", {"mediaType": "application/octet-stream"}),
            ("wrong-size", {"size": 0}),
            ("wrong-digest", {"manifestDigest": "sha256:" + "z" * 64}),
            ("wrong-config", {"configDigest": "sha256:" + "z" * 64}),
            ("extra-descriptor-key", {"untrusted": "true"}),
        ):
            with self.subTest(label=label), self.assertRaises(rf.Blocked):
                packet, original = receipt()
                packet["roles"]["app"].update(change)
                handoff.check(packet, original)
        packet, original = receipt()
        packet["roles"]["migrator"]["manifestDigest"] = (
            packet["roles"]["app"]["manifestDigest"])
        with self.assertRaisesRegex(rf.Blocked, "RF03_ROLE_DIGEST_COLLISION"):
            handoff.check(packet, original)

    def test_immutable_rollback_baseline_and_artifact(self):
        for label, path, value in (
            ("old-source", ("rollbackBaseline", "sourceCommit"), "bad"),
            ("old-version", ("rollbackBaseline", "version"), "0.61.1"),
            ("rollback", ("rollbackBaseline", "automaticRollback"), True),
            ("bad-old-image", ("rollbackBaseline", "roles", "cpu-worker"),
             "sha256:" + "z" * 64),
            ("missing-bundle", ("artifact", "signatureBundleSha256"), ""),
            ("bad-receipt", ("artifact", "candidateReceiptSha256"), ""),
            ("size-exceeds", ("artifact", "size"), 32*1024*1024),
        ):
            with self.subTest(label=label), self.assertRaises(rf.Blocked):
                packet, original = receipt()
                target = packet
                for key in path[:-1]:
                    target = target[key]
                target[path[-1]] = value
                handoff.check(packet, original)

    def test_no_cross_issue_main_ci_or_source_reuse(self):
        for field, value in (
            ("releaseVersion", "0.61.2"),
            ("sourceCommit", "f" * 40),
            ("sourceTree", "f" * 40),
            ("prCiRunId", 9999),
            ("mainCiRunId", 9998),
            ("ownerAuthority", "APPROVED"),
            ("externalWrites", 1),
            ("releaseIntentIsPublishedTag", True),
            ("state", "PUBLISHED"),
        ):
            with self.subTest(field=field), self.assertRaisesRegex(
                    rf.Blocked, "RF03_HANDOFF_SOURCE_PLAN_MISMATCH"):
                packet, original = receipt()
                original[field] = value
                handoff.check(packet, original)

    def test_historical_0610_writer_still_has_fixed_version(self):
        import candidate_policy as legacy
        import registry_promotion as promotion
        self.assertEqual(promotion.VERSION, "0.61.0")
        self.assertEqual(legacy.ROLES, handoff.ROLES)
        self.assertEqual(rf03.exact_tags("0.61.1")["app"],
                         rf.PACKAGE + ":0.61.1")


if __name__ == "__main__":
    unittest.main()
