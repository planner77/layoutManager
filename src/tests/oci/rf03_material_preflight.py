#!/usr/bin/env python3
"""RF-03 exact candidate artifact byte preflight; no release authorization.

The existing 0.61.0 promotion verifier remains the authoritative crypto/OCI
implementation until an independently reviewed version-generic writer exists.
Metadata checksums and JSON claims are NOT Sigstore verification.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import release_finalizer as rf
import rf03_release_handoff as handoff

FILES = ("candidate-receipt.json", "candidate-bundle.sigstore.json",
         "verification.json", "SHA256SUMS")
LIMIT = 2 * 1024 * 1024


def need(value, code):
    rf.need(value, code)


def raw_file(root, name):
    path = root / name
    need(path.is_file() and not path.is_symlink(), "RF03_MATERIAL_FILE_INVALID")
    size = path.stat().st_size
    need(0 < size <= LIMIT, "RF03_MATERIAL_SIZE_INVALID")
    raw = path.read_bytes()
    need(len(raw) == size, "RF03_MATERIAL_CHANGED_DURING_READ")
    return raw


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def parse_json(raw):
    try:
        value = json.loads(raw, object_pairs_hook=handoff.unique)
    except (ValueError, UnicodeError, RecursionError, TypeError):
        raise rf.Blocked("RF03_MATERIAL_JSON_INVALID") from None
    need(type(value) is dict, "RF03_MATERIAL_JSON_INVALID")
    return value


def check(directory, packet, original_plan):
    """Bind local artifact file bytes to the handoff; no HTTP or mutations."""
    handoff.check(packet, original_plan)
    root = Path(directory)
    need(root.is_dir() and not root.is_symlink(),
         "RF03_MATERIAL_DIRECTORY_INVALID")
    need({p.name for p in root.iterdir()} == set(FILES),
         "RF03_MATERIAL_FILE_SET_INVALID")
    data = {name: raw_file(root, name) for name in FILES}
    receipt = parse_json(data["candidate-receipt.json"])
    bundle = parse_json(data["candidate-bundle.sigstore.json"])
    verification = parse_json(data["verification.json"])
    expected = packet["artifact"]
    need(sha(data["candidate-receipt.json"]) ==
         expected["candidateReceiptSha256"],
         "RF03_MATERIAL_RECEIPT_HASH_INVALID")
    need(sha(data["candidate-bundle.sigstore.json"]) ==
         expected["signatureBundleSha256"],
         "RF03_MATERIAL_BUNDLE_HASH_INVALID")
    need(sha(data["verification.json"]) ==
         expected["verificationSha256"],
         "RF03_MATERIAL_VERIFICATION_HASH_INVALID")
    # Restrict the checksum manifest to exactly the three JSON subjects.
    try:
        lines = data["SHA256SUMS"].decode("ascii").splitlines()
    except UnicodeError:
        raise rf.Blocked("RF03_MATERIAL_SUMS_INVALID") from None
    expected_subjects = set(FILES) - {"SHA256SUMS"}
    observed = {}
    for line in lines:
        need(len(line) > 66 and line[64:66] == "  " and
             handoff.sha64(line[:64]), "RF03_MATERIAL_SUMS_INVALID")
        name = line[66:]
        need(name in expected_subjects and name not in observed,
             "RF03_MATERIAL_SUMS_INVALID")
        observed[name] = line[:64]
    need(set(observed) == expected_subjects and all(
        observed[name] == sha(data[name]) for name in observed),
        "RF03_MATERIAL_SUMS_INVALID")
    # Require explicit shape only; never accept claimed 'verified' as crypto.
    need(all(type(value) is dict for value in (receipt, bundle, verification)),
         "RF03_MATERIAL_JSON_INVALID")
    return {
        "kind": "RF03_MATERIAL_BYTES_PREFLIGHT_V1",
        "state": "BLOCKED_INDEPENDENT_SIGSTORE_AND_OCI_PROOF_REQUIRED",
        "artifactSource": packet["sourceCommit"],
        "candidateRunId": packet["candidate"]["runId"],
        "fileSha256": {name: sha(data[name]) for name in FILES},
        "artifactBytes": "HASH_MATCHED_NOT_AUTHENTICATED",
        "signatureVerification": "NOT_VERIFIED",
        "ociGraphReadback": "NOT_VERIFIED",
        "ownerAuthority": "NOT_VERIFIED",
        "registryPublication": "NOT_RUN",
        "externalWrites": 0,
    }
