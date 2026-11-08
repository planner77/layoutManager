#!/usr/bin/env python3
"""RF-03 exact-version OCI read-only regression using synthetic registry."""
from __future__ import annotations
from pathlib import Path
import tempfile
import unittest

import candidate_policy as ca
import candidate_registry as cr
import release_finalizer as rf
import rf03_oci_readback as oci
import rf03_release_handoff as handoff
from test_candidate_publish import Store, desc
from test_rf03_release_handoff import receipt


def fixture(version="0.61.1", wrong_label=None, index=False):
    packet, plan = receipt()
    store = Store()
    for role in handoff.ROLES:
        layer = ("layer-" + role).encode()
        config = ca.canonical({
            "os": "linux", "architecture": "amd64",
            "rootfs": {"type": "layers", "diff_ids": ["sha256:" + "f"*64]},
            "config": {"Labels": {
                "org.opencontainers.image.source":
                    "https://github.com/planner77/layoutManager",
                "org.opencontainers.image.revision": packet["sourceCommit"],
                "org.opencontainers.image.version": (
                    wrong_label if role == "app" and wrong_label else version),
                "com.planner77.g7.image-role": role}}})
        cd = desc(config, "application/vnd.oci.image.config.v1+json")
        ld = desc(layer, "application/vnd.oci.image.layer.v1.tar+gzip")
        store.blobs[cd["digest"]] = config
        store.blobs[ld["digest"]] = layer
        mt = "application/vnd.oci.image.manifest.v1+json"
        raw = ca.canonical({"schemaVersion": 2, "mediaType": mt,
                            "config": cd, "layers": [ld]})
        child = {"raw": raw, **desc(raw, mt)}
        store.manifests[child["digest"]] = child
        top = child
        if index:
            imt = "application/vnd.oci.image.index.v1+json"
            idx = ca.canonical({
                "schemaVersion": 2, "mediaType": imt,
                "manifests": [{**desc(raw, mt),
                               "platform": {"os": "linux", "architecture": "amd64"}}]})
            top = {"raw": idx, **desc(idx, imt)}
            store.manifests[top["digest"]] = top
        tag = packet["roles"][role]["candidateRef"].rsplit(":", 1)[1]
        store.manifests[tag] = top
        claim = packet["roles"][role]
        claim["manifestDigest"] = top["digest"]
        claim["platformManifestDigest"] = child["digest"]
        claim["configDigest"] = cd["digest"]
        claim["mediaType"] = top["mediaType"]
        claim["size"] = top["size"]
    return packet, plan, store


class OCITests(unittest.TestCase):
    def test_direct_and_index_are_read_without_write_and_still_block_release(self):
        for index in (False, True):
            with self.subTest(index=index), tempfile.TemporaryDirectory() as tmp:
                packet, plan, store = fixture(index=index)
                result = oci.check(packet, plan, store, tmp)
                self.assertEqual(set(result["graphs"]), set(handoff.ROLES))
                self.assertEqual(result["ociGraphReadback"], "SYNTHETIC_READER_ONLY")
                self.assertEqual(result["signatureVerification"], "NOT_VERIFIED")
                self.assertEqual(result["ownerAuthority"], "NOT_VERIFIED")
                self.assertEqual(result["registryPublication"], "NOT_RUN")
                self.assertEqual(result["externalWrites"], 0)
                self.assertTrue(store.events and all(e[0] == "GET" for e in store.events))

    def test_historical_default_version_is_0610(self):
        packet, _, store = fixture()
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ca.Pending, "CA_CONFIG_SOURCE_ROLE_INVALID"):
                cr.collect_graph(store, packet["roles"]["app"]["candidateRef"].rsplit(":", 1)[1],
                                 Path(tmp) / "old", "app", packet["sourceCommit"])

    def test_missing_tag_wrong_digest_and_wrong_version_rejected(self):
        for mode, code in (
            ("missing", "RF03_OCI_GRAPH_UNVERIFIED"),
            ("digest", "RF03_OCI_DESCRIPTOR_MISMATCH"),
            ("old-label", "RF03_OCI_GRAPH_UNVERIFIED"),
        ):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as tmp:
                packet, plan, store = fixture(wrong_label=("0.61.0" if mode == "old-label" else None))
                if mode == "missing":
                    store.manifests.pop(packet["roles"]["app"]["candidateRef"].rsplit(":", 1)[1])
                if mode == "digest":
                    packet["roles"]["app"]["configDigest"] = "sha256:" + "a"*64
                with self.assertRaisesRegex(rf.Blocked, code):
                    oci.check(packet, plan, store, tmp)

    def test_final_tag_drift_is_rejected(self):
        packet, plan, store = fixture()
        previous = store.manifest
        tag = packet["roles"]["app"]["candidateRef"].rsplit(":", 1)[1]
        times = {"value": 0}
        def drift(ref):
            if ref == tag:
                times["value"] += 1
                if times["value"] > 1:
                    return None
            return previous(ref)
        store.manifest = drift
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(rf.Blocked, "RF03_OCI_FINAL_RECHECK_CHANGED"):
                oci.check(packet, plan, store, tmp)

    def test_workspace_reuse_wrong_platform_and_legacy_version(self):
        with tempfile.TemporaryDirectory() as tmp:
            packet, plan, store = fixture()
            (Path(tmp) / "rf03-candidate-oci").mkdir()
            with self.assertRaisesRegex(rf.Blocked, "RF03_OCI_WORKSPACE_REUSED"):
                oci.check(packet, plan, store, tmp)
        with tempfile.TemporaryDirectory() as tmp:
            packet, plan, store = fixture()
            packet["roles"]["app"]["platform"] = "linux/arm64"
            with self.assertRaises(rf.Blocked):
                oci.check(packet, plan, store, tmp)
        with tempfile.TemporaryDirectory() as tmp:
            packet, plan, store = fixture()
            packet["version"] = "0.61.0"
            with self.assertRaises(rf.Blocked):
                oci.check(packet, plan, store, tmp)

    def test_read_only_adapter_refuses_remote_mutations(self):
        reader = object.__new__(oci.ReadOnlyGHCR)
        for method in ("POST", "PUT", "PATCH", "DELETE"):
            with self.subTest(method=method), self.assertRaisesRegex(
                    rf.Blocked, "RF03_OCI_WRITE_REFUSED"):
                reader.request(method, cr.PREFIX + "/manifests/latest")

    def test_pull_only_scope_and_writer_default_are_distinct(self):
        import inspect
        self.assertEqual(cr.PULL_SCOPE, "repository:planner77/layoutmanager:pull")
        self.assertEqual(cr.SCOPE, "repository:planner77/layoutmanager:pull,push")
        self.assertFalse(inspect.signature(cr.GHCR.__init__).parameters["pull_only"].default)


if __name__ == "__main__":
    unittest.main()
