#!/usr/bin/env python3
"""RF-03 exact GitHub artifact ZIP byte verification and bounded extraction.

This is NOT an authenticated download client, signer verification, Owner GO,
OCI publication, or a new release writer. Supply the *original* GitHub ZIP
bytes retrieved for the candidate artifact ID; never trust extracted files
or a caller-provided SHA without an independent GitHub metadata readback.
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import stat
import zipfile
import zlib

import release_finalizer as rf
import rf03_material_preflight as material
import rf03_release_handoff as handoff

ARCHIVE_LIMIT = 16 * 1024 * 1024
TOTAL_UNCOMPRESSED_LIMIT = len(material.FILES) * material.LIMIT
CHUNK = 64 * 1024


def require(ok, code):
    rf.need(ok, code)


def archive_digest(path, expected_size):
    """Hash the complete original ZIP bytes, not the extracted members."""
    path = Path(path)
    require(path.is_file() and not path.is_symlink()
            and type(expected_size) is int
            and 0 < expected_size <= ARCHIVE_LIMIT
            and path.stat().st_size == expected_size,
            "RF03_ARCHIVE_SIZE_OR_PATH_INVALID")
    digest, read = hashlib.sha256(), 0
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(CHUNK), b""):
            read += len(chunk)
            require(read <= expected_size, "RF03_ARCHIVE_CHANGED_DURING_READ")
            digest.update(chunk)
    require(read == expected_size and path.stat().st_size == expected_size,
            "RF03_ARCHIVE_CHANGED_DURING_READ")
    return "sha256:" + digest.hexdigest()


def validate_entries(archive):
    """No path traversal, duplicates, executable/symlink entries or zip bombs."""
    entries = archive.infolist()
    require(len(entries) == len(material.FILES)
            and {entry.filename for entry in entries} == set(material.FILES),
            "RF03_ARCHIVE_FILE_SET_INVALID")
    total, observed = 0, set()
    for entry in entries:
        name = entry.filename
        require(name not in observed and not entry.is_dir()
                and entry.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)
                and not (entry.flag_bits & 0x1),
                "RF03_ARCHIVE_UNSAFE_ENTRY")
        observed.add(name)
        # Artifact files are ordinary base-name regular files. Python's zipfile
        # may set POSIX permissions without the file-type bits; mode=0 is okay.
        kind = stat.S_IFMT(entry.external_attr >> 16)
        require(kind in (0, stat.S_IFREG)
                and 0 < entry.compress_size <= ARCHIVE_LIMIT,
                "RF03_ARCHIVE_UNSAFE_ENTRY")
        require(0 < entry.file_size <= material.LIMIT,
                "RF03_ARCHIVE_RESOURCE_LIMIT")
        total += entry.file_size
        require(total <= TOTAL_UNCOMPRESSED_LIMIT
                and entry.file_size <= max(1024, entry.compress_size * 300),
                "RF03_ARCHIVE_RESOURCE_LIMIT")


def verify_and_extract(archive_path, packet, prior_plan, destination):
    """Extract only verified exact archived files into an exclusive directory."""
    handoff.check(packet, prior_plan)
    expected = packet["artifact"]
    digest = archive_digest(archive_path, expected["size"])
    require(digest == expected["digest"], "RF03_ARCHIVE_DIGEST_INVALID")
    target = Path(destination)
    require(target.parent.is_dir() and not target.parent.is_symlink()
            and not target.exists() and not target.is_symlink(),
            "RF03_ARCHIVE_DESTINATION_INVALID")
    try:
        with zipfile.ZipFile(archive_path, mode="r", allowZip64=False) as archive:
            validate_entries(archive)
            # Caller-supplied scratch path is local only, not the original
            # artifact; an uncertain extraction never automatically resumes.
            target.mkdir(mode=0o700)
            for entry in archive.infolist():
                output = target / entry.filename
                flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
                if hasattr(os, "O_NOFOLLOW"):
                    flags |= os.O_NOFOLLOW
                count = 0
                with archive.open(entry, "r") as inp, os.fdopen(
                        os.open(output, flags, 0o600), "wb") as out:
                    while True:
                        block = inp.read(CHUNK)
                        if not block:
                            break
                        count += len(block)
                        require(count <= entry.file_size
                                and count <= material.LIMIT,
                                "RF03_ARCHIVE_RESOURCE_LIMIT")
                        out.write(block)
                    out.flush()
                    os.fsync(out.fileno())
                require(count == entry.file_size,
                        "RF03_ARCHIVE_FILE_LENGTH_CHANGED")
    except rf.Blocked:
        raise
    except (zipfile.BadZipFile, zipfile.LargeZipFile, RuntimeError, OSError,
            EOFError, ValueError, NotImplementedError, zlib.error):
        raise rf.Blocked("RF03_ARCHIVE_UNVERIFIED_OR_TRUNCATED") from None
    require(archive_digest(archive_path, expected["size"]) == digest,
            "RF03_ARCHIVE_CHANGED_DURING_READ")
    bound = material.check(target, packet, prior_plan)
    return {
        "kind": "RF03_ARTIFACT_ARCHIVE_BYTES_V1",
        "state": "BLOCKED_SIGNATURE_AND_OWNER_PROMOTION_REQUIRED",
        "artifactId": expected["id"],
        "candidateRunId": packet["candidate"]["runId"],
        "zipSha256": digest,
        "files": bound["fileSha256"],
        "signatureVerification": "NOT_VERIFIED",
        "ownerAuthority": "NOT_VERIFIED",
        "registryPublication": "NOT_RUN",
        "externalWrites": 0,
    }
