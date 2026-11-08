#!/usr/bin/env python3
"""RF-03 signed Candidate subject verifier (read only, never release GO).

Reuses the exact #225 GH CLI signer identity/SLSA contract, but allows the
strict RF-03 handoff's immutable version/source instead of issuing a new
Candidate or Promotion. Caller supplies previously downloaded artifact bytes
and an OCI readback workspace; this module cannot download, publish or close.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
import tarfile

import candidate_policy as ca
import candidate_publish as legacy
import release_finalizer as rf
import rf03_material_preflight as material
import rf03_release_handoff as handoff

ARCHIVE_FILE = "gh_" + legacy.GH_VERSION + "_linux_amd64.tar.gz"
BINARY_MEMBER = "gh_" + legacy.GH_VERSION + "_linux_amd64/bin/gh"
MAX_ARCHIVE = 64 * 1024 * 1024
MAX_BINARY = 140 * 1024 * 1024
MAX_OUTPUT = 2 * 1024 * 1024
SUBJECTS = {role: ca.SUBJECTS[role] for role in (*handoff.ROLES, "receipt")}


def require(ok, code):
    rf.need(ok, code)


def file_digest(path, maximum):
    path = Path(path)
    require(path.is_file() and not path.is_symlink()
            and 0 < path.stat().st_size <= maximum,
            "RF03_SIGNED_FILE_INVALID")
    size = path.stat().st_size
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    require(path.stat().st_size == size, "RF03_SIGNED_FILE_CHANGED")
    return digest.hexdigest(), size


def receipt_identity(receipt, packet):
    """Compare signed receipt fields, not its unverified 'approved' claims."""
    candidate = packet["candidate"]
    want = {
        "kind": "GHCR_CANDIDATE_RECEIPT_V1",
        "repository": rf.REPO,
        "repositoryId": rf.REPO_ID,
        "repositoryOwnerId": rf.OWNER_ID,
        "sourceCommit": packet["sourceCommit"],
        "sourceTree": packet["sourceTree"],
        "workflowCommit": packet["sourceCommit"],
        "runId": str(candidate["runId"]),
        "runAttempt": "1",
        "packetSha256": candidate["packetSha256"],
        "workflowPath": handoff.CANDIDATE_WORKFLOW,
        "version": packet["version"],
        "platform": "linux/amd64",
        "packageId": packet["packageId"],
        "visibility": "private",
    }
    require(type(receipt) is dict and all(receipt.get(k) == value
            and type(receipt.get(k)) is type(value)
            for k, value in want.items()), "RF03_SIGNED_RECEIPT_IDENTITY_INVALID")
    roles = receipt.get("roles")
    require(type(roles) is dict and set(roles) == set(handoff.ROLES),
            "RF03_SIGNED_RECEIPT_ROLES_INVALID")
    for role in handoff.ROLES:
        item, expected = roles[role], packet["roles"][role]
        want_role = {
            "subjectName": SUBJECTS[role],
            "candidateRef": expected["candidateRef"],
            "digestRef": rf.PACKAGE + "@" + expected["manifestDigest"],
            "manifestDigest": expected["manifestDigest"],
            "configDigest": expected["configDigest"],
            "platformManifestDigest": expected["platformManifestDigest"],
        }
        require(type(item) is dict and set(item) == set(want_role)
                and all(item.get(k) == v for k, v in want_role.items()),
                "RF03_SIGNED_RECEIPT_ROLE_DRIFT")


def prepare(packet, prior_plan, artifact_dir, graph_workspace):
    """Reconcile untrusted downloaded file hashes and exact graph subject bytes.

    The graph workspace must be populated by rf03_oci_readback.check; local
    fixture bytes on their own do not prove GHCR authentication.
    """
    handoff.check(packet, prior_plan)
    material.check(artifact_dir, packet, prior_plan)
    receipt_path = Path(artifact_dir) / "candidate-receipt.json"
    receipt = material.parse_json(material.raw_file(Path(artifact_dir),
                                                  "candidate-receipt.json"))
    receipt_identity(receipt, packet)
    paths, hashes = {"receipt": receipt_path}, {
        "receipt": packet["artifact"]["candidateReceiptSha256"]}
    root = Path(graph_workspace) / "rf03-candidate-oci"
    require(root.is_dir() and not root.is_symlink(),
            "RF03_SIGNED_GRAPH_WORKSPACE_MISSING")
    for role in handoff.ROLES:
        claim = packet["roles"][role]
        name = claim["manifestDigest"][7:]
        path = root / role / name
        digest, size = file_digest(path, handoff.MAX_DESCRIPTOR)
        require(digest == name and size == claim["size"],
                "RF03_SIGNED_OCI_SUBJECT_CHANGED")
        paths[role], hashes[role] = path, digest
    require(file_digest(receipt_path, material.LIMIT)[0] == hashes["receipt"],
            "RF03_SIGNED_RECEIPT_CHANGED")
    bundle = Path(artifact_dir) / "candidate-bundle.sigstore.json"
    require(file_digest(bundle, material.LIMIT)[0] ==
            packet["artifact"]["signatureBundleSha256"],
            "RF03_SIGNED_BUNDLE_CHANGED")
    return paths, hashes, bundle


def certificate_result(raw, packet, mapping):
    """Reuse proven #225 certificate subject, issuer, workflow, run checks.

    An injected or fabricated JSON result is NOT cryptographic verification;
    only a successful pinned CLI invocation can establish that fact.
    """
    require(type(raw) is bytes and 0 < len(raw) <= MAX_OUTPUT,
            "RF03_SIGNED_CLI_OUTPUT_INVALID")
    try:
        rows = json.loads(raw, object_pairs_hook=handoff.unique,
                          parse_constant=lambda _: (_ for _ in ()).throw(
                              rf.Blocked("RF03_SIGNED_CLI_OUTPUT_INVALID")))
    except rf.Blocked:
        raise
    except (ValueError, TypeError, RecursionError, UnicodeError):
        raise rf.Blocked("RF03_SIGNED_CLI_OUTPUT_INVALID") from None
    expected = {
        "sourceCommit": packet["sourceCommit"],
        "workflowCommit": packet["sourceCommit"],
        "runId": str(packet["candidate"]["runId"]),
    }
    try:
        ca.certificate(rows, expected, mapping)
    except (ca.Pending, AttributeError, KeyError, TypeError, ValueError):
        raise rf.Blocked("RF03_SIGNED_CERTIFICATE_INVALID") from None


def verify_pinned_binary(archive_path, binary_path):
    """Check executable bytes against the SHA256-pinned #225 gh tarball.

    Never extract arbitrary archive paths or accept a PATH-supplied gh binary.
    """
    archive, binary = Path(archive_path), Path(binary_path)
    archive_sha, _ = file_digest(archive, MAX_ARCHIVE)
    require(archive_sha == legacy.GH_ARCHIVE_SHA, "RF03_SIGNED_GH_ARCHIVE_INVALID")
    binary_sha, binary_size = file_digest(binary, MAX_BINARY)
    require(os.access(binary, os.X_OK), "RF03_SIGNED_GH_NOT_EXECUTABLE")
    try:
        with tarfile.open(archive, mode="r:gz") as stream:
            entry = stream.getmember(BINARY_MEMBER)
            require(entry.isfile() and 0 < entry.size <= MAX_BINARY
                    and entry.size == binary_size,
                    "RF03_SIGNED_GH_TAR_MEMBER_INVALID")
            item = stream.extractfile(entry)
            require(item is not None, "RF03_SIGNED_GH_TAR_MEMBER_INVALID")
            digest = hashlib.sha256()
            with item:
                for chunk in iter(lambda: item.read(1024 * 1024), b""):
                    digest.update(chunk)
        require(digest.hexdigest() == binary_sha,
                "RF03_SIGNED_GH_BINARY_CHANGED")
    except (tarfile.TarError, OSError, KeyError, EOFError):
        raise rf.Blocked("RF03_SIGNED_GH_TAR_MEMBER_INVALID") from None
    return binary_sha


def command_argv(gh_binary, subject, source, bundle=None):
    flags = [str(gh_binary), "attestation", "verify", str(subject),
             "--repo", rf.REPO, "--signer-workflow", ca.SIGNER,
             "--signer-digest", source, "--source-digest", source,
             "--source-ref", "refs/heads/main",
             "--deny-self-hosted-runners", "--format", "json"]
    return flags if bundle is None else flags + ["--bundle", str(bundle)]


def execute(argv, token, workdir):
    """No ambient credentials or inherited proxy; fixed argv and read token."""
    require(type(token) is str and 0 < len(token) <= 4096
            and not any(c in token for c in "\r\n\0"),
            "RF03_SIGNED_READ_TOKEN_INVALID")
    try:
        proc = subprocess.run(
            argv, cwd=str(workdir), env={
                "PATH": "/usr/bin:/bin", "GH_TOKEN": token,
                "GH_CONFIG_DIR": str(Path(workdir) / "gh-config")},
            capture_output=True, timeout=120, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise rf.Blocked("RF03_SIGNED_CLI_UNAVAILABLE") from None
    require(proc.returncode == 0 and len(proc.stdout) <= MAX_OUTPUT
            and len(proc.stderr) <= MAX_OUTPUT,
            "RF03_SIGNED_CLI_FAILED_OR_UNVERIFIED")
    return proc.stdout


def audit(packet, prior_plan, artifact_dir, graph_workspace,
          gh_archive, gh_binary, token):
    """Eight fresh online+bundle checks, zero writes or release authority."""
    subjects, mapping, bundle = prepare(
        packet, prior_plan, artifact_dir, graph_workspace)
    verify_pinned_binary(gh_archive, gh_binary)
    workspace = Path(graph_workspace)
    config = workspace / "gh-config"
    require(not config.exists(), "RF03_SIGNED_GH_CONFIG_REUSED")
    config.mkdir(mode=0o700)
    gh_digest = file_digest(gh_binary, MAX_BINARY)[0]
    bundle_digest = file_digest(bundle, material.LIMIT)[0]
    require(execute([str(gh_binary), "--version"], token, workspace).decode(
        "utf-8", errors="replace").startswith(
            "gh version " + legacy.GH_VERSION + " "),
            "RF03_SIGNED_GH_VERSION_INVALID")
    for role in (*handoff.ROLES, "receipt"):
        path = subjects[role]
        require(file_digest(path, handoff.MAX_DESCRIPTOR)[0] == mapping[role],
                "RF03_SIGNED_SUBJECT_CHANGED")
        for attach in (None, bundle):
            raw = execute(command_argv(
                gh_binary, path, packet["sourceCommit"], attach),
                token, workspace)
            certificate_result(raw, packet, mapping)
            require(file_digest(path, handoff.MAX_DESCRIPTOR)[0] == mapping[role]
                    and file_digest(bundle, material.LIMIT)[0] == bundle_digest
                    and file_digest(gh_binary, MAX_BINARY)[0] == gh_digest,
                    "RF03_SIGNED_MATERIAL_CHANGED_DURING_VERIFY")
    return {
        "kind": "RF03_SIGNED_CANDIDATE_READBACK_V1",
        "state": "BLOCKED_INDEPENDENT_OWNER_PROMOTION_AND_REGISTRY_PROOF",
        "sourceCommit": packet["sourceCommit"],
        "candidateRunId": packet["candidate"]["runId"],
        "version": packet["version"],
        "subjectDigests": {SUBJECTS[role]: "sha256:" + mapping[role]
                           for role in (*handoff.ROLES, "receipt")},
        "cli": "PINNED_GH_" + legacy.GH_VERSION,
        "signatureVerification": "CANDIDATE_SUBJECTS_CLI_CHECKED_NOT_RELEASE_GO",
        "ownerAuthority": "NOT_VERIFIED",
        "finalRegistryPublication": "NOT_VERIFIED",
        "registryPublication": "NOT_RUN",
        "externalWrites": 0,
    }
