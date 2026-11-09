#!/usr/bin/env python3
"""RF-03 version-generic protected writer contracts; synthetic, no network."""
from __future__ import annotations

import copy
from pathlib import Path
import unittest
from unittest.mock import patch

import candidate_policy as legacy_candidate
import registry_promotion as legacy_promote
import rf03_candidate_policy as candidate
import rf03_candidate_publish as publisher
import rf03_promotion_policy as promotion
import rf03_registry_promotion as registry
import rf03_release_promote as promoted
import rf03_exact_release as exact
from test_candidate_publish import packet as old_packet, context as old_context
from test_candidate_publish import fake_git

ROOT = Path(__file__).resolve().parents[3]
ROLES = ("app", "migrator", "cpu-worker")
HEX = "0123456789abcdef"


def candidate_packet():
    p = old_packet()
    p["kind"] = "RF03_CANDIDATE_PREFIX_AUTHORIZATION_V1"
    p["workflowPath"] = candidate.WORKFLOW
    p["version"] = candidate.VERSION
    return p


def promotion_packet():
    p = promotion.template()
    source, tree, code, code_tree = "a"*40, "b"*40, "c"*40, "d"*40
    cand_id = "81001"
    p.update({
        "nonce": "e"*16,
        "promotion": {
            "sourceCommit": code, "sourceTree": code_tree, "workflowCommit": code,
            "requiredCi": {
                "runId": 500, "workflowId": 22, "runAttempt": 1,
                "headSha": "f"*40, "archiveSha": "f"*40,
                "treeSha": code_tree,
            },
        },
        "candidate": {
            "sourceCommit": source, "sourceTree": tree,
            "workflowCommit": source, "runId": cand_id, "runAttempt": "1",
            "packetSha256": "2"*64,
            "artifact": {
                "id": 22001, "name": "issue225-candidate-proof-"+cand_id+"-1",
                "digest": "sha256:"+"3"*64, "size": 4200,
                "files": {name: "4"*64 for name in promotion.FILES},
            },
        },
        "environmentId": 71,
        "environmentConfigSha256": "5"*64,
        "environmentUiObservationSha256": None,
        "controls": {
            "policyReceiptSha256": "6"*64, "writerInventorySha256": "7"*64,
            "legacyControlReceiptSha256": "8"*64,
            "rollbackPacketSha256": "9"*64,
            "actionsGrants": "INCLUDED_IN_OWNER_REVIEWED_WRITER_INVENTORY",
        },
        "rollbackBaseline": {
            "receiptSha256": "a"*64, "sourceCommit": "e"*40,
            "appDigest": "sha256:"+"b"*64,
            "migratorDigest": "sha256:"+"c"*64,
            "cpuWorkerDigest": "sha256:"+"d"*64,
            "latestDigest": "sha256:"+"e"*64,
            "automaticRollback": False,
        },
        "roles": {},
    })
    for index, role in enumerate(ROLES):
        letter = HEX[index+1]
        p["roles"][role] = {
            "digest": "sha256:"+letter*64,
            "mediaType": registry.OCI_MANIFEST,
            "size": 1400,
            "configDigest": "sha256:"+HEX[index+5]*64,
            "platformManifestDigest": "sha256:"+HEX[index+8]*64,
        }
    return p


class RF03ProtectedTests(unittest.TestCase):
    def test_candidate_contract_current_version_and_no_legacy_relabel(self):
        p = candidate_packet()
        raw = candidate.canonical(p)
        self.assertEqual(candidate.packet(raw, candidate.sha(raw)), p)
        self.assertNotEqual(candidate.VERSION, "0.61.0")
        self.assertEqual(candidate.VERSION, registry.VERSION)
        self.assertEqual(set(exact.exact_tags(candidate.VERSION)), set(ROLES))
        self.assertEqual(legacy_candidate.WORKFLOW,
                         ".github/workflows/release-candidate.yml")
        self.assertEqual(legacy_promote.VERSION, "0.61.0")
        self.assertEqual(p["workflowPath"],
                         ".github/workflows/release-finalizer-rf03-candidate.yml")
        for field, value in (
            ("kind", "CANDIDATE_PREFIX_AUTHORIZATION_V1"),
            ("workflowPath", legacy_candidate.WORKFLOW),
            ("version", "0.61.0"),
            ("version", "0.60.0"),
            ("sourceCommit", "0"*40),
            ("roles", ["app", "migrator"]),
        ):
            with self.subTest(field=field, value=value):
                bad = copy.deepcopy(p); bad[field] = value
                raw = candidate.canonical(bad)
                with self.assertRaises(candidate.Pending):
                    candidate.packet(raw, candidate.sha(raw))

    def test_candidate_owner_exact_workflow_context_and_input_version(self):
        p = candidate_packet(); raw = candidate.canonical(p)
        digest = candidate.sha(raw)
        env = old_context(p)
        env.update({
            "GITHUB_WORKFLOW_REF": candidate.REPO + "/" + candidate.WORKFLOW +
                                   "@refs/heads/main",
            "CA_PACKET_SHA256": digest, "CA_VERSION": candidate.VERSION,
        })
        self.assertEqual(candidate.guard(p, digest, env, fake_git)["packetSha256"],
                         digest)
        for key, value in (
            ("GITHUB_RUN_ATTEMPT", "2"),
            ("GITHUB_WORKFLOW_REF", legacy_candidate.SIGNER + "@refs/heads/main"),
            ("GITHUB_SHA", "9"*40),
        ):
            with self.subTest(key=key):
                changed = dict(env); changed[key] = value
                with self.assertRaises(candidate.Pending):
                    candidate.guard(p, digest, changed, fake_git)
        event = {"sender": {"id": candidate.OWNER_ID},
                 "inputs": {"mode": "publish", "packet_json": raw.decode(),
                            "packet_sha256": digest, "environment_ui_json": ""}}
        with patch.object(publisher, "read", return_value=event), \
             patch.object(publisher, "git", side_effect=fake_git):
            self.assertEqual(publisher.binding(p, digest, env)["runId"], "123")
            with self.assertRaisesRegex(candidate.Pending,
                                        "RF03_VERSION_INPUT_MISMATCH"):
                publisher.binding(p, digest, {**env, "CA_VERSION": "0.61.0"})

    def test_promotion_exact_version_role_and_old_baseline_policy(self):
        p = promotion_packet(); raw = candidate.canonical(p)
        self.assertEqual(promotion.packet(raw, candidate.sha(raw)), p)
        self.assertEqual(registry.validate_packet(promotion.rt_packet(p)),
                         registry.validate_packet(promotion.rt_packet(p)))
        self.assertEqual(promotion.rt_packet(p)["version"], candidate.VERSION)
        self.assertEqual(set(registry.FINALS), set(ROLES))
        self.assertEqual(registry.FINALS["app"], candidate.VERSION)
        for key, new in (
            ("version", "0.61.0"),
            ("workflowPath", ".github/workflows/release-promote.yml"),
            ("kind", "EXACT_DIGEST_RELEASE_PACKET_V1"),
        ):
            bad = copy.deepcopy(p); bad[key] = new
            with self.subTest(key=key), self.assertRaises(
                    (candidate.Pending, registry.Rejected)):
                raw = candidate.canonical(bad)
                promotion.packet(raw, candidate.sha(raw))
        for field, value in (
            ("cpuWorkerDigest", "sha256:"+"f"*63),
            ("latestDigest", "not-a-digest"),
            ("automaticRollback", True),
        ):
            bad = copy.deepcopy(p); bad["rollbackBaseline"][field] = value
            with self.subTest(field=field), self.assertRaises(candidate.Pending):
                raw = candidate.canonical(bad)
                promotion.packet(raw, candidate.sha(raw))
        p["rollbackBaseline"]["latestDigest"] = None
        raw = candidate.canonical(p)
        self.assertEqual(promotion.packet(raw, candidate.sha(raw)), p)

    def test_baseline_three_roles_and_latest_never_mutated(self):
        p = promotion_packet()
        known = {
            "0.61.0": p["rollbackBaseline"]["appDigest"],
            "0.61.0-migrate": p["rollbackBaseline"]["migratorDigest"],
            "0.61.0-cpu-worker": p["rollbackBaseline"]["cpuWorkerDigest"],
            "latest": p["rollbackBaseline"]["latestDigest"],
        }
        class Reader:
            def __init__(self, values): self.values, self.calls = dict(values), []
            def manifest(self, ref):
                self.calls.append(ref)
                return ({"digest": self.values[ref]} if self.values.get(ref)
                        else None)
        r = Reader(known)
        obs = promoted.protected_baseline_readback(r, p)
        self.assertEqual(obs["roles"]["cpu-worker"],
                         p["rollbackBaseline"]["cpuWorkerDigest"])
        self.assertEqual(r.calls,
                         ["0.61.0", "0.61.0-migrate", "0.61.0-cpu-worker", "latest"])
        for tag in known:
            for value in (None, "sha256:"+"0"*64):
                bad = dict(known); bad[tag] = value
                with self.subTest(tag=tag, value=value), self.assertRaises(
                        candidate.Pending):
                    promoted.protected_baseline_readback(Reader(bad), p)

    def test_protected_workflows_fail_closed_and_preserve_existing_writer(self):
        c = (ROOT / ".github/workflows/release-finalizer-rf03-candidate.yml").read_text()
        p = (ROOT / ".github/workflows/release-finalizer-rf03-promote.yml").read_text()
        for s in (c, p):
            self.assertIn("permissions: {}", s)
            self.assertIn("environment: issue225-candidate-publish", s)
            self.assertIn("github.run_attempt == 1", s)
            self.assertIn("github.actor_id == '45478892'", s)
            self.assertIn("concurrency:", s)
            self.assertIn("group: issue225-candidate-publish", s)
            self.assertIn("cancel-in-progress: false", s)
            self.assertIn("default: plan", s)
            self.assertNotIn("latest:", s)
        self.assertIn("version="+chr(36)+"{{ inputs.version }}", c)
        self.assertIn("rf03_candidate_publish.py", c)
        self.assertIn("rf03_release_promote.py", p)
        self.assertNotIn("rf03_candidate_publish.py",
                         (ROOT / ".github/workflows/release-candidate.yml").read_text())
        self.assertNotIn("rf03_release_promote.py",
                         (ROOT / ".github/workflows/release-promote.yml").read_text())


if __name__ == "__main__":
    unittest.main()
