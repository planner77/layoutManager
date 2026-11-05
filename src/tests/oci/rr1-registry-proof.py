#!/usr/bin/env python3
"""RR1: disposable registry roundtrip for three clean-source OCI roles.

This test never contacts GHCR. Its JSON receipt is an unsigned local build and
distribution observation, not a provenance attestation or release approval.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[3]
ROLES = ("app", "migrator", "cpu-worker")
SOURCE = "https://github.com/planner77/layoutManager"
PURPOSE = "rr1-disposable-registry-proof"
REGISTRY_REF = "registry@sha256:a3d8aaa63ed8681a604f1dea0aa03f100d5895b6a58ace528858a7b332415373"
DIGEST = re.compile(r"sha256:[0-9a-f]{64}\Z")
MANIFEST_ACCEPT = ", ".join((
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.docker.distribution.manifest.v2+json",
))


class ProofError(Exception):
    pass


def require(condition, code):
    if not condition:
        raise ProofError(code)


def command(args, *, timeout=600):
    try:
        result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True,
                                timeout=timeout, check=False)
    except subprocess.TimeoutExpired as error:
        raise ProofError("RR1_COMMAND_TIMEOUT") from error
    require(result.returncode == 0, "RR1_COMMAND_FAILED")
    return result.stdout.strip()


def docker_json(*args):
    rows = json.loads(command(["docker", *args], timeout=30))
    require(isinstance(rows, list) and len(rows) == 1, "RR1_DOCKER_INSPECT_INVALID")
    return rows[0]


def sha_bytes(data):
    return "sha256:" + hashlib.sha256(data).hexdigest()


def git_value(*args):
    return command(["git", *args], timeout=20)


def check_build_receipt(filename):
    receipt = json.loads(Path(filename).read_text())
    sha = receipt.get("sourceCommit")
    tree = receipt.get("sourceTree")
    version = receipt.get("version")
    require(isinstance(sha, str) and re.fullmatch(r"[0-9a-f]{40}", sha),
            "RR1_SOURCE_COMMIT_INVALID")
    require(git_value("rev-parse", "HEAD") == sha and
            git_value("rev-parse", "HEAD^{tree}") == tree and
            git_value("cat-file", "-t", sha) == "commit", "RR1_SOURCE_TREE_MISMATCH")
    require(version == json.loads((ROOT / "src/package.json").read_text())["version"],
            "RR1_VERSION_MISMATCH")
    archive = Path(receipt.get("sourceArchive", ""))
    archive_sha = receipt.get("sourceArchiveSha256")
    require(archive.is_file() and isinstance(archive_sha, str) and
            re.fullmatch(r"[0-9a-f]{64}", archive_sha),
            "RR1_SOURCE_ARCHIVE_MISSING")
    require(hashlib.sha256(archive.read_bytes()).hexdigest() == archive_sha,
            "RR1_SOURCE_ARCHIVE_CHANGED")
    # git archive of the fixed commit is reproducible; compare its bytes to
    # the exact build input rather than trusting a label or filename.
    regenerated = subprocess.run(["git", "archive", "--format=tar", sha], cwd=ROOT,
                                 capture_output=True, timeout=60, check=True).stdout
    require(hashlib.sha256(regenerated).hexdigest() == archive_sha,
            "RR1_ARCHIVE_NOT_FROM_COMMIT")
    for path, field in (("src/Dockerfile", "dockerfileSha256"),
                        ("src/package-lock.json", "packageLockSha256")):
        raw = subprocess.run(["git", "show", sha + ":" + path], cwd=ROOT,
                             capture_output=True, timeout=30, check=True).stdout
        require(hashlib.sha256(raw).hexdigest() == receipt.get(field),
                "RR1_BUILD_INPUT_CHANGED")
    full_path = Path(filename).parent / "rr1-clean-build-receipt.json"
    require(full_path.is_file() and hashlib.sha256(full_path.read_bytes()).hexdigest() ==
            receipt.get("cleanBuildReceiptSha256"), "RR1_BUILD_RECEIPT_HASH_MISMATCH")
    full = json.loads(full_path.read_text())
    mode = receipt.get("sourceMode", "LOCAL_CLEAN_ARCHIVE")
    require(mode in ("LOCAL_CLEAN_ARCHIVE", "CI_GIT_ARCHIVE") and
            full.get("sourceMode", "LOCAL_CLEAN_ARCHIVE") == mode,
            "RR1_BUILD_SOURCE_MODE_INVALID")
    require(full.get("sourceCommit") == sha and full.get("sourceTree") == tree and
            full.get("archiveSha256") == archive_sha and full.get("version") == version and
            isinstance(full.get("images"), list) and len(full["images"]) == 3,
            "RR1_BUILD_RECEIPT_INCOMPLETE")
    images = receipt.get("images")
    require(isinstance(images, dict) and set(images) == set(ROLES),
            "RR1_IMAGE_SET_INCOMPLETE")
    ids = set()
    for role in ROLES:
        item = images[role]
        built = next((row for row in full["images"] if row.get("role") == role), None)
        target = {"app": "runtime", "migrator": "migrator",
                  "cpu-worker": "cpu-worker"}[role]
        expected_tag = {"app": "cad-layout-viewer:ci",
                        "migrator": "cad-layout-viewer:ci-migrate",
                        "cpu-worker": "cad-layout-viewer:ci-cpu-worker"}[role]
        expected_ci_command = [
            "docker/build-push-action@v7", "context=" + full.get("context", ""),
            "file=" + full.get("context", "") + "/src/Dockerfile",
            "target=" + target, "platform=linux/amd64",
            "load=true", "tag=" + expected_tag,
        ]
        command_row = built.get("command", []) if built is not None else []
        require(built is not None and built.get("tag") == item.get("tag") and
                built.get("imageId") == item.get("id") and
                built.get("target") == target and
                ((mode == "CI_GIT_ARCHIVE" and command_row == expected_ci_command and
                  item.get("tag") == expected_tag) or
                 (mode == "LOCAL_CLEAN_ARCHIVE" and command_row[:4] ==
                  ["docker", "build", "--platform", "linux/amd64"] and
                  command_row[-1] == ".")),
                "RR1_BUILD_COMMAND_MISMATCH")
        tag = item.get("tag", "")
        require(isinstance(tag, str) and
                (tag.startswith("cad-layout-viewer:rr1-") if mode == "LOCAL_CLEAN_ARCHIVE"
                 else tag == expected_tag) and
                "@" not in tag, "RR1_LOCAL_TAG_INVALID")
        image = docker_json("image", "inspect", tag)
        require(image["Id"] == item.get("id") and DIGEST.fullmatch(image["Id"]),
                "RR1_BUILD_ID_MISMATCH")
        check_image_metadata(image, role, sha, version)
        ids.add(image["Id"])
    require(len(ids) == 3, "RR1_IMAGE_IDS_NOT_DISTINCT")
    return receipt


def check_image_metadata(image, role, sha, version):
    labels = (image.get("Config") or {}).get("Labels") or {}
    require(image.get("Os") == "linux" and image.get("Architecture") == "amd64" and
            labels.get("org.opencontainers.image.source") == SOURCE and
            labels.get("org.opencontainers.image.revision") == sha and
            labels.get("org.opencontainers.image.version") == version and
            labels.get("com.planner77.g7.image-role") == role,
            "RR1_IMAGE_METADATA_MISMATCH")


def docker_absent(kind, name):
    result = subprocess.run(["docker", kind, "inspect", name], cwd=ROOT,
                            capture_output=True, timeout=20, check=False)
    require(result.returncode != 0, "RR1_EXISTING_RESOURCE_DENIED")


def request_bytes(url, *, accept=None, expected_size=None, collect=True):
    headers = {"Accept": accept or "application/octet-stream"}
    try:
        with urlopen(Request(url, headers=headers), timeout=30) as response:
            digest = response.headers.get("Docker-Content-Digest")
            content_type = response.headers.get("Content-Type", "").split(";", 1)[0]
            total = 0
            hasher = hashlib.sha256()
            chunks = [] if collect else None
            while True:
                block = response.read(1024 * 1024)
                if not block:
                    break
                total += len(block)
                require(total <= 2 * 1024 * 1024 * 1024,
                        "RR1_REGISTRY_OBJECT_TOO_LARGE")
                hasher.update(block)
                if chunks is not None:
                    chunks.append(block)
            if expected_size is not None:
                require(total == expected_size, "RR1_REGISTRY_SIZE_MISMATCH")
            return ("sha256:" + hasher.hexdigest(), digest, content_type,
                    b"".join(chunks) if chunks is not None else None, total)
    except HTTPError as error:
        raise ProofError("RR1_REGISTRY_HTTP_" + str(error.code)) from error
    except URLError as error:
        raise ProofError("RR1_REGISTRY_UNAVAILABLE") from error


def registry_object(base, repository, kind, reference, *, accept=None, size=None,
                    collect=True):
    return request_bytes(base + "/v2/" + repository + "/" + kind + "/" + reference,
                         accept=accept, expected_size=size, collect=collect)


def manifest_json(base, repository, reference, expected=None):
    actual, header, media, raw, size = registry_object(
        base, repository, "manifests", reference, accept=MANIFEST_ACCEPT)
    require(header == actual and DIGEST.fullmatch(actual),
            "RR1_MANIFEST_HEADER_DIGEST_MISMATCH")
    if expected is not None:
        require(actual == expected, "RR1_MANIFEST_BYTES_MISMATCH")
    obj = json.loads(raw)
    require(isinstance(obj, dict) and obj.get("schemaVersion") == 2,
            "RR1_MANIFEST_INVALID")
    require(obj.get("mediaType", media) == media, "RR1_MANIFEST_MEDIA_MISMATCH")
    return actual, obj, size


def verify_registry_image(base, repository, tag, blob_cache):
    top_digest, top, _ = manifest_json(base, repository, tag)
    # The tag resolves to raw immutable bytes, not just a Docker CLI string.
    manifest_json(base, repository, top_digest, top_digest)
    children = top.get("manifests")
    if children is not None:
        matches = [item for item in children if item.get("platform", {}).get("os") == "linux"
                   and item.get("platform", {}).get("architecture") == "amd64" and
                   item.get("platform", {}).get("variant") in (None, "")]
        require(len(matches) == 1, "RR1_PLATFORM_CHILD_AMBIGUOUS")
        child = matches[0]
        require(DIGEST.fullmatch(child.get("digest", "")), "RR1_CHILD_DIGEST_INVALID")
        manifest_digest, manifest, child_size = manifest_json(
            base, repository, child["digest"], child["digest"])
        require(child_size == child.get("size"), "RR1_CHILD_SIZE_MISMATCH")
    else:
        manifest_digest, manifest = top_digest, top
    require("config" in manifest and isinstance(manifest.get("layers"), list) and
            len(manifest["layers"]) > 0, "RR1_IMAGE_MANIFEST_INVALID")
    config = manifest["config"]
    require(DIGEST.fullmatch(config.get("digest", "")), "RR1_CONFIG_DIGEST_INVALID")
    config_sha, _, _, config_raw, _ = registry_object(
        base, repository, "blobs", config["digest"], size=config.get("size"))
    require(config_sha == config["digest"], "RR1_CONFIG_BYTES_MISMATCH")
    config_json = json.loads(config_raw)
    require(config_json.get("os") == "linux" and
            config_json.get("architecture") == "amd64" and
            len(config_json.get("rootfs", {}).get("diff_ids", [])) == len(manifest["layers"]),
            "RR1_CONFIG_PLATFORM_OR_LAYERS_INVALID")
    for layer in manifest["layers"]:
        layer_digest = layer.get("digest", "")
        require(DIGEST.fullmatch(layer_digest), "RR1_LAYER_DIGEST_INVALID")
        if layer_digest not in blob_cache:
            actual, _, _, _, total = registry_object(
                base, repository, "blobs", layer_digest, size=layer.get("size"),
                collect=False)
            require(actual == layer_digest, "RR1_LAYER_BYTES_MISMATCH")
            blob_cache[layer_digest] = total
        else:
            require(blob_cache[layer_digest] == layer.get("size"),
                    "RR1_REUSED_LAYER_SIZE_MISMATCH")
    return {"digest": top_digest, "manifestDigest": manifest_digest,
            "configDigest": config["digest"],
            "layers": [layer["digest"] for layer in manifest["layers"]],
            "config": config_json}


def load_upgrade_pair_validator():
    filename = ROOT / "src/scripts/g7-upgrade.py"
    spec = importlib.util.spec_from_file_location("g7_upgrade_rr1", filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def validate_release_set(records, refs, source, version):
    require(set(refs) == set(ROLES), "RR1_IMAGE_SET_INCOMPLETE")
    require(len(set(refs.values())) == 3, "RR1_IMAGE_REFS_NOT_DISTINCT")
    for role in ROLES:
        ref = refs[role]
        require(re.fullmatch(r"127\.0\.0\.1:[0-9]+/rr1-release@sha256:[0-9a-f]{64}", ref),
                "RR1_NONOWNED_REF_DENIED")
        record = records.get(ref)
        require(record is not None and record["role"] == role and
                record["source"] == source and record["version"] == version,
                "RR1_RELEASE_SET_MISMATCH")
    inspect = lambda ref: docker_json("image", "inspect", ref)
    try:
        load_upgrade_pair_validator().inspect_pair(refs["app"], refs["migrator"],
                                                   source, inspect)
    except Exception as error:
        raise ProofError("RR1_OPERATIONAL_PAIR_REJECTED") from error
    for role in ROLES:
        check_image_metadata(inspect(refs[role]), role, source, version)
    return True


def negative_proofs(records, refs, source, version):
    cases = {
        "role_swap": ({**refs, "app": refs["migrator"], "migrator": refs["app"]}, source, version),
        "bad_source": (refs, "0" * 40 if source != "0" * 40 else "1" * 40, version),
        "bad_version": (refs, source, "0.0.0"),
        "missing_worker": ({key: value for key, value in refs.items() if key != "cpu-worker"}, source, version),
        "tampered_digest": ({**refs, "cpu-worker": refs["cpu-worker"][:-1] +
                             ("0" if refs["cpu-worker"][-1] != "0" else "1")}, source, version),
    }
    for name, (candidate, sha, release) in cases.items():
        try:
            validate_release_set(records, candidate, sha, release)
        except ProofError:
            continue
        raise ProofError("RR1_NEGATIVE_ACCEPTED_" + name.upper())
    return list(cases)


def smoke_digest(ref, role, expected_id, name):
    # The actual container is created FROM the immutable digest, and runs a
    # role-specific local runtime closure probe. RR2/RR3 exercise HTTP/Worker.
    checks = {
        "app": "require('fs').accessSync('server.js');new (require('better-sqlite3'))(':memory:').close()",
        "migrator": "require('fs').accessSync('scripts/g7-greenfield.ts');new (require('better-sqlite3'))(':memory:').close()",
        "cpu-worker": "require('fs').accessSync('scripts/scene-cpu-worker.ts');new (require('better-sqlite3'))(':memory:').close()",
    }
    cid = command(["docker", "create", "--name", name, "--network", "none",
                   "--read-only", "--user", "10001:10001", "--cap-drop", "ALL",
                   "--security-opt", "no-new-privileges", "--pids-limit", "64",
                   "--memory", "768m", "--cpus", "1.0",
                   "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=96m,uid=10001,gid=10001",
                   "--entrypoint", "node", ref, "-e", checks[role]], timeout=30)
    try:
        created = docker_json("inspect", cid)
        require(created["Image"] == expected_id and created["Config"]["Image"] == ref,
                "RR1_CREATED_IMAGE_ID_MISMATCH")
        host = created["HostConfig"]
        require(created["Config"]["User"] == "10001:10001" and
                host["NetworkMode"] == "none" and host["ReadonlyRootfs"] is True and
                host["Memory"] == 768 * 1024 * 1024 and host["PidsLimit"] == 64 and
                "ALL" in (host.get("CapDrop") or []) and
                not host.get("PortBindings"), "RR1_RUNTIME_ISOLATION_MISMATCH")
        command(["docker", "start", "-a", cid], timeout=60)
        finished = docker_json("inspect", cid)
        require(finished["State"]["ExitCode"] == 0 and not finished["State"]["OOMKilled"],
                "RR1_DIGEST_RUNTIME_FAILED")
        return {"containerId": cid, "imageId": created["Image"],
                "configImage": created["Config"]["Image"], "exitCode": 0,
                "networkMode": "none", "readonlyRootfs": True}
    finally:
        command(["docker", "rm", "-f", cid], timeout=30)


def cleanup_owned(resources, *, verify=True):
    cid = resources.get("registryCid")
    name = resources.get("registryName")
    network = resources.get("network")
    volume = resources.get("volume")
    nonce = resources.get("nonce")
    require(all(isinstance(x, str) and x for x in (cid, name, network, volume, nonce)),
            "RR1_CLEANUP_RECEIPT_INVALID")
    if verify:
        container = docker_json("inspect", cid)
        labels = container.get("Config", {}).get("Labels") or {}
        require(container.get("Name", "").lstrip("/") == name and
                labels.get("com.planner77.purpose") == PURPOSE and
                labels.get("com.planner77.rr1.nonce") == nonce,
                "RR1_CLEANUP_OWNERSHIP_MISMATCH")
        for kind, resource_name in (("network", network), ("volume", volume)):
            item = docker_json(kind, "inspect", resource_name)
            require(item.get("Labels", {}).get("com.planner77.rr1.nonce") == nonce,
                    "RR1_CLEANUP_OWNERSHIP_MISMATCH")
    command(["docker", "rm", "-f", cid], timeout=30)
    command(["docker", "network", "rm", network], timeout=30)
    command(["docker", "volume", "rm", volume], timeout=30)


def cleanup_registry_refs(receipt):
    host = receipt.get("host", "")
    nonce = receipt.get("resources", {}).get("nonce", "")
    require(re.fullmatch(r"127\.0\.0\.1:[0-9]+", host) and
            re.fullmatch(r"[0-9a-f]{16}", nonce), "RR1_IMAGE_CLEANUP_RECEIPT_INVALID")
    refs = receipt.get("refs", {})
    manifests = receipt.get("manifests", {})
    require(set(refs) == set(ROLES) and set(manifests) == set(ROLES),
            "RR1_IMAGE_CLEANUP_RECEIPT_INVALID")
    for role in ROLES:
        tag = host + "/rr1-release:" + role.replace("-", "") + "-" + nonce
        digest_ref = refs[role]
        require(digest_ref.startswith(host + "/rr1-release@") and
                digest_ref.endswith(manifests[role]["digest"]),
                "RR1_IMAGE_CLEANUP_RECEIPT_INVALID")
        expected_id = manifests[role]["configDigest"]
        for ref in (tag, digest_ref):
            remove_ref_if_owned(ref, expected_id)


def remove_ref_if_owned(ref, expected_id):
    probe = subprocess.run(["docker", "image", "inspect", ref],
                           cwd=ROOT, capture_output=True, text=True,
                           timeout=30, check=False)
    if probe.returncode != 0:
        return
    image = json.loads(probe.stdout)[0]
    require(image["Id"] == expected_id, "RR1_IMAGE_CLEANUP_ID_MISMATCH")
    command(["docker", "image", "rm", "--no-prune", ref], timeout=60)


def run_proof(options):
    build = check_build_receipt(options.build_receipt)
    nonce = secrets.token_hex(8)
    network = "layoutmanager-rr1-net-" + nonce
    volume = "layoutmanager-rr1-reg-" + nonce
    name = "layoutmanager-rr1-registry-" + nonce
    for kind, resource in (("network", network), ("volume", volume), ("container", name)):
        docker_absent(kind, resource)
    labels = ["--label", "com.planner77.purpose=" + PURPOSE,
              "--label", "com.planner77.rr1.nonce=" + nonce]
    resources = {"nonce": nonce, "network": network, "volume": volume,
                 "registryName": name, "registryCid": ""}
    success = False
    output = None
    host = None
    refs = {}
    try:
        command(["docker", "network", "create", *labels, network], timeout=30)
        command(["docker", "volume", "create", *labels, volume], timeout=30)
        cid = command(["docker", "run", "-d", "--name", name, *labels,
                       "--network", network, "--publish", "127.0.0.1::5000",
                       "--mount", "type=volume,source=" + volume +
                       ",target=/var/lib/registry", REGISTRY_REF], timeout=30)
        resources["registryCid"] = cid
        registry = docker_json("inspect", cid)
        require(registry["Image"] == docker_json("image", "inspect", REGISTRY_REF)["Id"],
                "RR1_REGISTRY_IMAGE_CHANGED")
        binding = registry["NetworkSettings"]["Ports"]["5000/tcp"]
        require(len(binding) == 1 and binding[0]["HostIp"] == "127.0.0.1" and
                binding[0]["HostPort"].isdigit(), "RR1_REGISTRY_NOT_LOOPBACK")
        host = "127.0.0.1:" + binding[0]["HostPort"]
        base = "http://" + host
        for _ in range(30):
            try:
                actual, _, _, _, _ = request_bytes(base + "/v2/")
                require(actual == sha_bytes(b"{}"), "RR1_REGISTRY_HEALTH_INVALID")
                break
            except ProofError:
                time.sleep(0.5)
        else:
            raise ProofError("RR1_REGISTRY_START_TIMEOUT")
        repository = "rr1-release"
        raw = {}
        blob_cache = {}
        records = {}
        for role in ROLES:
            tag = role.replace("-", "") + "-" + nonce
            push_ref = host + "/" + repository + ":" + tag
            command(["docker", "tag", build["images"][role]["tag"], push_ref], timeout=30)
            command(["docker", "push", push_ref], timeout=1200)
            verified = verify_registry_image(base, repository, tag, blob_cache)
            ref = host + "/" + repository + "@" + verified["digest"]
            command(["docker", "pull", "--platform", "linux/amd64", ref], timeout=1200)
            pulled = docker_json("image", "inspect", ref)
            require(pulled["Id"] == build["images"][role]["id"] == verified["configDigest"],
                    "RR1_PULL_CONFIG_ID_MISMATCH")
            check_image_metadata(pulled, role, build["sourceCommit"], build["version"])
            config_labels = verified["config"].get("config", {}).get("Labels") or {}
            require(config_labels == pulled["Config"].get("Labels"),
                    "RR1_REGISTRY_CONFIG_LABELS_MISMATCH")
            refs[role] = ref
            raw[role] = {key: value for key, value in verified.items() if key != "config"}
            records[ref] = {"role": role, "source": build["sourceCommit"],
                            "version": build["version"], "id": pulled["Id"]}
            print("RR1_REGISTRY_ROLE role=" + role + " manifest=" + verified["digest"] +
                  " config=" + verified["configDigest"] + " imageId=" + pulled["Id"], flush=True)
        validate_release_set(records, refs, build["sourceCommit"], build["version"])
        negatives = negative_proofs(records, refs, build["sourceCommit"], build["version"])
        bad_digest = raw["cpu-worker"]["digest"][:-1] + (
            "0" if raw["cpu-worker"]["digest"][-1] != "0" else "1")
        try:
            manifest_json(base, repository, bad_digest, bad_digest)
        except ProofError as error:
            require(str(error) == "RR1_REGISTRY_HTTP_404", "RR1_TAMPER_RESPONSE_UNEXPECTED")
        else:
            raise ProofError("RR1_TAMPERED_MANIFEST_RESOLVED")
        negatives.append("tampered_digest_http_404")
        runtime_smokes = {}
        for role in ROLES:
            runtime_smokes[role] = smoke_digest(
                refs[role], role, records[refs[role]]["id"],
                "layoutmanager-rr1-smoke-" + role.replace("-", "") + "-" + nonce)
        output = {
            "kind": "RR1_LOCAL_UNSIGNED_REGISTRY_RECEIPT", "sourceCommit": build["sourceCommit"],
            "sourceTree": build["sourceTree"], "version": build["version"],
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "buildReceipt": str(Path(options.build_receipt).resolve()),
            "registryRef": REGISTRY_REF, "registryImageId": registry["Image"],
            "resources": resources,
            "host": host, "refs": refs, "manifests": raw,
            "negativeCases": negatives, "runtimeSmokes": runtime_smokes,
            "retainedForR2": options.retain_for_r2,
        }
        receipt_path = Path(options.output_receipt)
        require(receipt_path.parent.exists() and not receipt_path.exists(),
                "RR1_OUTPUT_RECEIPT_NOT_NEW")
        fd = os.open(receipt_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as stream:
            json.dump(output, stream, indent=2, sort_keys=True)
            stream.write("\n")
        print("RR1_REGISTRY_PROOF_PASS negatives=" + str(len(negatives)) +
              " retained=" + str(options.retain_for_r2).lower(), flush=True)
        success = True
        return output
    finally:
        if resources["registryCid"] and (not success or not options.retain_for_r2):
            try:
                if output is not None:
                    cleanup_registry_refs(output)
                elif host is not None:
                    for role in ROLES:
                        expected = build["images"][role]["id"]
                        tag = host + "/rr1-release:" + role.replace("-", "") + "-" + nonce
                        remove_ref_if_owned(tag, expected)
                        if role in refs:
                            remove_ref_if_owned(refs[role], expected)
            finally:
                cleanup_owned(resources)
        elif not success:
            # docker run can create a stopped container before returning error.
            # Clean it only when its exact nonce and purpose prove ownership.
            probe = subprocess.run(["docker", "container", "inspect", name],
                                   capture_output=True, check=False)
            if probe.returncode == 0:
                rows = json.loads(probe.stdout)
                labels = rows[0].get("Config", {}).get("Labels", {}) if len(rows) == 1 else {}
                require(labels.get("com.planner77.purpose") == PURPOSE and
                        labels.get("com.planner77.rr1.nonce") == nonce,
                        "RR1_PARTIAL_CLEANUP_OWNERSHIP_MISMATCH")
                command(["docker", "rm", "-f", rows[0]["Id"]], timeout=30)
            for kind, resource in (("network", network), ("volume", volume)):
                result = subprocess.run(["docker", kind, "inspect", resource],
                                        capture_output=True, check=False)
                if result.returncode == 0:
                    rows = json.loads(result.stdout)
                    require(len(rows) == 1 and
                            rows[0].get("Labels", {}).get("com.planner77.purpose") == PURPOSE and
                            rows[0].get("Labels", {}).get("com.planner77.rr1.nonce") == nonce,
                            "RR1_PARTIAL_CLEANUP_OWNERSHIP_MISMATCH")
                    command(["docker", kind, "rm", resource], timeout=30)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build-receipt")
    parser.add_argument("--output-receipt")
    parser.add_argument("--retain-for-r2", action="store_true")
    parser.add_argument("--cleanup-receipt")
    args = parser.parse_args()
    try:
        if args.cleanup_receipt:
            require(not args.build_receipt and not args.output_receipt and not args.retain_for_r2,
                    "RR1_CLEANUP_ARGUMENT_CONFLICT")
            receipt = json.loads(Path(args.cleanup_receipt).read_text())
            require(receipt.get("kind") == "RR1_LOCAL_UNSIGNED_REGISTRY_RECEIPT" and
                    receipt.get("retainedForR2") is True, "RR1_CLEANUP_RECEIPT_INVALID")
            cleanup_registry_refs(receipt)
            cleanup_owned(receipt["resources"])
            print("RR1_OWNED_RESOURCES_REMOVED", flush=True)
        else:
            require(args.build_receipt and args.output_receipt,
                    "RR1_BUILD_AND_OUTPUT_RECEIPTS_REQUIRED")
            run_proof(args)
    except ProofError as error:
        print("RR1_PROOF_FAILED " + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
