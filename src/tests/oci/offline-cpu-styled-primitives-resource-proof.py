#!/usr/bin/env python3
"""Owned synthetic FUP3 Node resource and real 120-second watchdog proof.

No app startup, volume, socket mount, ports, production/env or real CAD input.
Only pinned existing Node image + read-only test source + private tmpfs.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import time

IMAGE = "sha256:6abdef1ede21fd9a84a41d3c49621a9657ac0a10a23057f7f7b3f27515b62a50"
PURPOSE = "fup3-offline-primitives-proof"
DEADLINE_SECONDS = 120
SOURCE_NAMES = ["offline-cpu-styled-primitives.mjs", "offline-cpu-styled-primitives-dto.mjs",
                "offline-cpu-styled-primitives-proof-fixtures.mjs", "offline-cpu-styled-primitives-resource-child.mjs"]


def require(value, code):
    if not value:
        raise ValueError(code)


def write(root, name, value):
    temporary = root / ("." + name + "." + secrets.token_hex(8))
    try:
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "w") as stream:
            json.dump(value, stream, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, root / name)
        fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    finally:
        temporary.unlink(missing_ok=True)


def docker(*args, timeout=20):
    result = subprocess.run(["docker", *args], capture_output=True, timeout=timeout)
    require(result.returncode == 0, "RESOURCE_DOCKER_FAILED")
    return result.stdout


def inspect(cid):
    return json.loads(docker("inspect", cid))[0]


def check(row, *, cid, nonce, source, mode):
    labels = row["Config"].get("Labels") or {}
    host = row["HostConfig"]
    mounts = row["Mounts"]
    binds = [mount for mount in mounts if mount["Type"] == "bind"]
    other_mounts = [mount for mount in mounts if mount["Type"] != "bind"]
    require(row["Id"] == cid and row["Name"] == "/fup3-" + nonce + "-" + mode and row["Image"] == IMAGE and
            labels.get("com.planner77.purpose") == PURPOSE and
            labels.get("com.planner77.fup3.nonce") == nonce and
            row["Config"]["User"] == "10001:10001" and
            row["Config"]["Entrypoint"] == ["node"] and
            row["Config"]["Cmd"] == ["/proof/offline-cpu-styled-primitives-resource-child.mjs", mode] and
            host["NetworkMode"] == "none" and not host.get("PortBindings") and
            host["ReadonlyRootfs"] is True and host["Memory"] == 768 * 1024 * 1024 and
            host["MemorySwap"] == host["Memory"] and host["NanoCpus"] == 1_000_000_000 and
            host["PidsLimit"] == 64 and
            host["Privileged"] is False and host["PidMode"] != "host" and
            not host.get("Devices") and not host.get("DeviceRequests") and
            host.get("CapDrop") == ["ALL"] and
            "no-new-privileges" in host.get("SecurityOpt", []) and
            host.get("Tmpfs") == {"/tmp": "rw,noexec,nosuid,size=96m,mode=1777",
                                  "/data": "ro,noexec,nosuid,size=1m,mode=0555"} and
            len(binds) == 1 and binds[0]["Source"] == str(source) and
            binds[0]["Destination"] == "/proof" and binds[0]["RW"] is False and
            all(m["Type"] == "tmpfs" and m["Destination"] in {"/tmp", "/data"} for m in other_mounts),
            "RESOURCE_BOUNDARY_MISMATCH")


def parse_receipt(raw, expected_hashes, mode):
    require(len(raw) < 8192, "RESOURCE_OUTPUT_BOUND")
    lines = [line for line in raw.decode("utf-8", errors="strict").splitlines()
             if line.startswith("OFFLINE_RESOURCE_RECEIPT:")]
    require(len(lines) == 1, "RESOURCE_RECEIPT_COUNT")
    value = json.loads(lines[0].split(":", 1)[1])
    require(set(value) == {"mode", "state", "builder", "primitiveCount", "segmentCount", "visiblePrimitiveCount",
                           "payloadSha256", "payloadBytes", "readback", "tempClean", "sourceHashes"} and
            value["mode"] == mode and value["state"] == "CANDIDATE" and
            value["builder"] == "node-cpu-styled-primitives@0.1.0+cad-scene-1" and
            value["primitiveCount"] == 6 and value["visiblePrimitiveCount"] == 3 and
            type(value["segmentCount"]) is int and value["segmentCount"] == 57 and
            type(value["payloadBytes"]) is int and
            0 < value["payloadBytes"] <= 32 * 1024 * 1024 and
            isinstance(value["payloadSha256"], str) and
            re.fullmatch(r"[a-f0-9]{64}", value["payloadSha256"]) and value["readback"] is True and
            value["tempClean"] is True and value["sourceHashes"] == expected_hashes,
            "RESOURCE_RECEIPT_INVALID")
    return value


def accept_termination(mode, *, deadline_hit, elapsed, returncode, exit_code, output):
    if mode == "normal":
        require(not deadline_hit and returncode == 0 and exit_code == 0,
                "RESOURCE_NORMAL_FAILED")
        return True
    require(mode == "stall" and deadline_hit and elapsed >= DEADLINE_SECONDS and
            exit_code == 137 and b"OFFLINE_RESOURCE_STALL_ARMED" in output,
            "RESOURCE_WATCHDOG_NOT_PROVEN")
    return False


def run(root, mode):
    source = Path(__file__).resolve().parent
    nonce = secrets.token_hex(16)
    name = "fup3-" + nonce + "-" + mode
    expected = {name: hashlib.sha256((source / name).read_bytes()).hexdigest() for name in SOURCE_NAMES}
    require(not (root / (mode + ".json")).exists() and
            not (root / (mode + "-intent.json")).exists(), "RESOURCE_ONE_SHOT")
    cidfile = root / (mode + ".cid")
    command = ["create", "--name", name, "--cidfile", str(cidfile),
               "--label", "com.planner77.purpose=" + PURPOSE,
               "--label", "com.planner77.fup3.nonce=" + nonce,
               "--network", "none", "--user", "10001:10001", "--read-only",
               "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
               "--cpus", "1", "--memory", "768m", "--memory-swap", "768m", "--pids-limit", "64",
               "--tmpfs", "/tmp:rw,noexec,nosuid,size=96m,mode=1777",
               "--tmpfs", "/data:ro,noexec,nosuid,size=1m,mode=0555",
               "--mount", "type=bind,source=" + str(source) + ",target=/proof,readonly",
               "--entrypoint", "node", IMAGE, "/proof/offline-cpu-styled-primitives-resource-child.mjs", mode]
    intent = {"name": name, "nonce": nonce, "image": IMAGE, "mode": mode, "sourceHashes": expected}
    write(root, mode + "-intent.json", intent)
    cid = None
    process = None
    output = None
    errors = None
    started = time.monotonic()
    result = None
    try:
        cid = docker(*command).decode().strip()
        require(re.fullmatch(r"[a-f0-9]{64}", cid) and cid == cidfile.read_text().strip(), "RESOURCE_CIDFILE")
        check(inspect(cid), cid=cid, nonce=nonce, source=source, mode=mode)
        started = time.monotonic()
        output_path, error_path = root / (mode + "-stdout.log"), root / (mode + "-stderr.log")
        output = output_path.open("xb")
        errors = error_path.open("xb")
        process = subprocess.Popen(["docker", "start", "-a", cid], stdout=output, stderr=errors)
        deadline_hit = False
        while process.poll() is None:
            require(output_path.stat().st_size < 8192 and error_path.stat().st_size < 8192,
                    "RESOURCE_OUTPUT_BOUND")
            if time.monotonic() - started >= DEADLINE_SECONDS:
                deadline_hit = True
                check(inspect(cid), cid=cid, nonce=nonce, source=source, mode=mode)
                docker("kill", "--signal", "KILL", cid)
                process.wait(timeout=10)
                break
            time.sleep(0.05)
        require(output_path.stat().st_size < 8192 and error_path.stat().st_size < 8192,
                "RESOURCE_OUTPUT_BOUND")
        out, err = output_path.read_bytes(), error_path.read_bytes()
        elapsed = time.monotonic() - started
        row = inspect(cid)
        check(row, cid=cid, nonce=nonce, source=source, mode=mode)
        require(not row["State"]["Running"] and not row["State"]["OOMKilled"], "RESOURCE_FINAL_STATE")
        receipt = parse_receipt(out, expected, mode)
        require(not err, "RESOURCE_STDERR")
        candidate_accepted = accept_termination(mode, deadline_hit=deadline_hit,
                                                elapsed=elapsed, returncode=process.returncode,
                                                exit_code=row["State"]["ExitCode"], output=out)
        result = {"mode": mode, "passed": True, "deadlineSeconds": DEADLINE_SECONDS,
                  "elapsedSeconds": round(elapsed, 3), "deadlineHit": deadline_hit,
                  "candidateAccepted": candidate_accepted, "partialReceiptRejected": mode == "stall",
                  "exitCode": row["State"]["ExitCode"], "oomKilled": False,
                  "receipt": receipt, "containerId": cid, "nonce": nonce}
    finally:
        if process is not None and process.poll() is None:
            process.kill()
            process.wait(timeout=5)
        for stream in [output, errors]:
            if stream:
                stream.close()
        # Recover a daemon-created container even if the create response was lost.
        if cid is None and cidfile.exists():
            cid = cidfile.read_text().strip()
        if cid is None:
            # Durable intent + two fresh labels recover an uncertain create even
            # when the CLI never managed to write its cidfile.
            matches = docker("ps", "-aq", "--no-trunc", "--filter",
                             "label=com.planner77.fup3.nonce=" + nonce, "--filter",
                             "label=com.planner77.purpose=" + PURPOSE).decode().splitlines()
            require(len(matches) <= 1, "RESOURCE_RECOVERY_AMBIGUOUS")
            if matches:
                cid = matches[0]
        if cid:
            require(re.fullmatch(r"[a-f0-9]{64}", cid), "RESOURCE_RECOVERED_CID")
            row = inspect(cid)
            check(row, cid=cid, nonce=nonce, source=source, mode=mode)
            if row["State"]["Running"]:
                docker("kill", "--signal", "KILL", cid)
            docker("rm", cid)
            require(not docker("ps", "-aq", "--no-trunc", "--filter", "name=^/" + name + "$"),
                    "RESOURCE_CLEANUP_FAILED")
    require(result is not None, "RESOURCE_NO_ACCEPTANCE")
    result["ownedContainerRemoved"] = True
    write(root, mode + ".json", result)
    return {key: result[key] for key in ["mode", "passed", "elapsedSeconds", "deadlineHit",
                                        "candidateAccepted", "partialReceiptRejected", "ownedContainerRemoved"]}


if __name__ == "__main__":
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["normal", "stall"])
    parser.add_argument("--evidence", required=True)
    args = parser.parse_args()
    root = Path(args.evidence).absolute()
    try:
        require(root.is_dir() and root.resolve() == root and root.stat().st_uid == os.getuid() and
                root.stat().st_mode & 0o077 == 0, "RESOURCE_PRIVATE_ROOT")
        print(json.dumps(run(root, args.mode)))
    except (ValueError, OSError, KeyError, TypeError, subprocess.TimeoutExpired):
        print(json.dumps({"status": "HALT", "mode": args.mode}))
        raise SystemExit(1)
