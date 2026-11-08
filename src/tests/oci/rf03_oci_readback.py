#!/usr/bin/env python3
"""RF-03 candidate OCI readback only: never publication or release authority.

Reuse #225 authenticated Distribution reads and graph validation. Legacy
publishers remain pinned to 0.61.0, no tags/aliases/Issue/deploy writes.
"""
from __future__ import annotations
from pathlib import Path
import candidate_policy as legacy
import candidate_registry as registry
import release_finalizer as rf
import rf03_release_handoff as handoff


class ReadOnlyGHCR(registry.GHCR):
    """GET/HEAD-only fixed-repository GHCR reader, requesting pull scope."""
    def __init__(self, token, actor, packet, prior_plan, http=None):
        handoff.check(packet, prior_plan)
        expected = {"sourceCommit": packet["sourceCommit"],
                    "runId": str(packet["candidate"]["runId"])}
        super().__init__(token, actor, expected, None, http, pull_only=True)
        rf.need(self.allowed_tags == {
            packet["roles"][role]["candidateRef"].rsplit(":", 1)[1]
            for role in handoff.ROLES}, "RF03_OCI_TAG_SCOPE_INVALID")

    def request(self, method, path, **kwargs):
        rf.need(method in ("GET", "HEAD"), "RF03_OCI_WRITE_REFUSED")
        return super().request(method, path, **kwargs)


def check(packet, prior_plan, reader, workspace):
    """Read and compare all 3 OCI graphs to an exact handoff (no mutations).

    Injected synthetic readers are for regression only; never live proof.
    Authenticated production reader must be the ReadOnlyGHCR adapter.
    """
    handoff.check(packet, prior_plan)
    root = Path(workspace)
    rf.need(root.is_dir() and not root.is_symlink(), "RF03_OCI_WORKSPACE_INVALID")
    target = root / "rf03-candidate-oci"
    rf.need(not target.exists() and not target.is_symlink(),
            "RF03_OCI_WORKSPACE_REUSED")
    rf.need(callable(getattr(reader, "manifest", None)) and
            callable(getattr(reader, "blob", None)), "RF03_OCI_READER_INVALID")
    allowed = {
        packet["roles"][role]["candidateRef"].rsplit(":", 1)[1]
        for role in handoff.ROLES}
    if isinstance(reader, ReadOnlyGHCR):
        rf.need(reader.allowed_tags == allowed, "RF03_OCI_TAG_SCOPE_INVALID")
    target.mkdir(mode=0o700)
    cache, outputs = {}, {}
    for role in handoff.ROLES:
        claim = packet["roles"][role]
        tag = claim["candidateRef"].rsplit(":", 1)[1]
        try:
            graph = registry.collect_graph(
                reader, tag, target / role, role, packet["sourceCommit"],
                cache, version=packet["version"])
        except legacy.Pending:
            raise rf.Blocked("RF03_OCI_GRAPH_UNVERIFIED") from None
        wanted = {"digest": claim["manifestDigest"], "size": claim["size"],
                  "mediaType": claim["mediaType"]}
        rf.need(graph["topDescriptor"] == wanted and
                graph["digest"] == claim["manifestDigest"] and
                graph["manifestDigest"] == claim["platformManifestDigest"] and
                graph["configDigest"] == claim["configDigest"],
                "RF03_OCI_DESCRIPTOR_MISMATCH")
        outputs[role] = {"candidateRef": claim["candidateRef"],
                         "manifestDigest": graph["digest"],
                         "platformManifestDigest": graph["manifestDigest"],
                         "configDigest": graph["configDigest"]}
    # Catch sequential tag drift after three graph reads. Not a CAS / writer lock.
    for role in handoff.ROLES:
        claim = packet["roles"][role]
        tag = claim["candidateRef"].rsplit(":", 1)[1]
        try:
            final = reader.manifest(tag)
        except legacy.Pending:
            raise rf.Blocked("RF03_OCI_FINAL_RECHECK_UNVERIFIED") from None
        rf.need(type(final) is dict and
                all(final.get(key) == value for key, value in (
                    ("digest", claim["manifestDigest"]),
                    ("size", claim["size"]),
                    ("mediaType", claim["mediaType"]))),
                "RF03_OCI_FINAL_RECHECK_CHANGED")
    return {
        "kind": "RF03_OCI_READBACK_V1",
        "state": "BLOCKED_OWNER_SIGSTORE_AND_RELEASE_AUTHORITY_REQUIRED",
        "version": packet["version"],
        "candidateSourceCommit": packet["sourceCommit"],
        "candidateRunId": packet["candidate"]["runId"],
        "graphs": outputs,
        "ociGraphReadback": ("AUTHENTICATED_GHCR_BYTES_MATCHED"
                             if isinstance(reader, ReadOnlyGHCR)
                             else "SYNTHETIC_READER_ONLY"),
        "signatureVerification": "NOT_VERIFIED",
        "ownerAuthority": "NOT_VERIFIED",
        "registryPublication": "NOT_RUN",
        "externalWrites": 0,
    }
