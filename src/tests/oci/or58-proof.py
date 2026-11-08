#!/usr/bin/env python3
"""OR58 bounded operating backup/restore proof. Default action is read-only plan.

Capture and restore are deliberately separate one-shot actions. No Docker action
is attempted without a sealed local packet and a matching maintenance authority.
All receipts and archives stay in a private, ignored data directory.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import select
import re
import secrets
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import time

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / "data/release-proof/or58"
APP_NAME = "cad-layout-viewer-app"
APP_PREFIX = "876103488dce"
IMAGE_ID = "sha256:6abdef1ede21fd9a84a41d3c49621a9657ac0a10a23057f7f7b3f27515b62a50"
APP_REPO_DIGEST = "9db2d3c31d00f9ec639200aa83dd02205e51a1089bcb4639f4a4198555d17f2d"
MIGRATOR_REPO_DIGEST = "a68b168e931b6b2525e22fd6a7423ebeea08ced8f0c87c68166ef44c0178437b"
SOURCE = "de92be0ea3a5de38008a57e8c29013d19667f11e"
VERSION = "0.58.0"
OLD_APP_REF = "ghcr.io/planner77/layoutmanager:0.58.0"
OLD_MIGRATOR_REF = "ghcr.io/planner77/layoutmanager:0.58.0-migrate"
VOLUME = "cad-layout-viewer-g7"
MIGRATOR_PREFIX = "85fd2a44f81f"
OWNER_LABEL = "com.planner77.or58.nonce"
PURPOSE_LABEL = "com.planner77.purpose=or58-restore-proof"
CAPTURE_BUDGET = 30
STOP_BUDGET = 20
START_BUDGET = 60
OUTAGE_BUDGET = 120
RESTART_RESERVE = 70
MAX_ARCHIVE = 256 * 1024 * 1024
SCHEMA_CHECK = ROOT / "src/tests/oci/or58-schema-check.ts"


class Blocked(Exception):
    pass


def require(ok, code):
    if not ok:
        raise Blocked(code)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def docker(*args, timeout=30, input_bytes=None):
    try:
        result = subprocess.run(["docker", *args], input=input_bytes, capture_output=True,
                                timeout=timeout, check=False)
    except subprocess.TimeoutExpired as exc:
        raise Blocked("OR58_DOCKER_TIMEOUT") from exc
    require(result.returncode == 0, "OR58_DOCKER_FAILED")
    return result.stdout


def inspect(kind, identity, *, timeout=30):
    rows = json.loads(docker(kind, "inspect", identity, timeout=timeout))
    require(isinstance(rows, list) and len(rows) == 1, "OR58_INSPECT_INVALID")
    return rows[0]


def container_ids(volume, *, all_containers=True, timeout=30):
    args = ("ps", "-aq", "--no-trunc") if all_containers else ("ps", "-q", "--no-trunc")
    ids = docker(*args, "--filter", "volume=" + volume, timeout=timeout).decode().splitlines()
    require(len(ids) <= 4, "OR58_VOLUME_ATTACHMENT_COUNT_UNKNOWN")
    return ids


def attached(volume, *, running_only=False):
    ids = container_ids(volume, all_containers=not running_only)
    return [row for row in (inspect("container", cid) for cid in ids)
            if any(m.get("Type") == "volume" and m.get("Name") == volume
                   for m in row.get("Mounts", []))]


def no_running_attachment(volume, *, deadline):
    remaining = deadline - time.monotonic()
    require(remaining > 0, "OR58_OUTAGE_DEADLINE")
    ids = container_ids(volume, all_containers=False, timeout=min(3, remaining))
    require(not ids, "OR58_SOURCE_WRITER_PRESENT")


def remaining(deadline, maximum):
    left = deadline - time.monotonic()
    require(left > 0, "OR58_OUTAGE_DEADLINE")
    return min(maximum, left)


def original():
    app = inspect("container", APP_NAME)
    require(app["Id"].startswith(APP_PREFIX) and app.get("Name") == "/" + APP_NAME,
            "OR58_APP_IDENTITY_CHANGED")
    require(app.get("Image") == IMAGE_ID, "OR58_IMAGE_CHANGED")
    mounts = [m for m in app.get("Mounts", []) if m.get("Destination") == "/data"]
    require(len(mounts) == 1 and mounts[0].get("Type") == "volume" and
            mounts[0].get("Name") == VOLUME, "OR58_MOUNT_CHANGED")
    image = inspect("image", IMAGE_ID)
    require(image.get("Id") == IMAGE_ID, "OR58_IMAGE_MISSING")
    env = app.get("Config", {}).get("Env", [])
    # Only allowlisted values are exposed. Full configuration is represented by a hash.
    values = dict(item.split("=", 1) for item in env if "=" in item)
    require(values.get("CAD_STORAGE_BACKEND") == "local", "OR58_BACKEND_CHANGED")
    source = values.get("G7_RELEASE_SOURCE_COMMIT") or image.get("Config", {}).get("Labels", {}).get("org.opencontainers.image.revision")
    require(source == SOURCE, "OR58_SOURCE_CHANGED")
    version = (values.get("G7_APP_VERSION") or values.get("npm_package_version") or
               image.get("Config", {}).get("Labels", {}).get("org.opencontainers.image.version"))
    require(version == VERSION, "OR58_VERSION_UNPROVEN")
    require(app.get("State", {}).get("Running") is True, "OR58_APP_NOT_RUNNING")
    return app, image


def inventory():
    app, image = original()
    rows = attached(VOLUME)
    require(any(row["Id"] == app["Id"] for row in rows), "OR58_APP_MOUNT_ABSENT")
    for row in rows:
        if row["Id"] == app["Id"]:
            continue
        require(row["Id"].startswith(MIGRATOR_PREFIX) and
                row.get("State", {}).get("Running") is False,
                "OR58_UNKNOWN_VOLUME_ATTACHMENT")
    require(len(rows) == 2, "OR58_ATTACHMENT_SET_CHANGED")
    return app, image, rows


def attachment_descriptor(row):
    return {"id": row["Id"], "imageId": row.get("Image"),
            "running": row.get("State", {}).get("Running"),
            "configSha256": sha(canonical({"Config": row.get("Config"),
                                           "HostConfig": row.get("HostConfig"),
                                           "Mounts": row.get("Mounts")})),
            "mounts": [{"type": mount.get("Type"), "name": mount.get("Name"),
                        "destination": mount.get("Destination"), "rw": mount.get("RW")}
                       for mount in row.get("Mounts", [])]}


def private_dir(path):
    path = path.resolve()
    require(path.is_relative_to(EVIDENCE.resolve()), "OR58_EVIDENCE_OUTSIDE_PRIVATE_ROOT")
    EVIDENCE.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(EVIDENCE, 0o700)
    path.mkdir(mode=0o700, exist_ok=False)
    os.chmod(path, 0o700)
    return path


def write_json(path, value):
    payload = canonical(value) + b"\n"
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as stream:
        stream.write(payload)
        stream.flush(); os.fsync(stream.fileno())
    fsync_dir(path.parent)


def fsync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def load_packet(path):
    require(path and path.name == "packet.json" and
            path.resolve().parent.is_relative_to(EVIDENCE.resolve()) and
            path.resolve().parent.parent == EVIDENCE.resolve() and
            path.parent.stat().st_mode & 0o077 == 0,
            "OR58_PACKET_PATH_INVALID")
    require(path.is_file() and path.stat().st_mode & 0o077 == 0,
            "OR58_PACKET_NOT_PRIVATE")
    packet = json.loads(path.read_bytes())
    require(packet.get("purpose") == "OR58" and
            re.fullmatch(r"[0-9a-f]{32}", str(packet.get("nonce", ""))) and
            packet.get("evidenceRoot") == str(path.resolve().parent) and
            packet.get("appId", "").startswith(APP_PREFIX) and
            packet.get("imageId") == IMAGE_ID and packet.get("source") == SOURCE and
            packet.get("version") == VERSION and packet.get("backend") == "local" and
            packet.get("sourceVolume") == VOLUME and
            packet.get("approvalHash") == sha(canonical({k: v for k, v in packet.items()
                                                        if k != "approvalHash"})),
            "OR58_PACKET_INVALID")
    return packet


def plan(inventory_path=None):
    app, image, rows = inventory()
    nonce = secrets.token_hex(16)
    require(any(str(value).endswith("@sha256:" + APP_REPO_DIGEST)
                for value in image.get("RepoDigests", [])), "OR58_APP_REPO_DIGEST_CHANGED")
    migrator = next(row for row in rows if row["Id"] != app["Id"])
    migrator_image = inspect("image", migrator["Image"])
    require(migrator_image.get("Id") == migrator["Image"] and
            any(str(value).endswith("@sha256:" + MIGRATOR_REPO_DIGEST)
                for value in migrator_image.get("RepoDigests", [])),
            "OR58_MIGRATOR_IMAGE_CHANGED")
    volume = inspect("volume", VOLUME)
    require(volume.get("Name") == VOLUME, "OR58_VOLUME_CHANGED")
    root = private_dir(EVIDENCE / nonce)
    if inventory_path is None:
        source_inventory = volume_hashes(VOLUME, nonce=nonce, root=root,
                                         deadline=time.monotonic() + 30)
        install = source_inventory["installation"]
        file_count = len(source_inventory["files"])
    else:
        require(inventory_path.is_file() and inventory_path.stat().st_mode & 0o077 == 0,
                "OR58_INVENTORY_NOT_PRIVATE")
        prior = json.loads(inventory_path.read_bytes())
        require(prior.get("kind") == "OR58_READ_ONLY_LIVE_INVENTORY_NOT_SNAPSHOT" and
                prior.get("unsafeEntries") == 0 and
                prior.get("database", {}).get("integrityOk") is True and
                prior.get("database", {}).get("foreignKeyErrors") == 0,
                "OR58_INVENTORY_INVALID")
        entry = prior["installation"]
        install = {"version": entry.get("version"), "schemaId": entry.get("schemaId"),
                   "sourceCommitPresent": entry.get("sourceCommitPresent"),
                   "appImageMatchesFixed": entry.get("appImageMatchesFixed"),
                   "migratorImageMatchesFixed": entry.get("migratorImageMatchesFixed"),
                   "manifestSha256": entry.get("manifestSha256")}
        file_count = prior.get("fileCount")
    require(install.get("version") == VERSION and
            install.get("schemaId") == "G7-GREENFIELD-SEMANTIC-ZONES-20261101-1" and
            install.get("sourceCommitPresent") is False and
            install.get("appImageMatchesFixed") is True and
            install.get("migratorImageMatchesFixed") is True,
            "OR58_INSTALL_IDENTITY_CHANGED")
    usage = shutil.disk_usage(root)
    require(usage.free >= MAX_ARCHIVE * 4, "OR58_EVIDENCE_SPACE_INSUFFICIENT")
    packet = {
        "purpose": "OR58", "nonce": nonce, "appId": app["Id"], "imageId": IMAGE_ID,
        "imageRepoDigests": image.get("RepoDigests", []), "source": SOURCE,
        "migratorImageId": migrator_image["Id"],
        "migratorRepoDigests": migrator_image.get("RepoDigests", []),
        "version": VERSION, "backend": "local", "sourceVolume": VOLUME,
        "installation": install, "sourceFileCountAtPlan": file_count,
        "inventorySource": "ROOT_READONLY_FILE" if inventory_path else "READONLY_VOLUME_HELPER",
        "sourceVolumeIdentity": {"name": volume.get("Name"), "driver": volume.get("Driver"),
                                 "scope": volume.get("Scope"),
                                 "createdAt": volume.get("CreatedAt"),
                                 "optionsSha256": sha(canonical(volume.get("Options"))),
                                 "mountpointSha256": sha(str(volume.get("Mountpoint")).encode()),
                                 "labelsSha256": sha(canonical(volume.get("Labels")))},
        "attachments": [attachment_descriptor(row) for row in rows],
        "ports": app.get("NetworkSettings", {}).get("Ports"),
        "configSha256": sha(canonical({"Config": app.get("Config"),
                                       "HostConfig": app.get("HostConfig"),
                                       "Mounts": app.get("Mounts")})),
        "evidenceRoot": str(root), "stopSeconds": STOP_BUDGET,
        "captureSeconds": CAPTURE_BUDGET, "restartHealthySeconds": START_BUDGET,
        "outageBudgetSeconds": OUTAGE_BUDGET, "restartReserveSeconds": RESTART_RESERVE,
        "maxArchiveBytes": MAX_ARCHIVE, "hostWriterExclusion": "UNPROVEN",
        "status": "READINESS_ONLY", "createdUnix": int(time.time()),
    }
    packet["approvalHash"] = sha(canonical(packet))
    write_json(root / "packet.json", packet)
    return {"packet": str(root / "packet.json"), "approvalHash": packet["approvalHash"],
            "status": "READINESS_ONLY", "hostWriterExclusion": "UNPROVEN"}


def validate_approval(packet, args):
    require(args.approval_hash == packet["approvalHash"], "OR58_APPROVAL_MISMATCH")
    require(args.maintenance_authorization == "OR58_EXACT_OPERATING_STOP_APPROVED",
            "OR58_MAINTENANCE_AUTH_REQUIRED")
    authority_path = args.root_authorization_file
    require(authority_path and authority_path.is_file() and
            authority_path.stat().st_mode & 0o077 == 0,
            "OR58_ROOT_AUTHORIZATION_REQUIRED")
    authority = json.loads(authority_path.read_bytes())
    require(authority == {"purpose": "OR58_ROOT_MAINTENANCE_AUTHORIZATION",
                          "approvalHash": packet["approvalHash"],
                          "appId": packet["appId"], "volume": VOLUME,
                          "nonce": packet["nonce"]},
            "OR58_ROOT_AUTHORIZATION_MISMATCH")
    require(args.host_writer_attestation == "HOST_WRITERS_EXCLUDED_FOR_CAPTURE_EPOCH",
            "OR58_HOST_WRITER_EXCLUSION_UNPROVEN")


def validate_original(packet):
    app, _, rows = inventory()
    volume = inspect("volume", VOLUME)
    require(app["Id"] == packet["appId"], "OR58_APP_CHANGED")
    require(sha(canonical({"Config": app.get("Config"),
                           "HostConfig": app.get("HostConfig"),
                           "Mounts": app.get("Mounts")})) == packet["configSha256"],
            "OR58_CONFIG_CHANGED")
    require(sorted((attachment_descriptor(row) for row in rows), key=lambda x: x["id"]) ==
            sorted(packet["attachments"], key=lambda x: x["id"]),
            "OR58_ATTACHMENTS_CHANGED")
    require(packet["sourceVolumeIdentity"] == {
        "name": volume.get("Name"), "driver": volume.get("Driver"), "scope": volume.get("Scope"),
        "createdAt": volume.get("CreatedAt"),
        "optionsSha256": sha(canonical(volume.get("Options"))),
        "mountpointSha256": sha(str(volume.get("Mountpoint")).encode()),
        "labelsSha256": sha(canonical(volume.get("Labels")))}, "OR58_VOLUME_CHANGED")
    return app


def wait_healthy(cid, *, deadline=None):
    deadline = deadline or time.monotonic() + START_BUDGET
    while time.monotonic() < deadline:
        row = inspect("container", cid, timeout=remaining(deadline, 3))
        require(row["Id"] == cid, "OR58_RESTART_ID_CHANGED")
        if row.get("State", {}).get("Running") and row.get("State", {}).get("Health", {}).get("Status") == "healthy":
            return
        time.sleep(min(1, max(0, deadline - time.monotonic())))
    raise Blocked("OR58_ORIGINAL_HEALTH_TIMEOUT")


def safe_tar_members(path):
    with tarfile.open(path, "r:") as archive:
        members = archive.getmembers()
        require(members, "OR58_ARCHIVE_EMPTY")
        for member in members:
            name = member.name.removeprefix("./")
            require(name and not name.startswith("/") and ".." not in Path(name).parts and
                    (member.isfile() or member.isdir()), "OR58_ARCHIVE_UNSAFE")
        names = {m.name.removeprefix("./") for m in members if m.isfile()}
        require("db/cad.sqlite" in names and "db/g7-install.json" in names and
                any(n.startswith("cad/") for n in names), "OR58_ARCHIVE_INCOMPLETE")
    return len(members)


def tar_file_hashes(path):
    result = {}
    with tarfile.open(path, "r:") as archive:
        for member in archive:
            if member.isfile():
                name = member.name.removeprefix("./")
                require(name not in result, "OR58_ARCHIVE_DUPLICATE")
                digest = hashlib.sha256()
                stream = archive.extractfile(member)
                while chunk := stream.read(1024 * 1024):
                    digest.update(chunk)
                result[name] = {"size": member.size, "sha256": digest.hexdigest()}
    return result


def create_helper(root, nonce, volume, kind, *, readonly, command, deadline,
                  cleanup_deadline=None):
    require(volume == VOLUME or volume == "or58-" + nonce, "OR58_VOLUME_INVALID")
    require(re.fullmatch(r"[0-9a-f]{32}", nonce), "OR58_NONCE_INVALID")
    name = f"or58-{nonce}-{kind}-{secrets.token_hex(4)}"
    cidfile = root / (name + ".cid")
    mount = f"type=volume,source={volume},target=/data,volume-nocopy"
    if readonly:
        mount += ",readonly"
    try:
        cid = docker("create", "-i", "--name", name, "--cidfile", str(cidfile),
                     "--label", PURPOSE_LABEL, "--label", f"{OWNER_LABEL}={nonce}",
                     "--network", "none", "--mount", mount, *command,
                     timeout=remaining(deadline, 5)).decode().strip()
    except BaseException:
        if cidfile.is_file():
            uncertain_id = cidfile.read_text().strip()
            if re.fullmatch(r"[0-9a-f]{64}", uncertain_id):
                cleanup_helper(uncertain_id, nonce=nonce, volume=volume,
                               deadline=cleanup_deadline or deadline + 10)
        raise
    try:
        require(re.fullmatch(r"[0-9a-f]{64}", cid), "OR58_HELPER_ID_INVALID")
        require(cidfile.read_text().strip() == cid, "OR58_HELPER_CIDFILE_MISMATCH")
        write_json(root / f"helper-{name}.json", {"id": cid, "name": name, "nonce": nonce,
                                                    "volume": volume, "image": IMAGE_ID,
                                                    "kind": kind})
    except BaseException:
        if re.fullmatch(r"[0-9a-f]{64}", cid):
            cleanup_helper(cid, nonce=nonce, volume=volume,
                           deadline=cleanup_deadline or deadline + 10)
        raise
    return cid


def cleanup_helper(cid, *, nonce, volume, deadline):
    """Stop/remove only a still-identical helper; never sweep by name or label alone."""
    row = inspect("container", cid, timeout=remaining(deadline, 3))
    require(row.get("Id") == cid and row.get("Image") == IMAGE_ID and
            row.get("Config", {}).get("Labels", {}).get(OWNER_LABEL) == nonce and
            row.get("Config", {}).get("Labels", {}).get("com.planner77.purpose") == "or58-restore-proof" and
            row.get("HostConfig", {}).get("NetworkMode") == "none" and
            any(m.get("Name") == volume and m.get("Destination") == "/data"
                for m in row.get("Mounts", [])), "OR58_HELPER_OWNERSHIP_INVALID")
    if row.get("State", {}).get("Running"):
        docker("stop", "--time", "1", cid, timeout=remaining(deadline, 3))
    docker("rm", cid, timeout=remaining(deadline, 3))


def volume_hashes(volume, *, nonce, root, deadline, cleanup_deadline=None):
    script = Path(__file__).with_name("or58-volume-inspect.mjs").read_bytes()
    cid = create_helper(root, nonce, volume, "inspect", readonly=True,
                        command=("--entrypoint", "node", IMAGE_ID, "--input-type=module", "-"),
                        deadline=deadline, cleanup_deadline=cleanup_deadline)
    try:
        data = docker("start", "-ai", cid, timeout=remaining(deadline, 10),
                      input_bytes=script)
        result = json.loads(data)
        require(isinstance(result, dict) and isinstance(result.get("files"), dict) and
                isinstance(result.get("installation"), dict), "OR58_FILE_INVENTORY_INVALID")
        return result
    finally:
        cleanup_helper(cid, nonce=nonce, volume=volume,
                       deadline=cleanup_deadline or deadline + 10)


def bounded_stream(process, target, *, deadline, max_bytes):
    """Copy stdout with a wall deadline; never wait forever on a stalled reader."""
    digest = hashlib.sha256(); size = 0
    with target.open("xb") as stream:
        os.chmod(target, 0o600)
        while True:
            left = deadline - time.monotonic()
            require(left > 0, "OR58_CAPTURE_TIMEOUT")
            readable, _, _ = select.select([process.stdout], [], [], min(left, 1))
            if not readable:
                continue
            chunk = os.read(process.stdout.fileno(), 1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            require(size <= max_bytes, "OR58_ARCHIVE_SIZE_LIMIT")
            stream.write(chunk); digest.update(chunk)
        stream.flush(); os.fsync(stream.fileno())
    require(process.wait(timeout=max(1, deadline - time.monotonic())) == 0,
            "OR58_TAR_FAILED")
    return size, digest.hexdigest()


def capture(packet, args):
    validate_approval(packet, args)
    root = Path(packet["evidenceRoot"])
    require(not (root / "capture-attempt.json").exists(), "OR58_CAPTURE_ONE_SHOT")
    app = validate_original(packet)
    write_json(root / "capture-attempt.json", {"status": "ARMED", "appId": app["Id"],
                                               "timeUnix": time.time()})
    outage_start_mono = time.monotonic()
    outage_start_unix = time.time()
    outage_deadline = outage_start_mono + OUTAGE_BUDGET
    capture_cutoff = outage_deadline - RESTART_RESERVE
    stop_attempted = False
    error = None
    writer_zero_unix = capture_start_unix = capture_complete_unix = None
    before = None
    archive_path = root / "capture.tar"
    size = archive_sha = None
    try:
        stop_attempted = True
        docker("stop", "--time", str(STOP_BUDGET), app["Id"],
               timeout=remaining(capture_cutoff, STOP_BUDGET + 2))
        state = inspect("container", app["Id"],
                        timeout=remaining(capture_cutoff, 3))["State"]
        require(not state.get("Running") and state.get("ExitCode") != 137 and
                state.get("OOMKilled") is False,
                "OR58_GRACEFUL_STOP_UNPROVEN")
        no_running_attachment(VOLUME, deadline=capture_cutoff)
        writer_zero_unix = time.time()
        capture_deadline = min(capture_cutoff, time.monotonic() + CAPTURE_BUDGET)
        before = volume_hashes(VOLUME, nonce=packet["nonce"], root=root,
                               deadline=capture_deadline,
                               cleanup_deadline=outage_deadline - START_BUDGET)
        require(before["installation"] == packet["installation"],
                "OR58_INSTALL_IDENTITY_CHANGED")
        cid = create_helper(root, packet["nonce"], VOLUME, "capture", readonly=True,
                            command=("--entrypoint", "tar", IMAGE_ID,
                                     "-C", "/data", "-cf", "-", "."),
                            deadline=capture_deadline,
                            cleanup_deadline=outage_deadline - START_BUDGET)
        try:
            capture_start_unix = time.time()
            process = subprocess.Popen(["docker", "start", "-a", cid],
                                       stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
            try:
                size, archive_sha = bounded_stream(process, archive_path,
                                                  deadline=capture_deadline,
                                                  max_bytes=MAX_ARCHIVE)
                fsync_dir(root)
                capture_complete_unix = time.time()
            finally:
                if process.poll() is None:
                    process.kill(); process.wait(timeout=2)
        finally:
            cleanup_helper(cid, nonce=packet["nonce"], volume=VOLUME,
                           deadline=outage_deadline - START_BUDGET)
        no_running_attachment(VOLUME, deadline=capture_cutoff)
        after = volume_hashes(VOLUME, nonce=packet["nonce"], root=root,
                              deadline=capture_deadline,
                              cleanup_deadline=outage_deadline - START_BUDGET)
        require(time.monotonic() <= capture_deadline and before == after,
                "OR58_CAPTURE_EPOCH_MISMATCH")
    except BaseException as exc:
        error = exc
    finally:
        if stop_attempted:
            try:
                # Restart is mandatory even if the planned outage deadline was
                # exceeded by an uncertain Docker call. Such a run is HALT.
                current = inspect("container", app["Id"], timeout=3)
                require(current["Id"] == app["Id"], "OR58_RESTART_ID_CHANGED")
                if not current.get("State", {}).get("Running"):
                    docker("start", app["Id"], timeout=10)
                health_deadline = (outage_deadline if time.monotonic() < outage_deadline
                                   else time.monotonic() + START_BUDGET)
                wait_healthy(app["Id"], deadline=health_deadline)
                healthy_unix = time.time()
                outage_seconds = time.monotonic() - outage_start_mono
                write_json(root / "original-restart.json", {"appId": app["Id"],
                           "status": "HEALTHY", "outageStartUnix": outage_start_unix,
                           "healthyUnix": healthy_unix, "outageSeconds": outage_seconds,
                           "outageBudgetMet": outage_seconds <= OUTAGE_BUDGET,
                           "writerZeroUnix": writer_zero_unix,
                           "captureStartUnix": capture_start_unix,
                           "captureCompleteUnix": capture_complete_unix})
            except BaseException as restart_error:
                raise Blocked("OR58_ORIGINAL_RESTART_UNPROVEN") from restart_error
    if error:
        raise error
    require(outage_seconds <= OUTAGE_BUDGET, "OR58_OUTAGE_BUDGET_EXCEEDED")
    validate_original(packet)
    # Archive parsing and logical checks happen after the original is healthy.
    members = safe_tar_members(archive_path)
    archive_files = tar_file_hashes(archive_path)
    require(before["files"] == archive_files, "OR58_CAPTURE_EPOCH_MISMATCH")
    write_json(root / "capture.json", {"archiveSha256": archive_sha,
               "archiveBytes": size, "members": members,
               "fileHashes": archive_files, "writerZeroUnix": writer_zero_unix,
               "captureStartUnix": capture_start_unix,
               "captureCompleteUnix": capture_complete_unix,
               "originalHealthyUnix": healthy_unix,
               "outageSeconds": outage_seconds,
               "appId": app["Id"], "status": "CAPTURED_ORIGINAL_HEALTHY",
               "hostWriterExclusion": "ROOT_ATTESTED_NOT_INDEPENDENTLY_PROVEN"})
    return {"status": "CAPTURED_ORIGINAL_HEALTHY", "packet": str(root / "packet.json"),
            "hostWriterExclusion": "ROOT_ATTESTED_NOT_INDEPENDENTLY_PROVEN"}


def volume_exists(name):
    result = subprocess.run(["docker", "volume", "inspect", name], capture_output=True,
                            timeout=30, check=False)
    return result.returncode == 0


def feed_archive(command, archive, *, timeout=180):
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL)
    deadline = time.monotonic() + timeout
    try:
        os.set_blocking(process.stdin.fileno(), False)
        with archive.open("rb") as stream:
            while chunk := stream.read(1024 * 1024):
                offset = 0
                while offset < len(chunk):
                    left = deadline - time.monotonic()
                    require(left > 0, "OR58_RESTORE_TIMEOUT")
                    _, writable, _ = select.select([], [process.stdin], [], min(left, 1))
                    if writable:
                        try:
                            offset += os.write(process.stdin.fileno(), chunk[offset:])
                        except BrokenPipeError as exc:
                            raise Blocked("OR58_RESTORE_CHILD_EXIT") from exc
        process.stdin.close()
        require(process.wait(timeout=max(1, deadline - time.monotonic())) == 0,
                "OR58_RESTORE_TAR_FAILED")
    finally:
        if process.poll() is None:
            process.kill(); process.wait(timeout=5)


def init_empty_target(root, nonce, target):
    """No copy-up; the new volume starts empty and is assigned only to UID 10001."""
    deadline = time.monotonic() + 30
    script = ('test -z "$(find /data -mindepth 1 -print -quit)" && '
              'chown 10001:10001 /data && chmod 0700 /data && '
              'test "$(stat -c %u /data)" = 10001 && '
              'test "$(stat -c %a /data)" = 700')
    cid = create_helper(root, nonce, target, "target-init", readonly=False,
                        command=("--user", "0:0", "--entrypoint", "sh", IMAGE_ID,
                                 "-ec", script), deadline=deadline)
    try:
        docker("start", "-a", cid, timeout=remaining(deadline, 15))
    finally:
        cleanup_helper(cid, nonce=nonce, volume=target, deadline=deadline)


def assert_registered_058_schema(dbpath, manifest_path):
    """Check the disposable SQLite copy with the production 0.58 declaration."""
    node = shutil.which("node")
    require(node is not None and SCHEMA_CHECK.is_file(), "OR58_SCHEMA_CHECK_UNAVAILABLE")
    try:
        result = subprocess.run((node, "--import", "tsx", str(SCHEMA_CHECK),
                                 str(dbpath), str(manifest_path)),
                                cwd=ROOT / "src", env={"PATH": os.environ.get("PATH", "")},
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                timeout=30, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise Blocked("OR58_SCHEMA_CHECK_FAILED") from None
    require(result.returncode == 0 and result.stdout == b"OR58_SCHEMA_OK\n" and
            result.stderr == b"", "OR58_SCHEMA_CHECK_FAILED")


def sqlite_fingerprint(archive_path, *, raw_file_hashes=None):
    """Normalize WAL only in a disposable extracted copy; never touch source volume."""
    file_hashes = raw_file_hashes if raw_file_hashes is not None else tar_file_hashes(archive_path)
    with tempfile.TemporaryDirectory(prefix="or58-db-", dir=EVIDENCE) as tmp:
        os.chmod(tmp, 0o700)
        target = Path(tmp)
        with tarfile.open(archive_path, "r:") as archive:
            for member in archive:
                name = member.name.removeprefix("./")
                if name in ("db/cad.sqlite", "db/cad.sqlite-wal", "db/cad.sqlite-shm",
                            "db/g7-install.json"):
                    output = target / name
                    output.parent.mkdir(mode=0o700, exist_ok=True)
                    with output.open("xb") as dest, archive.extractfile(member) as src:
                        shutil.copyfileobj(src, dest)
                    os.chmod(output, 0o600)
        dbpath = target / "db/cad.sqlite"
        require(dbpath.is_file(), "OR58_DB_MISSING")
        connection = sqlite3.connect(dbpath)
        try:
            integrity = connection.execute("PRAGMA integrity_check").fetchall()
            require(integrity == [("ok",)], "OR58_DB_INTEGRITY_FAILED")
            require(not connection.execute("PRAGMA foreign_key_check").fetchall(),
                    "OR58_DB_FOREIGN_KEY_FAILED")
            manifest_path = target / "db/g7-install.json"
            require(manifest_path.is_file(), "OR58_INSTALL_MANIFEST_MISSING")
            require(manifest_path.stat().st_size <= 4096, "OR58_INSTALL_PAIR_MISMATCH")
            try:
                manifest = json.loads(manifest_path.read_bytes())
            except (ValueError, UnicodeDecodeError):
                raise Blocked("OR58_INSTALL_PAIR_MISMATCH") from None
            require(isinstance(manifest, dict) and
                    set(manifest) == {"appImage", "installId", "migratorImage",
                                      "schemaId", "sourceCommit", "version"} and
                    re.fullmatch(r"[0-9a-f-]{36}", str(manifest["installId"])) and
                    manifest["version"] == VERSION and
                    manifest["appImage"] == OLD_APP_REF and
                    manifest["migratorImage"] == OLD_MIGRATOR_REF and
                    manifest["sourceCommit"] == "", "OR58_INSTALL_PAIR_MISMATCH")
            assert_registered_058_schema(dbpath, manifest_path)
            schema = connection.execute("SELECT type,name,tbl_name,sql FROM sqlite_master "
                                        "ORDER BY type,name,tbl_name").fetchall()
            tables = [row[1] for row in schema if row[0] == "table" and
                      not row[1].startswith("sqlite_")]
            fingerprints = {}
            for table in tables:
                quoted = '"' + table.replace('"', '""') + '"'
                cursor = connection.execute("SELECT * FROM " + quoted)
                rows = []
                for row in cursor:
                    rows.append(canonical([{"blob": value.hex()} if isinstance(value, bytes)
                                           else value for value in row]))
                rows.sort()
                fingerprints[table] = {"count": len(rows), "sha256": sha(b"\n".join(rows))}
            required = {"CadFileVersion", "SceneAsset", "SceneOrphanJob", "CadDeletionJob"}
            require(required <= set(tables), "OR58_STORAGE_TABLE_UNKNOWN")
            cad_refs = connection.execute('SELECT id,location_id,file_format,file_size,sha256,storage_path '
                                          'FROM "CadFileVersion"').fetchall()
            for version_id, location_id, file_format, size, digest, locator in cad_refs:
                extension = str(file_format).lower()
                require(extension in ("dxf", "dwg") and
                        re.fullmatch(r"[0-9a-f-]{36}", str(version_id)) and
                        re.fullmatch(r"[0-9a-f-]{36}", str(location_id)) and
                        locator == f"{location_id}/{version_id}/original.{extension}",
                        "OR58_CAD_LOCATOR_NOT_LOCAL")
                found = file_hashes.get("cad/" + locator)
                require(found is not None and found["size"] == size and
                        found["sha256"] == digest, "OR58_CAD_REFERENCE_BYTES_MISMATCH")
            scene_refs = connection.execute('SELECT id,storage_locator,byte_length,digest '
                                            'FROM "SceneAsset"').fetchall()
            for asset_id, locator, size, digest in scene_refs:
                require(re.fullmatch(r"[0-9a-f-]{36}", str(asset_id)) and
                        locator == f"scenes/{asset_id}.json",
                        "OR58_SCENE_LOCATOR_NOT_LOCAL")
                found = file_hashes.get("cad/" + locator)
                require(found is not None and found["size"] == size and
                        found["sha256"] == digest, "OR58_SCENE_REFERENCE_BYTES_MISMATCH")
            orphan_refs = connection.execute('SELECT storage_locator FROM "SceneOrphanJob"').fetchall()
            for (locator,) in orphan_refs:
                require(isinstance(locator, str) and
                        re.fullmatch(r"scenes/[0-9a-f-]{36}\.json", locator),
                        "OR58_ORPHAN_LOCATOR_NOT_LOCAL")
            deletion_refs = connection.execute('SELECT storage_path FROM "CadDeletionJob"').fetchall()
            for (locator,) in deletion_refs:
                require(isinstance(locator, str) and
                        re.fullmatch(r"[0-9a-f-]{36}/[0-9a-f-]{36}/original\.(dxf|dwg)", locator),
                        "OR58_DELETION_LOCATOR_NOT_LOCAL")
            manifest = (target / "db/g7-install.json").read_bytes()
            return {"schemaSha256": sha(canonical(schema)), "tables": fingerprints,
                    "installSha256": sha(manifest),
                    "localReferenceCounts": {"cad": len(cad_refs), "scene": len(scene_refs),
                                             "orphan": len(orphan_refs),
                                             "deletion": len(deletion_refs)}}
        finally:
            connection.close()


def installation_from_archive(archive_path, expected_sha):
    with tarfile.open(archive_path, "r:") as archive:
        members = [member for member in archive if member.name.removeprefix("./") ==
                   "db/g7-install.json" and member.isfile()]
        require(len(members) == 1, "OR58_INSTALL_MANIFEST_AMBIGUOUS")
        raw = archive.extractfile(members[0]).read()
    require(sha(raw) == expected_sha, "OR58_INSTALL_MANIFEST_CHANGED")
    manifest = json.loads(raw)
    require(manifest.get("version") == VERSION and
            manifest.get("schemaId") == "G7-GREENFIELD-SEMANTIC-ZONES-20261101-1" and
            manifest.get("appImage") == OLD_APP_REF and
            manifest.get("migratorImage") == OLD_MIGRATOR_REF and
            manifest.get("sourceCommit") == "", "OR58_INSTALL_PAIR_MISMATCH")
    return manifest


def clone_env(original_app, installation):
    env = dict(item.split("=", 1) for item in original_app["Config"].get("Env", [])
               if "=" in item)
    require(installation.get("appImage") == OLD_APP_REF and
            installation.get("migratorImage") == OLD_MIGRATOR_REF and
            installation.get("sourceCommit") == "" and
            env.get("G7_DEPLOY_APP_IMAGE") == OLD_APP_REF and
            env.get("G7_DEPLOY_MIGRATOR_IMAGE") == OLD_MIGRATOR_REF and
            env.get("G7_RELEASE_SOURCE_COMMIT", "") == "",
            "OR58_CLONE_PAIR_MISMATCH")
    allowed = {"NODE_ENV", "DATABASE_URL", "CAD_STORAGE_PATH", "CAD_STORAGE_BACKEND",
               "G7_GREENFIELD_MODE", "G7_GREENFIELD_AUTOMATED", "G7_AUTH_ENABLED",
               "G7_RUNTIME_ALLOW_HTTP", "G7_CAD_WRITE_CUTOVER_ENABLED", "MAX_UPLOAD_SIZE_MB",
               "G7_RELEASE_SOURCE_COMMIT"}
    safe = {key: value for key, value in env.items() if key in allowed}
    safe.update(DATABASE_URL="file:/data/db/cad.sqlite", CAD_STORAGE_PATH="/data/cad",
                CAD_STORAGE_BACKEND="local", G7_RUNTIME_ORIGIN="http://127.0.0.1:3000",
                SCENE_AUTO_BUILD_ENABLED="false", LOG_STORE_ENABLED="false",
                G7_DEPLOY_APP_IMAGE=OLD_APP_REF,
                G7_DEPLOY_MIGRATOR_IMAGE=OLD_MIGRATOR_REF,
                G7_RELEASE_SOURCE_COMMIT="")
    return safe


def validate_isolated_clone(row, network_row, *, cid, name, network_name,
                            network_id, volume, nonce):
    require(row.get("Id") == cid and row.get("Name") == "/" + name and
            row.get("Image") == IMAGE_ID and row.get("State", {}).get("Running") is True and
            row.get("Config", {}).get("Labels", {}).get(OWNER_LABEL) == nonce and
            row.get("Config", {}).get("Labels", {}).get("com.planner77.purpose") ==
                "or58-restore-proof" and
            any(m.get("Type") == "volume" and m.get("Name") == volume and
                m.get("Destination") == "/data" for m in row.get("Mounts", [])),
            "OR58_CLONE_IDENTITY_INVALID")
    networks = row.get("NetworkSettings", {}).get("Networks") or {}
    require(set(networks) == {network_name} and
            networks[network_name].get("NetworkID") == network_id and
            row.get("HostConfig", {}).get("NetworkMode") == network_name and
            network_row.get("Id") == network_id and
            network_row.get("Name") == network_name and
            network_row.get("Internal") is True and
            network_row.get("Labels", {}).get(OWNER_LABEL) == nonce and
            network_row.get("Labels", {}).get("com.planner77.purpose") ==
                "or58-restore-proof", "OR58_CLONE_NETWORK_INVALID")
    bindings = row.get("HostConfig", {}).get("PortBindings")
    ports = row.get("NetworkSettings", {}).get("Ports") or {}
    require(bindings in (None, {}) and
            all(value in (None, []) for value in ports.values()),
            "OR58_CLONE_PORT_PUBLISHED")


INTERNAL_HTTP_PROBE = r'''
const routes = ['/api/health', '/api/g7-runtime/status'];
const result = {};
for (const route of routes) {
  try {
    const response = await fetch('http://127.0.0.1:3000' + route,
      {signal: AbortSignal.timeout(3000), redirect: 'manual'});
    result[route] = response.status;
    await response.body?.cancel();
  } catch {
    result[route] = 'REQUEST_FAILED';
  }
}
process.stdout.write(JSON.stringify(result) + '\n');
'''


def internal_http(cid):
    try:
        raw = docker("exec", "--user", "10001:10001", cid, "node", "--input-type=module",
                     "-e", INTERNAL_HTTP_PROBE, timeout=12)
    except Blocked as exc:
        if str(exc) == "OR58_DOCKER_TIMEOUT":
            raise Blocked("OR58_INTERNAL_HTTP_TIMEOUT") from exc
        raise
    try:
        result = json.loads(raw)
    except (ValueError, TypeError) as exc:
        raise Blocked("OR58_INTERNAL_HTTP_INVALID") from exc
    routes = {"/api/health", "/api/g7-runtime/status"}
    require(isinstance(result, dict) and set(result) == routes and
            all(type(result[route]) is int for route in routes),
            "OR58_INTERNAL_HTTP_INVALID")
    require(all(result[route] == 200 for route in routes),
            "OR58_INTERNAL_HTTP_NOT_200")
    return result


def restore(packet, args):
    require(args.approval_hash == packet["approvalHash"], "OR58_APPROVAL_MISMATCH")
    root = Path(packet["evidenceRoot"])
    capture_receipt = json.loads((root / "capture.json").read_bytes())
    restart_receipt = json.loads((root / "original-restart.json").read_bytes())
    require(capture_receipt.get("status") == "CAPTURED_ORIGINAL_HEALTHY" and
            restart_receipt.get("status") == "HEALTHY", "OR58_CAPTURE_NOT_ACCEPTABLE")
    archive = root / "capture.tar"
    require(archive.is_file() and sha(archive.read_bytes()) == capture_receipt["archiveSha256"],
            "OR58_ARCHIVE_CHANGED")
    require(tar_file_hashes(archive) == capture_receipt["fileHashes"],
            "OR58_ARCHIVE_FILES_CHANGED")
    # A local backend setting does not prove every historical reference is local.
    # This reads the immutable recovery set only; it makes no S3 calls.
    before_db = sqlite_fingerprint(archive)
    app = validate_original(packet)
    require(app["State"]["Health"]["Status"] == "healthy", "OR58_ORIGINAL_UNHEALTHY")
    nonce = packet["nonce"]
    target = "or58-" + nonce
    require(target != VOLUME and not volume_exists(target), "OR58_RESTORE_TARGET_EXISTS")
    require(not (root / "restore-attempt.json").exists(), "OR58_RESTORE_ONE_SHOT")
    write_json(root / "restore-attempt.json", {"status": "ARMED", "target": target,
                                               "timeUnix": time.time()})
    docker("volume", "create", "--label", PURPOSE_LABEL, "--label",
           f"{OWNER_LABEL}={nonce}", target)
    volume = inspect("volume", target)
    require(volume.get("Name") == target and volume.get("Labels", {}).get(OWNER_LABEL) == nonce,
            "OR58_TARGET_OWNERSHIP_INVALID")
    require(not attached(target), "OR58_TARGET_NOT_EMPTY")
    init_empty_target(root, nonce, target)
    deadline = time.monotonic() + 180
    cid = create_helper(root, nonce, target, "restore", readonly=False,
                        command=("--user", "10001:10001", "--entrypoint", "tar", IMAGE_ID,
                                 "-C", "/data", "--no-same-owner", "-xf", "-"),
                        deadline=deadline)
    try:
        feed_archive(["docker", "start", "-ai", cid], archive,
                     timeout=remaining(deadline, 170))
    finally:
        cleanup_helper(cid, nonce=nonce, volume=target, deadline=deadline)
    restored_inventory = volume_hashes(target, nonce=nonce, root=root,
                                       deadline=time.monotonic() + 90)
    restored_files = restored_inventory["files"]
    require(restored_files == capture_receipt["fileHashes"] and
            restored_inventory["installation"] == packet["installation"],
            "OR58_RESTORE_RAW_MISMATCH")
    # Raw equality establishes identical DB/WAL/SHM input. A second disposable copy
    # is taken from the restored volume to check logical state independently.
    restored_archive = root / "restored-db.tar"
    deadline = time.monotonic() + 90
    cid = create_helper(root, nonce, target, "db-snapshot", readonly=True,
                        command=("--entrypoint", "tar", IMAGE_ID, "-C", "/data", "-cf", "-", "db"),
                        deadline=deadline)
    try:
        process = subprocess.Popen(["docker", "start", "-a", cid],
                                   stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        try:
            bounded_stream(process, restored_archive, deadline=deadline,
                           max_bytes=MAX_ARCHIVE)
        finally:
            if process.poll() is None:
                process.kill(); process.wait(timeout=2)
    finally:
        cleanup_helper(cid, nonce=nonce, volume=target, deadline=deadline)
    after_db = sqlite_fingerprint(restored_archive, raw_file_hashes=restored_files)
    require(before_db == after_db, "OR58_RESTORE_LOGICAL_MISMATCH")
    write_json(root / "restore.json", {"status": "RAW_AND_LOGICAL_MATCH", "target": target,
               "fileCount": len(restored_files), "tableCount": len(after_db["tables"]),
               "schemaSha256": after_db["schemaSha256"], "timeUnix": time.time()})
    return {"status": "RAW_AND_LOGICAL_MATCH", "target": target,
            "startup": "NOT_RUN", "http": "NOT_RUN"}


def startup(packet, args):
    require(args.approval_hash == packet["approvalHash"], "OR58_APPROVAL_MISMATCH")
    root = Path(packet["evidenceRoot"])
    restore_receipt = json.loads((root / "restore.json").read_bytes())
    target = "or58-" + packet["nonce"]
    require(restore_receipt.get("status") == "RAW_AND_LOGICAL_MATCH" and
            restore_receipt.get("target") == target, "OR58_RESTORE_NOT_ACCEPTABLE")
    require(not (root / "startup-attempt.json").exists(), "OR58_STARTUP_ONE_SHOT")
    app = validate_original(packet)
    require(app["State"]["Health"]["Status"] == "healthy", "OR58_ORIGINAL_UNHEALTHY")
    volume = inspect("volume", target)
    require(volume.get("Labels", {}).get(OWNER_LABEL) == packet["nonce"],
            "OR58_TARGET_OWNERSHIP_INVALID")
    network = target + "-net"
    clone = target + "-app"
    require(not attached(target), "OR58_RESTORE_VOLUME_ATTACHED")
    write_json(root / "startup-attempt.json", {"status": "ARMED", "clone": clone,
                                               "network": network, "timeUnix": time.time()})
    network_id = docker("network", "create", "--internal", "--label", PURPOSE_LABEL,
                        "--label", f"{OWNER_LABEL}={packet['nonce']}", network).decode().strip()
    require(re.fullmatch(r"[0-9a-f]{64}", network_id), "OR58_NETWORK_ID_INVALID")
    write_json(root / "startup-network.json", {"id": network_id, "name": network,
               "nonce": packet["nonce"], "timeUnix": time.time()})
    installation = installation_from_archive(root / "capture.tar",
                                               packet["installation"]["manifestSha256"])
    env = clone_env(app, installation)
    cidfile = root / "startup-clone.cid"
    write_json(root / "startup-clone-intent.json", {"name": clone,
               "networkId": network_id, "volume": target, "cidfile": str(cidfile)})
    command = ["run", "-d", "--name", clone, "--cidfile", str(cidfile),
               "--network", network,
               "--mount", f"type=volume,source={target},target=/data", "--label", PURPOSE_LABEL,
               "--label", f"{OWNER_LABEL}={packet['nonce']}",
               "--cap-drop", "ALL", "--security-opt", "no-new-privileges"]
    for key, value in sorted(env.items()):
        command += ["--env", key + "=" + value]
    command += [IMAGE_ID]
    cid = docker(*command, timeout=30).decode().strip()
    require(re.fullmatch(r"[0-9a-f]{64}", cid) and cidfile.read_text().strip() == cid,
            "OR58_CLONE_CIDFILE_MISMATCH")
    write_json(root / "startup-clone.json", {"id": cid, "name": clone,
               "networkId": network_id, "volume": target, "nonce": packet["nonce"]})
    wait_healthy(cid)
    row = inspect("container", cid)
    network_row = inspect("network", network_id)
    validate_isolated_clone(row, network_row, cid=cid, name=clone,
                            network_name=network, network_id=network_id,
                            volume=target, nonce=packet["nonce"])
    # Fixed, credential-free GETs run inside the exact clone namespace only.
    http = internal_http(cid)
    write_json(root / "startup.json", {"status": "EXACT_IMAGE_HEALTHY", "cloneId": cid,
               "clone": clone, "network": network, "volume": target,
               "internalHttpStatus": http, "businessReader": "NOT_RUN",
               "sourceCurrentReady": "NOT_RUN", "postStartupDbIntegrity": "NOT_RUN",
               "timeUnix": time.time()})
    return {"status": "EXACT_IMAGE_HEALTHY", "clone": clone,
            "internalHttpStatus": http, "authenticatedReader": "NOT_RUN",
            "sourceCurrentReady": "NOT_RUN", "postStartupDbIntegrity": "NOT_RUN"}


def cleanup(packet, args):
    require(args.approval_hash == packet["approvalHash"], "OR58_APPROVAL_MISMATCH")
    root = Path(packet["evidenceRoot"])
    nonce = packet["nonce"]
    target = "or58-" + nonce
    network_path = root / "startup-network.json"
    network_receipt = None
    if network_path.is_file():
        try:
            network_receipt = json.loads(network_path.read_bytes())
        except (OSError, json.JSONDecodeError):
            # A failed fsync/write can leave an incomplete receipt. Only the
            # durable pre-create intent may authorize a narrow name lookup.
            network_receipt = None
    recovered_from_intent = network_receipt is None
    if recovered_from_intent:
        attempt = json.loads((root / "startup-attempt.json").read_bytes())
        require(attempt.get("status") == "ARMED" and
                attempt.get("network") == target + "-net" and
                attempt.get("clone") == target + "-app",
                "OR58_CLEANUP_INTENT_INVALID")
        observed = inspect("network", target + "-net")
        require(observed.get("Name") == target + "-net" and
                re.fullmatch(r"[0-9a-f]{64}", str(observed.get("Id", ""))) and
                observed.get("Labels", {}).get(OWNER_LABEL) == nonce and
                observed.get("Labels", {}).get("com.planner77.purpose") ==
                    "or58-restore-proof" and
                observed.get("Internal") is True and
                not observed.get("Containers"),
                "OR58_CLEANUP_NETWORK_FOREIGN")
        network_receipt = {"id": observed["Id"], "name": target + "-net", "nonce": nonce}
        recovery_path = root / "startup-network-recovered.json"
        if recovery_path.is_file():
            require(json.loads(recovery_path.read_bytes()) == network_receipt,
                    "OR58_CLEANUP_RECOVERY_CONFLICT")
        else:
            write_json(recovery_path, network_receipt)
    require(network_receipt.get("name") == target + "-net" and
            network_receipt.get("nonce") == nonce and
            re.fullmatch(r"[0-9a-f]{64}", str(network_receipt.get("id", ""))),
            "OR58_CLEANUP_RECEIPT_INVALID")
    network = inspect("network", network_receipt["id"])
    require(network.get("Id") == network_receipt["id"] and
            network.get("Name") == network_receipt["name"] and
            network.get("Labels", {}).get(OWNER_LABEL) == nonce and
            network.get("Labels", {}).get("com.planner77.purpose") ==
                "or58-restore-proof" and
            network.get("Internal") is True,
            "OR58_CLEANUP_NETWORK_FOREIGN")
    clone_id = None
    clone_receipt = root / "startup-clone.json"
    cidfile = root / "startup-clone.cid"
    if clone_receipt.is_file():
        item = json.loads(clone_receipt.read_bytes())
        require(item.get("name") == target + "-app" and item.get("nonce") == nonce and
                item.get("networkId") == network_receipt["id"] and
                item.get("volume") == target, "OR58_CLEANUP_CLONE_JOURNAL_INVALID")
        clone_id = item.get("id")
    if cidfile.is_file():
        from_file = cidfile.read_text().strip()
        require(re.fullmatch(r"[0-9a-f]{64}", from_file) and
                (clone_id is None or clone_id == from_file),
                "OR58_CLEANUP_CIDFILE_MISMATCH")
        clone_id = from_file
    if clone_id is not None:
        clone = inspect("container", clone_id)
        require(clone.get("Id") == clone_id and clone.get("Name") == "/" + target + "-app" and
                clone.get("Image") == IMAGE_ID and
                clone.get("Config", {}).get("Labels", {}).get(OWNER_LABEL) == nonce and
                clone.get("Config", {}).get("Labels", {}).get("com.planner77.purpose") ==
                    "or58-restore-proof" and
                any(m.get("Name") == target and m.get("Destination") == "/data"
                    for m in clone.get("Mounts", [])) and
                network_receipt["name"] in clone.get("NetworkSettings", {}).get("Networks", {}),
                "OR58_CLEANUP_CLONE_FOREIGN")
        require(set(network.get("Containers") or {}) <= {clone_id},
                "OR58_CLEANUP_NETWORK_HAS_FOREIGN")
        if clone.get("State", {}).get("Running"):
            docker("stop", "--time", "10", clone_id, timeout=20)
            stopped = inspect("container", clone_id)
            require(stopped["Id"] == clone_id and
                    stopped.get("State", {}).get("Running") is False and
                    stopped.get("State", {}).get("ExitCode") != 137,
                    "OR58_CLONE_GRACEFUL_STOP_UNPROVEN")
        docker("rm", clone_id)
    else:
        require(not network.get("Containers"), "OR58_CLEANUP_NETWORK_HAS_UNKNOWN_CLONE")
    final_network = inspect("network", network_receipt["id"])
    require(final_network.get("Id") == network_receipt["id"] and
            final_network.get("Labels", {}).get(OWNER_LABEL) == nonce and
            not final_network.get("Containers"), "OR58_CLEANUP_NETWORK_CHANGED")
    docker("network", "rm", network_receipt["id"])
    # Preserve backup and restored volume for independent QA. No global prune.
    return {"status": "OWNED_CLONE_REMOVED", "backup": "PRESERVED", "restoreVolume": target}


def main(argv=None):
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", nargs="?", choices=("plan", "capture", "restore", "startup", "cleanup"), default="plan")
    parser.add_argument("--packet", type=Path)
    parser.add_argument("--inventory", type=Path,
                        help="private Root read-only inventory; avoids a plan-phase mount")
    parser.add_argument("--approval-hash")
    parser.add_argument("--maintenance-authorization")
    parser.add_argument("--root-authorization-file", type=Path)
    parser.add_argument("--host-writer-attestation")
    args = parser.parse_args(argv)
    try:
        actions = {"plan": lambda: plan(args.inventory),
                   "capture": lambda: capture(load_packet(args.packet), args),
                   "restore": lambda: restore(load_packet(args.packet), args),
                   "startup": lambda: startup(load_packet(args.packet), args),
                   "cleanup": lambda: cleanup(load_packet(args.packet), args)}
        result = actions[args.action]()
        print(json.dumps(result, sort_keys=True))
    except Exception as exc:
        print(json.dumps({"status": "HALT", "code": str(exc) if isinstance(exc, Blocked)
                          else "OR58_INTERNAL_ERROR"}), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
