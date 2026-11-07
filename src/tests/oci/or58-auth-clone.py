#!/usr/bin/env python3
"""FUP1 fresh old-release restore and normal user-auth test transport.

Uses the prior bounded OR58 helpers, never captures/stops production. All
receipts are private. No session extraction, account changes or HTTP logging.
"""
import argparse
import asyncio
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import time


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


proof = module("or58_proof", "or58-proof.py")
socks = module("clone_socks", "clone-socks.py")
PURPOSE = "or58-restore-proof"
EXPECTED_ARCHIVE = "625e6b36e2bcb9c94e5e1d7bba735c7f26323ee963f212b58121f5d6a5ef1057"


def write(root, name, value):
    path = root / name
    temp = root / ("." + name + "." + secrets.token_hex(8))
    try:
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "w") as stream:
            json.dump(value, stream, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
        directory = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        temp.unlink(missing_ok=True)


def private_root(value):
    path = Path(value).absolute()
    proof.require(path.is_dir() and path.resolve() == path and
                  path.stat().st_uid == os.getuid() and path.stat().st_mode & 0o077 == 0,
                  "FUP1_PRIVATE_ROOT")
    return path


def owned_volume(state):
    name = state["volume"]
    proof.require(name == "or58-" + state["nonce"] and
                  re.fullmatch(r"[a-f0-9]{32}", state["nonce"]), "FUP1_VOLUME_NAME")
    row = proof.inspect("volume", name, timeout=4)
    labels = row.get("Labels") or {}
    proof.require(labels.get(proof.OWNER_LABEL) == state["nonce"] and
                  labels.get("com.planner77.purpose") == PURPOSE and
                  labels.get("com.planner77.fup1") == "auth-clone", "FUP1_VOLUME_OWNER")
    return row


def validate(state, *, health=True):
    owned_volume(state)
    row = proof.inspect("container", state["cid"], timeout=4)
    network = proof.inspect("network", state["networkId"], timeout=4)
    proof.validate_isolated_clone(row, network, cid=state["cid"], name=state["name"],
                                 network_name=state["network"], network_id=state["networkId"],
                                 volume=state["volume"], nonce=state["nonce"])
    proof.require(set(network.get("Containers") or {}) == {state["cid"]},
                  "FUP1_NETWORK_ATTACHMENT")
    ip = row["NetworkSettings"]["Networks"][state["network"]]["IPAddress"]
    proof.require(ip == state["ip"], "FUP1_UPSTREAM_CHANGED")
    if health:
        proof.require(row["State"].get("Health", {}).get("Status") == "healthy",
                      "FUP1_CLONE_UNHEALTHY")
    return row


def prepare(root, archive):
    proof.require(not (root / "state.json").exists(), "FUP1_ONE_SHOT")
    archive = Path(archive).absolute()
    proof.require(archive.is_file() and not archive.is_symlink() and
                  archive.stat().st_size <= proof.MAX_ARCHIVE and
                  hashlib.sha256(archive.read_bytes()).hexdigest() == EXPECTED_ARCHIVE,
                  "FUP1_ARCHIVE_MISMATCH")
    proof.safe_tar_members(archive)
    original, _ = proof.original()
    proof.require(original["State"]["Health"]["Status"] == "healthy",
                  "FUP1_ORIGINAL_UNHEALTHY")
    installation = proof.installation_from_archive(
        archive, "f6af12c119fe8c9e953eb42eccf55eb0293c3f8b5b43f2f5d115d73b558af2b2")
    env = proof.clone_env(original, installation)
    # Only the previously proven host-owned Greenfield mode is allowed here.
    proof.require(env.get("G7_GREENFIELD_MODE") == "true" and
                  env.get("G7_GREENFIELD_AUTOMATED") == "true" and
                  env.get("G7_AUTH_ENABLED") == "true", "FUP1_UNSUPPORTED_AUTH_MODE")
    nonce = secrets.token_hex(16)
    name = "or58-" + nonce
    state = {"nonce": nonce, "volume": name, "name": name + "-app",
             "network": name + "-net", "archiveSha256": EXPECTED_ARCHIVE,
             "archive": str(archive), "createdUnix": time.time(), "stage": "INTENT"}
    write(root, "state.json", state)
    proof.require(not proof.volume_exists(name), "FUP1_VOLUME_EXISTS")
    proof.docker("volume", "create", "--label", proof.PURPOSE_LABEL,
                 "--label", f"{proof.OWNER_LABEL}={nonce}", "--label",
                 "com.planner77.fup1=auth-clone", name)
    owned_volume(state)
    proof.require(not proof.attached(name), "FUP1_VOLUME_ATTACHED")
    proof.init_empty_target(root, nonce, name)
    deadline = time.monotonic() + 180
    helper = proof.create_helper(root, nonce, name, "restore", readonly=False,
                                 command=("--user", "10001:10001", "--entrypoint", "tar",
                                          proof.IMAGE_ID, "-C", "/data", "--no-same-owner", "-xf", "-"),
                                 deadline=deadline)
    try:
        proof.feed_archive(["docker", "start", "-ai", helper], archive)
    finally:
        proof.cleanup_helper(helper, nonce=nonce, volume=name,
                             deadline=time.monotonic() + 30)
    restored = proof.volume_hashes(name, nonce=nonce, root=root,
                                   deadline=time.monotonic() + 90)
    proof.require(restored["files"] == proof.tar_file_hashes(archive), "FUP1_RAW_RESTORE_MISMATCH")
    write(root, "raw-restore.json", {"fileCount": len(restored["files"]), "rawEqual": True,
                                    "archiveSha256": EXPECTED_ARCHIVE})
    # The durable names precede creation, allowing bounded owned cleanup after errors.
    state["stage"] = "RESTORED"
    write(root, "state.json", state)
    state["networkId"] = proof.docker("network", "create", "--internal", "--label",
                                       proof.PURPOSE_LABEL, "--label", f"{proof.OWNER_LABEL}={nonce}",
                                       state["network"]).decode().strip()
    write(root, "state.json", state)
    cidfile = root / "clone.cid"
    command = ["create", "--name", state["name"], "--cidfile", str(cidfile),
               "--network", state["network"], "--mount", f"type=volume,source={name},target=/data",
               "--label", proof.PURPOSE_LABEL, "--label", f"{proof.OWNER_LABEL}={nonce}",
               "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
               "--memory", "768m", "--cpus", "1", "--pids-limit", "128"]
    for key, value in sorted(env.items()):
        command += ["--env", key + "=" + value]
    command.append(proof.IMAGE_ID)
    state["cid"] = proof.docker(*command).decode().strip()
    proof.require(cidfile.read_text().strip() == state["cid"], "FUP1_CIDFILE")
    write(root, "state.json", state)
    proof.docker("start", state["cid"])
    proof.wait_healthy(state["cid"])
    row = proof.inspect("container", state["cid"])
    state["ip"] = row["NetworkSettings"]["Networks"][state["network"]]["IPAddress"]
    state["stage"] = "HEALTHY"
    write(root, "state.json", state)
    validate(state)
    return {"healthy": True, "rawFilesMatch": True, "publishedPorts": 0,
            "auth": "PENDING_USER_NORMAL_LOGIN"}


def cleanup(root, state):
    # A bridge must be stopped before this action; no process killing by a stale PID.
    owned_volume(state)
    rows = proof.attached(state["volume"])
    proof.require(len(rows) <= 1, "FUP1_UNKNOWN_ATTACHMENTS")
    for row in rows:
        proof.require(row.get("Name") == "/" + state["name"] and
                      row.get("Image") == proof.IMAGE_ID and
                      row.get("Config", {}).get("Labels", {}).get(proof.OWNER_LABEL) == state["nonce"],
                      "FUP1_CLEANUP_CLONE_IDENTITY")
        if state.get("cid"):
            proof.require(row["Id"] == state["cid"], "FUP1_CLEANUP_CID")
        if row["State"]["Running"]:
            proof.docker("stop", "--time", "15", row["Id"])
        proof.docker("rm", row["Id"])
    # Network may have been created before its receipt was written.
    matches = proof.docker("network", "ls", "--no-trunc", "--filter",
                           "name=^" + state["network"] + "$", "--format", "{{.ID}}", timeout=4).decode().splitlines()
    proof.require(len(matches) <= 1, "FUP1_CLEANUP_NETWORK_AMBIGUOUS")
    if matches:
        network = proof.inspect("network", matches[0], timeout=4)
        proof.require(network["Name"] == state["network"] and
                      (not state.get("networkId") or network["Id"] == state["networkId"]) and
                      network["Internal"] is True and not network.get("Containers") and
                      network.get("Labels", {}).get(proof.OWNER_LABEL) == state["nonce"] and
                      network.get("Labels", {}).get("com.planner77.purpose") == PURPOSE,
                      "FUP1_CLEANUP_NETWORK")
        proof.docker("network", "rm", network["Id"])
    state["stage"] = "DETACHED_RETAINED"
    write(root, "state.json", state)
    return {"cloneRemoved": True, "networkRemoved": True, "newRestoreVolumeRetained": True}


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["prepare", "status", "bridge", "cleanup"])
    parser.add_argument("--evidence", required=True)
    parser.add_argument("--archive")
    args = parser.parse_args()
    root = private_root(args.evidence)
    if args.action == "prepare":
        result = prepare(root, args.archive)
    else:
        state = json.loads((root / "state.json").read_bytes())
        if args.action == "cleanup":
            result = cleanup(root, state)
        else:
            validate(state)
            if args.action == "status":
                result = {"healthy": True, "exactCloneRoute": True, "hostPublishedPorts": 0}
            else:
                def ready(port):
                    write(root, "bridge.json", {"pid": os.getpid(), "port": port,
                                               "bind": "127.0.0.1", "cloneId": state["cid"],
                                               "networkId": state["networkId"], "upstreamIp": state["ip"],
                                               "onlyBrowserDestination": "127.0.0.1:3000"})
                    print(json.dumps({"bridgeReady": True}), flush=True)
                def identity():
                    try:
                        validate(state)
                    except Exception:
                        raise ValueError("FUP1_ROUTE_IDENTITY_CHANGED") from None
                asyncio.run(socks.serve(state["ip"], identity, ready))
                result = {"bridgeClosed": True}
    print(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except (proof.Blocked, ValueError, OSError, KeyError, TypeError):
        # No command arguments, env, parser strings, or authority values in output.
        print(json.dumps({"status": "HALT", "action": "inspect_private_receipts"}))
        raise SystemExit(1)
