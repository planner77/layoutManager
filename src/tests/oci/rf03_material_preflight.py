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
import candidate_policy as candidate

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
        value = json.loads(
            raw, object_pairs_hook=handoff.unique,
            parse_constant=lambda _: (_ for _ in ()).throw(
                rf.Blocked("RF03_MATERIAL_JSON_INVALID")))
    except rf.Blocked:
        # Duplicate keys and strict-JSON policy rejections are already safe
        # allowlisted codes; do not mask them as malformed syntax.
        raise
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
    # Existing #225 signer subjects are three immutable OCI manifests and
    # the receipt, not the public bundle/verification metadata JSON.
    mapping = {role: packet["roles"][role]["manifestDigest"][7:]
               for role in handoff.ROLES}
    mapping["receipt"] = sha(data["candidate-receipt.json"])
    expected_sums = "".join(mapping[role] + "  " + candidate.SUBJECTS[role] +
                            "\n" for role in (*handoff.ROLES, "receipt"))
    try:
        actual_sums = data["SHA256SUMS"].decode("ascii")
    except UnicodeError:
        raise rf.Blocked("RF03_MATERIAL_SUMS_INVALID") from None
    need(actual_sums == expected_sums, "RF03_MATERIAL_SUMS_INVALID")
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
