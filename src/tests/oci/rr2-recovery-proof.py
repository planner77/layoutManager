#!/usr/bin/env python3
"""RR2 disposable actual-image upgrade/recovery driver.

Each action is receipt-bound. The real host helpers are copied byte-for-byte;
only a narrowly checked Compose namespace clone prevents collisions with the
running operational App. Secrets and CAD bytes never enter stdout or receipts.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import signal
import shutil
import subprocess
import sys
import tempfile
import time


ROOT = Path(__file__).resolve().parents[3]
PURPOSE = "rr2-actual-oci-recovery"
OLD_RECEIPT = Path(os.environ.get("RR2_OLD_PAIR_RECEIPT",
                                  ROOT / "data/release-proof/ghcr060-pair-receipt.json"))
NEW_RECEIPT = Path(os.environ.get("RR2_CURRENT_TRIPLET_RECEIPT",
                                  ROOT / "data/release-proof/rr1-registry-receipt.json"))
PROD_NAME = "cad-layout-viewer-app"
_RR1_IDENTITY = None


class Blocked(Exception):
    pass


def check(value, code):
    if not value:
        raise Blocked(code)


def run(args, *, timeout=180, allow_failure=False, env=None):
    try:
        result = subprocess.run(args, cwd=ROOT, env=env, capture_output=True, text=True,
                                timeout=timeout, check=False)
    except subprocess.TimeoutExpired as error:
        raise Blocked("RR2_COMMAND_TIMEOUT") from error
    if result.returncode and not allow_failure:
        raise Blocked("RR2_COMMAND_FAILED")
    return result


def docker_one(*args):
    value = json.loads(run(["docker", *args], timeout=30).stdout)
    check(isinstance(value, list) and len(value) == 1, "RR2_DOCKER_INSPECT_INVALID")
    return value[0]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def save_receipt(receipt):
    path = Path(receipt["root"]) / "receipt.json"
    path.write_text(json.dumps(receipt, indent=2) + "\n")


def run_owned_child(receipt, args, *, kind, volume, image, timeout=120):
    """Name and label disposable Docker runs before a CLI timeout can orphan them."""
    check(args[:2] == ["docker", "run"] and "--rm" in args and
          volume in (receipt["liveVolume"], receipt["restoreVolume"]),
          "RR2_CHILD_ARGUMENT_INVALID")
    check(image in (receipt["images"]["old"].values()) or
          image in receipt["images"]["new"].values(),
          "RR2_CHILD_IMAGE_INVALID")
    image_id = docker_one("image", "inspect", image)["Id"]
    name = "layoutmanager-rr2-child-" + receipt["nonce"] + "-" + secrets.token_hex(4)
    cidfile = Path(receipt["root"]) / (name + ".cid")
    check(optional_docker("container", name) is None, "RR2_CHILD_NAME_EXISTS")
    row = {"name": name, "kind": kind, "volume": volume, "image": image,
           "engineImageId": image_id, "nonce": receipt["nonce"],
           "cidFile": str(cidfile)}
    receipt.setdefault("children", []).append(row)
    save_receipt(receipt)
    decorated = args[:2] + ["--name", name, "--cidfile", str(cidfile),
        "--label", "com.planner77.purpose=" + PURPOSE,
        "--label", "com.planner77.rr2.nonce=" + receipt["nonce"]] + args[2:]
    return run(decorated, timeout=timeout)


def host_run(receipt, command, *, timeout=600):
    """Track Docker children without editing the copied production helper."""
    binary = shutil.which("docker")
    check(binary is not None and Path(binary).is_absolute(), "RR2_DOCKER_MISSING")
    wrapper_dir = Path(receipt["root"]) / "wrapper-bin"
    wrapper_dir.mkdir(exist_ok=True)
    wrapper = wrapper_dir / "docker"
    source = ROOT / "src/tests/oci/rr2-docker-wrapper.py"
    shutil.copyfile(source, wrapper)
    wrapper.chmod(0o700)
    env = dict(os.environ, PATH=str(wrapper_dir) + os.pathsep + os.environ["PATH"],
               RR2_REAL_DOCKER=binary,
               RR2_WRAPPER_RECEIPT=str(Path(receipt["root"]) / "receipt.json"))
    process = subprocess.Popen(command, cwd=ROOT, env=env, start_new_session=True,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    def stop_owned_group():
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            process.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            pass
        # A child may close inherited pipes yet remain in this private group.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        try:
            process.communicate(timeout=5)
        except subprocess.TimeoutExpired as error:
            raise Blocked("RR2_HOST_GROUP_REAP_FAILED") from error
    try:
        stdout, stderr = process.communicate(timeout=timeout)
    except subprocess.TimeoutExpired as error:
        stop_owned_group()
        raise Blocked("RR2_HOST_COMMAND_TIMEOUT") from error
    except BaseException:
        stop_owned_group()
        raise
    return subprocess.CompletedProcess(command, process.returncode, stdout, stderr)


def rr1_identity():
    global _RR1_IDENTITY
    if _RR1_IDENTITY is None:
        spec = importlib.util.spec_from_file_location(
            "rr2_rr1_identity", ROOT / "src/tests/oci/rr1-registry-proof.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        _RR1_IDENTITY = module
    return _RR1_IDENTITY


def optional_docker(kind, name):
    rr1 = rr1_identity()
    try:
        return rr1.docker_optional_inspect(kind, name)
    except rr1.ProofError as error:
        raise Blocked("RR2_DOCKER_INSPECT_UNAVAILABLE") from error


def prod_snapshot():
    item = optional_docker("container", PROD_NAME)
    if item is None:
        return {"Absent": True}
    return {"Id": item["Id"], "Image": item["Image"],
            "Running": item["State"]["Running"],
            "StartedAt": item["State"]["StartedAt"],
            "Mounts": [{"Type": m["Type"], "Name": m.get("Name"),
                        "Destination": m["Destination"], "RW": m["RW"]}
                       for m in item["Mounts"]]}


def ensure_prod(before):
    check(prod_snapshot() == before, "RR2_OPERATIONAL_APP_CHANGED")


def image_preflight(old, new):
    check(isinstance(old, list) and len(old) == 2 and
          {r.get("role") for r in old} == {"app", "migrator"},
          "RR2_OLD_PAIR_RECEIPT_INVALID")
    old_by_role = {r["role"]: r for r in old}
    spec_old = importlib.util.spec_from_file_location(
        "rr2_old_pair_constants", ROOT / "src/tests/oci/rr2-old-pair.py")
    old_module = importlib.util.module_from_spec(spec_old)
    spec_old.loader.exec_module(old_module)
    try:
        typed_old, _ = old_module.verify_pair_rows(pull=False)
    except (RuntimeError, ValueError, KeyError, TypeError) as error:
        raise Blocked("RR2_OLD_TYPED_GRAPH_INVALID") from error
    typed_old_by_role = {row["role"]: row for row in typed_old}
    for role, (_tag, expected_digest, expected_config) in old_module.ROLES.items():
        item = old_by_role[role]
        check(item.get("ref") == old_module.REPOSITORY + "@sha256:" + expected_digest and
              item.get("indexDigest") == "sha256:" + expected_digest and
              item.get("configDigest", item.get("imageId")) == expected_config and
              item.get("sourceCommit") == old_module.SOURCE and
              (not item.get("engineImageId") or
               item["engineImageId"] == typed_old_by_role[role]["engineImageId"]) and
              (not item.get("topDescriptor") or
               item["topDescriptor"] == typed_old_by_role[role]["topDescriptor"]) and
              (not item.get("manifestDescriptor") or
               item["manifestDescriptor"] == typed_old_by_role[role]["manifestDescriptor"]),
              "RR2_OLD_PUBLISHED_PAIR_MISMATCH")
    source = old_by_role["app"].get("sourceCommit")
    check(source == old_by_role["migrator"].get("sourceCommit") and
          re.fullmatch(r"[0-9a-f]{40}", source or ""), "RR2_OLD_SOURCE_MISMATCH")
    spec = importlib.util.spec_from_file_location("rr2_g7_upgrade", ROOT / "src/scripts/g7-upgrade.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    old_refs = {role: old_by_role[role]["ref"] for role in ("app", "migrator")}
    inspect = lambda ref: docker_one("image", "inspect", ref)
    try:
        ids = module.inspect_pair(old_refs["app"], old_refs["migrator"], source, inspect)
    except module.Blocked as error:
        raise Blocked("RR2_OLD_PAIR_REJECTED") from error
    check(ids == tuple(typed_old_by_role[role]["engineImageId"]
                       for role in ("app", "migrator")),
          "RR2_OLD_PAIR_ID_MISMATCH")
    check(new.get("kind") == "RR1_LOCAL_UNSIGNED_REGISTRY_RECEIPT" and
          new.get("retainedForR2") is True and new.get("version") == "0.61.0" and
          set(new.get("refs", {})) == {"app", "migrator", "cpu-worker"},
          "RR2_NEW_TRIPLET_RECEIPT_INVALID")
    registry = docker_one("inspect", new["resources"]["registryCid"])
    labels = registry.get("Config", {}).get("Labels") or {}
    check(registry["State"]["Running"] is True and
          labels.get("com.planner77.purpose") == "rr1-disposable-registry-proof" and
          labels.get("com.planner77.rr1.nonce") == new["resources"]["nonce"] and
          registry["Image"] == new["registryImageId"] and
          registry["NetworkSettings"]["Ports"]["5000/tcp"][0]["HostIp"] == "127.0.0.1",
          "RR2_CANDIDATE_REGISTRY_CHANGED")
    check(new["host"] == "127.0.0.1:" +
          registry["NetworkSettings"]["Ports"]["5000/tcp"][0]["HostPort"],
          "RR2_CANDIDATE_PORT_CHANGED")
    rr1 = rr1_identity()
    refs = new["refs"]
    records = {}
    typed_new = {}
    for role, ref in refs.items():
        image = inspect(ref)
        check(ref.startswith(new["host"] + "/rr1-release@") and
              ref.split("@", 1)[1] == new["manifests"][role]["digest"],
              "RR2_CANDIDATE_REF_MISMATCH")
        try:
            verified = rr1.verify_registry_image("http://" + new["host"],
                                                 "rr1-release", ref.split("@", 1)[1], {})
        except rr1.ProofError as error:
            raise Blocked("RR2_CANDIDATE_REGISTRY_GRAPH_INVALID") from error
        prior = new["manifests"][role]
        check(all(prior.get(key) == verified[key] for key in
                  ("digest", "manifestDigest", "configDigest", "layers")) and
              ("topDescriptor" not in prior or
               prior["topDescriptor"] == verified["topDescriptor"]) and
              ("manifestDescriptor" not in prior or
               prior["manifestDescriptor"] == verified["manifestDescriptor"]),
              "RR2_CANDIDATE_RAW_GRAPH_CHANGED")
        expected_engine = new.get("localRefEngineIds", {}).get(ref, image["Id"])
        try:
            identity = rr1.verify_pulled_identity(image, expected_engine, verified, ref)
        except rr1.ProofError as error:
            raise Blocked("RR2_CANDIDATE_TYPED_IDENTITY_INVALID") from error
        typed_new[role] = {key: verified[key] for key in
                           ("digest", "manifestDigest", "configDigest",
                            "topDescriptor", "manifestDescriptor")}
        typed_new[role]["engineImageId"] = identity["engineImageId"]
        records[ref] = {"role": role, "source": new["sourceCommit"],
                        "version": new["version"], "id": image["Id"]}
    try:
        rr1.validate_release_set(records, refs, new["sourceCommit"], new["version"])
    except rr1.ProofError as error:
        raise Blocked("RR2_CANDIDATE_RELEASE_SET_INVALID") from error
    return {"old": old_refs, "oldSource": source, "new": refs,
            "newSource": new["sourceCommit"],
            "oldTyped": {role: {key: typed_old_by_role[role][key] for key in
                        ("indexDigest", "engineImageId", "configDigest",
                         "topDescriptor", "manifestDescriptor")}
                        for role in ("app", "migrator")},
            "newTyped": typed_new,
            "oldReceiptSha256": digest(OLD_RECEIPT.read_bytes()),
            "newReceiptSha256": digest(NEW_RECEIPT.read_bytes()),
            "newRegistryCid": new["resources"]["registryCid"],
            "newRegistryNonce": new["resources"]["nonce"]}


def unique_port():
    import socket
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def replace_once(source, old, new, *, count=1):
    check(source.count(old) == count, "RR2_COMPOSE_SOURCE_DRIFT")
    return source.replace(old, new)


def write_env(path, refs, source, volume, port, *, cpu_enabled):
    values = {
        "GHCR_IMAGE": refs["app"], "GHCR_MIGRATION_IMAGE": refs["migrator"],
        "GHCR_CPU_WORKER_IMAGE": refs.get("cpu-worker", ""),
        "G7_RELEASE_SOURCE_COMMIT": source, "CAD_DATA_VOLUME_NAME": volume,
        "CAD_HOST_PORT": str(port), "G7_RUNTIME_ORIGIN": "http://127.0.0.1:" + str(port),
        "G7_RUNTIME_ALLOW_HTTP": "true", "SCENE_AUTO_BUILD_ENABLED":
        "true" if cpu_enabled else "false", "SCENE_CPU_WORKER_ENABLED":
        "true" if cpu_enabled else "false",
    }
    check(all("\n" not in value and "\r" not in value for value in values.values()),
          "RR2_ENV_INVALID")
    path.write_text("".join(key + "=" + value + "\n" for key, value in values.items()))
    path.chmod(0o600)


def compose_config(path, env, project):
    result = run(["docker", "compose", "--env-file", str(env), "-f", str(path),
                  "--project-name", project, "config", "--format", "json"], timeout=30)
    return json.loads(result.stdout)


def structured_diff(left, right, prefix=""):
    if isinstance(left, dict) and isinstance(right, dict):
        paths = []
        for key in sorted(set(left) | set(right)):
            child = prefix + "/" + key
            paths.extend(structured_diff(left.get(key), right.get(key), child))
        return paths
    if isinstance(left, list) and isinstance(right, list):
        paths = []
        for i in range(max(len(left), len(right))):
            paths.extend(structured_diff(left[i] if i < len(left) else None,
                                         right[i] if i < len(right) else None,
                                         prefix + "/" + str(i)))
        return paths
    return [] if left == right else [prefix]


def prepare(root, nonce, refs, prod_before):
    check(re.fullmatch(r"[0-9a-f]{16}", nonce), "RR2_NONCE_INVALID")
    check(not root.exists(), "RR2_ROOT_EXISTS")
    root.mkdir(mode=0o700, parents=True)
    scripts = root / "src/scripts"
    scripts.mkdir(parents=True)
    copies = {}
    for name in ("g7-deploy.py", "g7-upgrade.py"):
        source = ROOT / "src/scripts" / name
        target = scripts / name
        shutil.copyfile(source, target)
        check(target.read_bytes() == source.read_bytes(), "RR2_HOST_HELPER_BYTES_CHANGED")
        copies[name] = digest(target.read_bytes())
    original = (ROOT / "src/docker-compose.yml").read_text()
    clone = original
    clone = replace_once(clone, "container_name: cad-layout-viewer-app",
                         "container_name: layoutmanager-rr2-app-" + nonce)
    clone = replace_once(clone, "host_ip: 0.0.0.0", "host_ip: 127.0.0.1")
    clone = replace_once(clone, "name: cad-layout-viewer-network",
                         "name: layoutmanager-rr2-network-" + nonce)
    clone = replace_once(clone, "context: ..", "context: " + str(ROOT), count=3)
    clone = replace_once(clone,
                         '    name: "${CAD_DATA_VOLUME_NAME:-cad-layout-viewer-greenfield-install-v1}"',
                         '    name: "${CAD_DATA_VOLUME_NAME:-cad-layout-viewer-greenfield-install-v1}"\n'
                         '    labels:\n      com.planner77.purpose: ' + PURPOSE + '\n'
                         '      com.planner77.rr2.nonce: "' + nonce + '"')
    clone = replace_once(clone, "    driver: bridge\n",
                         "    driver: bridge\n    labels:\n"
                         "      com.planner77.purpose: " + PURPOSE + "\n"
                         "      com.planner77.rr2.nonce: \"" + nonce + "\"\n")
    clone_path = root / "src/docker-compose.yml"
    clone_path.write_text(clone)
    project = "layoutmanager-rr2-" + nonce
    restore_project = "layoutmanager-rr2-restore-" + nonce
    restore_app = "layoutmanager-rr2-restore-app-" + nonce
    restore_network = "layoutmanager-rr2-restore-network-" + nonce
    restore_clone = clone.replace("layoutmanager-rr2-app-" + nonce, restore_app)
    restore_clone = restore_clone.replace("layoutmanager-rr2-network-" + nonce,
                                          restore_network)
    check(restore_clone != clone and restore_clone.count(restore_app) == 1 and
          restore_clone.count(restore_network) == 1,
          "RR2_RESTORE_COMPOSE_DRIFT")
    restore_root = root / "restore"
    restore_scripts = restore_root / "src/scripts"
    restore_scripts.mkdir(parents=True)
    for name in ("g7-deploy.py", "g7-upgrade.py"):
        shutil.copyfile(scripts / name, restore_scripts / name)
    restore_compose = restore_root / "src/docker-compose.yml"
    restore_compose.write_text(restore_clone)
    live_volume = "layoutmanager-rr2-live-" + nonce
    restore_volume = "layoutmanager-rr2-restore-" + nonce
    old_port, restore_port = unique_port(), unique_port()
    check(old_port != restore_port, "RR2_PORT_COLLISION")
    old_env = root / "old.env"
    new_env = root / "new.env"
    restore_env = root / "restore.env"
    write_env(old_env, refs["old"], refs["oldSource"], live_volume, old_port,
              cpu_enabled=False)
    write_env(new_env, refs["new"], refs["newSource"], live_volume, old_port,
              cpu_enabled=True)
    write_env(restore_env, refs["old"], refs["oldSource"], restore_volume,
              restore_port, cpu_enabled=False)
    original_config = compose_config(ROOT / "src/docker-compose.yml", old_env, project)
    clone_config = compose_config(clone_path, old_env, project)
    differences = structured_diff(original_config, clone_config)
    allowed = {"/services/app/container_name", "/services/app/ports/0/host_ip",
               "/networks/cad-layout-viewer-network/name",
               "/networks/cad-layout-viewer-network/labels",
               "/volumes/cad-layout-viewer-data/labels"}
    check(set(differences) <= allowed and
          {"/services/app/container_name", "/services/app/ports/0/host_ip",
           "/networks/cad-layout-viewer-network/name"} <= set(differences),
          "RR2_COMPOSE_STRUCTURAL_DIFF_INVALID")
    check(clone_config["networks"]["cad-layout-viewer-network"].get("labels") ==
          {"com.planner77.purpose": PURPOSE, "com.planner77.rr2.nonce": nonce} and
          clone_config["volumes"]["cad-layout-viewer-data"].get("labels") ==
          {"com.planner77.purpose": PURPOSE, "com.planner77.rr2.nonce": nonce},
          "RR2_COMPOSE_LABELS_INVALID")
    check(clone_config["services"]["app"]["ports"][0]["host_ip"] == "127.0.0.1" and
          clone_config["volumes"]["cad-layout-viewer-data"]["name"] == live_volume,
          "RR2_COMPOSE_OWNERSHIP_INVALID")
    restore_original_config = compose_config(ROOT / "src/docker-compose.yml",
                                             restore_env, restore_project)
    restore_config = compose_config(restore_compose, restore_env, restore_project)
    check(set(structured_diff(restore_original_config, restore_config)) == allowed and
          restore_config["services"]["app"]["container_name"] == restore_app and
          restore_config["services"]["app"]["ports"][0]["host_ip"] == "127.0.0.1" and
          restore_config["networks"]["cad-layout-viewer-network"]["name"] == restore_network and
          restore_config["volumes"]["cad-layout-viewer-data"]["name"] == restore_volume,
          "RR2_RESTORE_COMPOSE_INVALID")
    for kind, name in (("volume", live_volume), ("volume", restore_volume),
                       ("network", "layoutmanager-rr2-network-" + nonce),
                       ("container", "layoutmanager-rr2-app-" + nonce),
                       ("network", restore_network), ("container", restore_app)):
        check(optional_docker(kind, name) is None,
              "RR2_EXISTING_RESOURCE_DENIED")
    ensure_prod(prod_before)
    receipt = {"kind": "RR2_OWNED_NAMESPACE", "nonce": nonce, "project": project,
               "root": str(root), "compose": str(clone_path),
               "oldEnv": str(old_env), "newEnv": str(new_env),
               "restoreEnv": str(restore_env),
               "restoreCompose": str(restore_compose),
               "restoreProject": restore_project,
               "restoreAppName": restore_app,
               "restoreNetwork": restore_network,
               "liveVolume": live_volume, "restoreVolume": restore_volume,
               "network": "layoutmanager-rr2-network-" + nonce,
               "appName": "layoutmanager-rr2-app-" + nonce,
               "oldPort": old_port, "restorePort": restore_port,
               "helperSha256": copies, "composeDiffPaths": differences,
               "namespaceSha256": {
                   "sourceCompose": digest((ROOT / "src/docker-compose.yml").read_bytes()),
                   "cloneCompose": digest(clone_path.read_bytes()),
                   "restoreCompose": digest(restore_compose.read_bytes()),
                   "oldEnv": digest(old_env.read_bytes()),
                   "newEnv": digest(new_env.read_bytes()),
                   "restoreEnv": digest(restore_env.read_bytes()),
               },
               "prodBefore": prod_before, "images": refs,
               "children": [], "hostChildren": []}
    observation = {"kind": "RR2_TYPED_IDENTITY_OBSERVATION", "nonce": nonce,
                   "oldReceiptSha256": refs["oldReceiptSha256"],
                   "newReceiptSha256": refs["newReceiptSha256"],
                   "registryCid": refs["newRegistryCid"],
                   "registryNonce": refs["newRegistryNonce"],
                   "oldRefs": refs["old"], "newRefs": refs["new"],
                   "oldTyped": refs["oldTyped"], "newTyped": refs["newTyped"]}
    observation_file = root / "typed-observation.json"
    observation_file.write_text(json.dumps(observation, indent=2, sort_keys=True) + "\n")
    receipt["typedObservationSha256"] = digest(observation_file.read_bytes())
    (root / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print("RR2_NAMESPACE_PREPARED nonce=" + nonce + " allowedDiffs=" + str(len(differences)))
    return receipt


def load_receipt(path):
    receipt = json.loads(Path(path).read_text())
    check(receipt.get("kind") == "RR2_OWNED_NAMESPACE" and
          re.fullmatch(r"[0-9a-f]{16}", receipt.get("nonce", "")) and
          Path(path).resolve() == (Path(receipt["root"]) / "receipt.json").resolve(),
          "RR2_RECEIPT_INVALID")
    observation_file = Path(receipt["root"]) / "typed-observation.json"
    check(observation_file.is_file() and
          digest(observation_file.read_bytes()) == receipt.get("typedObservationSha256"),
          "RR2_TYPED_OBSERVATION_CHANGED")
    observation = json.loads(observation_file.read_text())
    check(observation.get("kind") == "RR2_TYPED_IDENTITY_OBSERVATION" and
          observation.get("nonce") == receipt["nonce"] and
          observation.get("oldReceiptSha256") == digest(OLD_RECEIPT.read_bytes()) and
          observation.get("newReceiptSha256") == digest(NEW_RECEIPT.read_bytes()) and
          observation.get("registryCid") == receipt["images"]["newRegistryCid"] and
          observation.get("registryNonce") == receipt["images"]["newRegistryNonce"] and
          observation.get("oldRefs") == receipt["images"]["old"] and
          observation.get("newRefs") == receipt["images"]["new"] and
          observation.get("oldTyped") == receipt["images"]["oldTyped"] and
          observation.get("newTyped") == receipt["images"]["newTyped"],
          "RR2_TYPED_OBSERVATION_INVALID")
    children = receipt.get("children", [])
    check(isinstance(children, list) and
          len({row.get("name") for row in children}) == len(children) and
          all(row.get("nonce") == receipt["nonce"] and
              re.fullmatch(r"layoutmanager-rr2-child-" + receipt["nonce"] +
                           r"-[0-9a-f]{8}", row.get("name", "")) and
              row.get("volume") in (receipt["liveVolume"], receipt["restoreVolume"]) and
              row.get("image") in tuple(receipt["images"]["old"].values()) +
                                  tuple(receipt["images"]["new"].values()) and
              re.fullmatch(r"sha256:[0-9a-f]{64}", row.get("engineImageId", "")) and
              row.get("cidFile") == str(Path(receipt["root"]) /
                                         (row.get("name", "") + ".cid"))
              for row in children), "RR2_CHILD_RECEIPT_INVALID")
    host_children = receipt.get("hostChildren", [])
    check(isinstance(host_children, list) and
          len({row.get("name") for row in host_children}) == len(host_children) and
          all(row.get("nonce") == receipt["nonce"] and
              re.fullmatch(r"layoutmanager-rr2-host-" + receipt["nonce"] +
                           r"-[0-9a-f]{8}", row.get("name", "")) and
              row.get("cidFile") == str(Path(receipt["root"]) /
                                         (row.get("name", "") + ".cid")) and
              row.get("volumes") and
              all(volume in (receipt["liveVolume"], receipt["restoreVolume"])
                  for volume in row["volumes"]) and
              row.get("image") == row.get("engineImageId") and
              re.fullmatch(r"sha256:[0-9a-f]{64}", row.get("engineImageId", ""))
              for row in host_children), "RR2_HOST_CHILD_RECEIPT_INVALID")
    for name, checksum in receipt["helperSha256"].items():
        source = ROOT / "src/scripts" / name
        target = Path(receipt["root"]) / "src/scripts" / name
        check(digest(source.read_bytes()) == checksum == digest(target.read_bytes()),
              "RR2_HOST_HELPER_BYTES_CHANGED")
    expected_hashes = {
        "sourceCompose": ROOT / "src/docker-compose.yml",
        "cloneCompose": Path(receipt["compose"]),
        "restoreCompose": Path(receipt["restoreCompose"]),
        "oldEnv": Path(receipt["oldEnv"]),
        "newEnv": Path(receipt["newEnv"]),
        "restoreEnv": Path(receipt["restoreEnv"]),
    }
    check(set(receipt.get("namespaceSha256", {})) == set(expected_hashes),
          "RR2_NAMESPACE_SEAL_MISSING")
    for key, file in expected_hashes.items():
        check(file.is_file() and digest(file.read_bytes()) ==
              receipt["namespaceSha256"][key], "RR2_NAMESPACE_BYTES_CHANGED")
    for name in ("g7-deploy.py", "g7-upgrade.py"):
        check(digest((Path(receipt["root"]) / "restore/src/scripts" / name).read_bytes()) ==
              receipt["helperSha256"][name], "RR2_RESTORE_HELPER_BYTES_CHANGED")
    for release in ("old", "new", "restore"):
        env_path = Path(receipt[release + "Env"])
        values = dict(line.split("=", 1) for line in env_path.read_text().splitlines())
        refs = receipt["images"]["old" if release == "restore" else release]
        source = receipt["images"]["oldSource" if release == "restore" else release + "Source"]
        volume = receipt["restoreVolume"] if release == "restore" else receipt["liveVolume"]
        port = receipt["restorePort"] if release == "restore" else receipt["oldPort"]
        check(values == {
            "GHCR_IMAGE": refs["app"], "GHCR_MIGRATION_IMAGE": refs["migrator"],
            "GHCR_CPU_WORKER_IMAGE": refs.get("cpu-worker", ""),
            "G7_RELEASE_SOURCE_COMMIT": source, "CAD_DATA_VOLUME_NAME": volume,
            "CAD_HOST_PORT": str(port),
            "G7_RUNTIME_ORIGIN": "http://127.0.0.1:" + str(port),
            "G7_RUNTIME_ALLOW_HTTP": "true",
            "SCENE_AUTO_BUILD_ENABLED": "true" if release == "new" else "false",
            "SCENE_CPU_WORKER_ENABLED": "true" if release == "new" else "false",
        }, "RR2_ENV_SEMANTICS_CHANGED")
        original = compose_config(ROOT / "src/docker-compose.yml", env_path,
                                  receipt["project"])
        clone = compose_config(Path(receipt["compose"]), env_path,
                               receipt["project"])
        allowed = set(receipt["composeDiffPaths"])
        check(set(structured_diff(original, clone)) == allowed and
              clone["services"]["app"]["container_name"] == receipt["appName"] and
              clone["services"]["app"]["ports"][0]["host_ip"] == "127.0.0.1" and
              clone["networks"]["cad-layout-viewer-network"]["name"] == receipt["network"] and
              clone["volumes"]["cad-layout-viewer-data"]["name"] == volume,
              "RR2_NAMESPACE_SEMANTICS_CHANGED")
    restore_original = compose_config(ROOT / "src/docker-compose.yml",
                                      Path(receipt["restoreEnv"]),
                                      receipt["restoreProject"])
    restore_clone = compose_config(Path(receipt["restoreCompose"]),
                                   Path(receipt["restoreEnv"]),
                                   receipt["restoreProject"])
    check(set(structured_diff(restore_original, restore_clone)) ==
          set(receipt["composeDiffPaths"]) and
          restore_clone["services"]["app"]["container_name"] == receipt["restoreAppName"] and
          restore_clone["services"]["app"]["ports"][0]["host_ip"] == "127.0.0.1" and
          restore_clone["volumes"]["cad-layout-viewer-data"]["name"] ==
          receipt["restoreVolume"] and
          restore_clone["networks"]["cad-layout-viewer-network"]["name"] ==
          receipt["restoreNetwork"], "RR2_RESTORE_NAMESPACE_CHANGED")
    ensure_prod(receipt["prodBefore"])
    nonce = receipt["nonce"]
    for kind, name in (("volume", receipt["liveVolume"]),
                       ("volume", receipt["restoreVolume"]),
                       ("network", receipt["network"]),
                       ("network", receipt["restoreNetwork"])):
        item = optional_docker(kind, name)
        if item is not None:
            labels = item.get("Labels") or {}
            if kind == "volume" and name == receipt["restoreVolume"] and receipt.get("restoreOwner"):
                check(labels.get("com.planner77.g7.restore-owner") ==
                      receipt["restoreOwner"], "RR2_RESTORE_OWNERSHIP_CHANGED")
            else:
                check(labels.get("com.planner77.purpose") == PURPOSE and
                      labels.get("com.planner77.rr2.nonce") == nonce,
                      "RR2_RESOURCE_OWNERSHIP_CHANGED")
    for name, project in ((receipt["appName"], receipt["project"]),
                          (receipt["restoreAppName"], receipt["restoreProject"])):
        item = optional_docker("container", name)
        if item is not None:
            labels = item.get("Config", {}).get("Labels") or {}
            check(labels.get("com.docker.compose.project") == project and
                  labels.get("com.docker.compose.service") == "app" and
                  item["Name"].lstrip("/") == name,
                  "RR2_APP_OWNERSHIP_CHANGED")
    return receipt


def snapshot_volume(receipt, volume):
    check(volume in (receipt["liveVolume"], receipt["restoreVolume"]),
          "RR2_SNAPSHOT_VOLUME_INVALID")
    item = docker_one("volume", "inspect", volume)
    labels = item.get("Labels") or {}
    if volume == receipt["restoreVolume"]:
        check(receipt.get("restoreOwner") and
              labels.get("com.planner77.g7.restore-owner") == receipt["restoreOwner"],
              "RR2_SNAPSHOT_VOLUME_OWNERSHIP_INVALID")
    else:
        check(labels.get("com.planner77.purpose") == PURPOSE and
              labels.get("com.planner77.rr2.nonce") == receipt["nonce"],
              "RR2_SNAPSHOT_VOLUME_OWNERSHIP_INVALID")
    helper = ROOT / "src/tests/oci/rr2-volume-snapshot.mjs"
    image = receipt["images"]["new"]["cpu-worker"]
    result = run_owned_child(receipt, ["docker", "run", "--rm", "--network", "none", "--read-only",
                  "--user", "10001:10001", "--cap-drop", "ALL", "--security-opt",
                  "no-new-privileges", "--pids-limit", "64", "--memory", "768m",
                  "--cpus", "1.0", "--tmpfs",
                  "/tmp:rw,noexec,nosuid,nodev,size=96m,uid=10001,gid=10001",
                  "--mount", "type=volume,source=" + volume + ",target=/data,readonly",
                  "--mount", "type=bind,src=" + str(helper) +
                  ",dst=/app/src/scripts/rr2-volume-snapshot.mjs,readonly",
                  "-e", "RR2_NONCE=" + receipt["nonce"], "--entrypoint", "node",
                  image, "--import", "tsx", "scripts/rr2-volume-snapshot.mjs"],
                 kind="snapshot", volume=volume, image=image, timeout=120)
    value = json.loads(result.stdout)
    check(value.get("kind") == "RR2_OWNED_VOLUME_SNAPSHOT" and
          value.get("nonce") == receipt["nonce"] and
          value.get("foreignKeys") == 0,
          "RR2_SNAPSHOT_INVALID")
    ensure_prod(receipt["prodBefore"])
    return value


def cleanup_owned_children(receipt):
    for row in receipt.get("children", []) + receipt.get("hostChildren", []):
        item = optional_docker("container", row["name"])
        if item is None:
            continue
        cidfile = Path(row["cidFile"])
        check(cidfile.is_file() and
              re.fullmatch(r"[0-9a-f]{64}\n?", cidfile.read_text()) and
              cidfile.read_text().strip() == item.get("Id"),
              "RR2_CHILD_CID_UNPROVEN")
        labels = (item.get("Config") or {}).get("Labels") or {}
        expected_volumes = row.get("volumes", [row.get("volume")])
        mounts = [m for m in item.get("Mounts", [])
                  if m.get("Destination") in ("/data", "/restore")]
        check(item.get("Name", "").lstrip("/") == row["name"] and
              item.get("Image") == row["engineImageId"] and
              (item.get("Config") or {}).get("Image") == row["image"] and
              labels.get("com.planner77.purpose") == PURPOSE and
              labels.get("com.planner77.rr2.nonce") == receipt["nonce"] and
              len(mounts) == len(expected_volumes) and
              sorted(m.get("Name") for m in mounts) == sorted(expected_volumes) and
              (item.get("HostConfig") or {}).get("NetworkMode") == "none",
              "RR2_CHILD_CLEANUP_OWNERSHIP_INVALID")
        run(["docker", "rm", "-f", item["Id"]], timeout=30)
        check(optional_docker("container", row["name"]) is None,
              "RR2_CHILD_CLEANUP_INCOMPLETE")


def cleanup_namespace(receipt):
    cleanup_owned_children(receipt)
    # Two explicit projects and volumes are the entire disposable boundary.
    for release, project, compose, volume in (
        ("restore", receipt["restoreProject"], receipt["restoreCompose"],
         receipt["restoreVolume"]),
        ("old", receipt["project"], receipt["compose"], receipt["liveVolume"])):
        containers = run(["docker", "ps", "--all", "--quiet", "--filter",
                          "label=com.docker.compose.project=" + project]).stdout.splitlines()
        for cid in containers:
            item = docker_one("inspect", cid)
            labels = item.get("Config", {}).get("Labels") or {}
            service = labels.get("com.docker.compose.service")
            check(service in ("app", "migrate") and
                  labels.get("com.docker.compose.project") == project and
                  all(m.get("Name") == volume for m in item.get("Mounts", [])
                      if m.get("Destination") == "/data") and
                  len([m for m in item.get("Mounts", [])
                       if m.get("Destination") == "/data"]) == 1,
                  "RR2_CLEANUP_CONTAINER_NOT_OWNED")
        env = receipt["restoreEnv"] if release == "restore" else receipt["oldEnv"]
        run(["docker", "compose", "--env-file", env, "-f", compose,
             "--project-name", project, "down"], timeout=120)
        item = optional_docker("volume", volume)
        if item is not None:
            labels = item.get("Labels") or {}
            if release == "restore":
                check(labels.get("com.planner77.g7.restore-owner") ==
                      receipt.get("restoreOwner"), "RR2_CLEANUP_VOLUME_NOT_OWNED")
            else:
                check(labels.get("com.planner77.purpose") == PURPOSE and
                      labels.get("com.planner77.rr2.nonce") == receipt["nonce"],
                      "RR2_CLEANUP_VOLUME_NOT_OWNED")
            run(["docker", "volume", "rm", volume], timeout=30)
    for row in receipt.get("children", []) + receipt.get("hostChildren", []):
        check(optional_docker("container", row["name"]) is None,
              "RR2_CHILD_CLEANUP_INCOMPLETE")
    for kind, name in (("container", receipt["appName"]),
                       ("container", receipt["restoreAppName"]),
                       ("volume", receipt["liveVolume"]),
                       ("volume", receipt["restoreVolume"]),
                       ("network", receipt["network"]),
                       ("network", receipt["restoreNetwork"])):
        check(optional_docker(kind, name) is None,
              "RR2_NAMESPACE_CLEANUP_INCOMPLETE")
    ensure_prod(receipt["prodBefore"])
    print("RR2_OWNED_NAMESPACE_CLEANED")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("prepare", "status", "plan", "execute", "start",
                                           "browser-fixture", "snapshot", "worker-tick",
                                           "revoke-test-sessions", "restore", "cleanup"))
    parser.add_argument("--receipt")
    parser.add_argument("--release", choices=("old", "new", "restore"), default="old")
    parser.add_argument("--operation", choices=("execute", "start"), default="execute")
    parser.add_argument("--approve-plan")
    parser.add_argument("--backup")
    args = parser.parse_args()
    try:
        if args.action == "prepare":
            check(not args.receipt, "RR2_PREPARE_ARGUMENT_INVALID")
            before = prod_snapshot()
            old = json.loads(OLD_RECEIPT.read_text())
            new = json.loads(NEW_RECEIPT.read_text())
            refs = image_preflight(old, new)
            nonce = secrets.token_hex(8)
            root = ROOT / "data/release-proof" / ("rr2-" + nonce)
            prepare(root, nonce, refs, before)
        else:
            check(args.receipt, "RR2_RECEIPT_REQUIRED")
            receipt = load_receipt(args.receipt)
            if args.action == "cleanup":
                check(not args.approve_plan and not args.backup,
                      "RR2_CLEANUP_ARGUMENT_INVALID")
                cleanup_namespace(receipt)
                return 0
            if args.action == "restore":
                check(args.release == "new" and not args.approve_plan and
                      args.operation == "execute" and
                      re.fullmatch(r"[0-9a-f-]{36}", args.backup or ""),
                      "RR2_RESTORE_ARGUMENT_INVALID")
                check(not receipt.get("restoreOwner"), "RR2_RESTORE_ALREADY_DONE")
                check(optional_docker("volume", receipt["restoreVolume"]) is None,
                      "RR2_RESTORE_VOLUME_EXISTS")
                old = json.loads(OLD_RECEIPT.read_text())
                new = json.loads(NEW_RECEIPT.read_text())
                image_preflight(old, new)
                before = snapshot_volume(receipt, receipt["liveVolume"])
                check(before.get("backupIds") == [args.backup] and
                      before.get("manifestVersion") == "0.61.0",
                      "RR2_BACKUP_ID_INVALID")
                worker = run(["docker", "ps", "--quiet", "--filter",
                              "volume=" + receipt["liveVolume"]]).stdout.splitlines()
                check(all(docker_one("inspect", cid)["Name"].lstrip("/") ==
                          receipt["appName"] for cid in worker),
                      "RR2_UNEXPECTED_RUNNING_VOLUME_WRITER")
                helper = Path(receipt["root"]) / "src/scripts/g7-upgrade.py"
                result = host_run(receipt, [sys.executable, str(helper), receipt["newEnv"],
                              "restore", "--backup", args.backup,
                              "--restore-volume", receipt["restoreVolume"],
                              "--project-name", receipt["project"]],
                             timeout=600)
                diagnostic_path = Path(receipt["root"]) / "restore-host-diagnostic.json"
                diagnostic_path.write_text(json.dumps({"kind": "RR2_RESTORE_HOST_DIAGNOSTIC",
                                                       "returncode": result.returncode,
                                                       "records": []}) + "\n")
                records = [json.loads(line) for line in result.stdout.splitlines()
                           if line.startswith("{")]
                safe = [{key: record[key] for key in ("state", "code", "stage")
                         if key in record and isinstance(record[key], str)}
                        for record in records]
                diagnostic = {"kind": "RR2_RESTORE_HOST_DIAGNOSTIC",
                              "returncode": result.returncode, "records": safe}
                diagnostic_path.write_text(
                    json.dumps(diagnostic, sort_keys=True) + "\n")
                check(result.returncode == 0, "RR2_FORMAL_RESTORE_FAILED")
                check(any(record.get("state") == "RESTORED_ISOLATED" and
                          record.get("backupId") == args.backup for record in records) and
                      any(record.get("state") == "G7_UPGRADE_HOST_COMPLETE_APP_STOPPED"
                          for record in records), "RR2_FORMAL_RESTORE_RESULT_INVALID")
                volume_item = docker_one("volume", "inspect", receipt["restoreVolume"])
                owner = (volume_item.get("Labels") or {}).get(
                    "com.planner77.g7.restore-owner", "")
                check(re.fullmatch(r"[0-9a-f]{32}", owner),
                      "RR2_FORMAL_RESTORE_OWNER_INVALID")
                receipt = load_receipt(args.receipt)
                receipt["restoreOwner"] = owner
                Path(args.receipt).write_text(json.dumps(receipt, indent=2) + "\n")
                marker_command = "test ! -e /data/rr2-ownership.marker && printf 'RR2:%s\\n' \"$RR2_NONCE\" > /data/rr2-ownership.marker && chmod 600 /data/rr2-ownership.marker"
                run_owned_child(receipt, ["docker", "run", "--rm", "--network", "none", "--user",
                     "10001:10001", "--mount", "type=volume,source=" +
                     receipt["restoreVolume"] + ",target=/data", "-e",
                     "RR2_NONCE=" + receipt["nonce"], "--entrypoint", "sh",
                     receipt["images"]["old"]["migrator"], "-c", marker_command],
                    kind="restore-marker", volume=receipt["restoreVolume"],
                    image=receipt["images"]["old"]["migrator"], timeout=30)
                after = snapshot_volume(receipt, receipt["liveVolume"])
                check(before == after, "RR2_LIVE_SOURCE_CHANGED_BY_RESTORE")
                print(json.dumps({"kind": "RR2_FORMAL_RESTORE_PASS",
                                  "backupId": args.backup,
                                  "liveSourceUnchanged": True}, sort_keys=True))
                return 0
            if args.action == "revoke-test-sessions":
                check(args.release in ("new", "restore") and not args.approve_plan and
                      args.operation == "execute", "RR2_SESSION_ARGUMENT_INVALID")
                volume = (receipt["restoreVolume"] if args.release == "restore"
                          else receipt["liveVolume"])
                labels = docker_one("volume", "inspect", volume).get("Labels", {})
                owned = (labels.get("com.planner77.g7.restore-owner") ==
                         receipt.get("restoreOwner") if args.release == "restore" else
                         labels.get("com.planner77.rr2.nonce") == receipt["nonce"])
                check(owned,
                      "RR2_SESSION_VOLUME_OWNERSHIP_INVALID")
                script = ROOT / "src/tests/oci/rr2-revoke-test-sessions.mjs"
                image = receipt["images"]["new"]["cpu-worker"]
                result = run_owned_child(receipt, ["docker", "run", "--rm", "--network", "none", "--read-only",
                    "--user", "10001:10001", "--cap-drop", "ALL", "--security-opt",
                    "no-new-privileges", "--pids-limit", "64", "--memory", "768m",
                    "--cpus", "1.0", "--tmpfs",
                    "/tmp:rw,noexec,nosuid,nodev,size=96m,uid=10001,gid=10001",
                    "--mount", "type=volume,source=" + volume + ",target=/data",
                    "--mount", "type=bind,src=" + str(script) +
                    ",dst=/app/src/scripts/rr2-revoke-test-sessions.mjs,readonly",
                    "-e", "RR2_NONCE=" + receipt["nonce"], "--entrypoint", "node",
                    image, "--import", "tsx", "scripts/rr2-revoke-test-sessions.mjs"],
                    kind="revoke-sessions", volume=volume, image=image, timeout=60)
                record = json.loads(result.stdout)
                check(record.get("kind") == "RR2_TEST_SESSIONS_REVOKED" and
                      isinstance(record.get("count"), int), "RR2_SESSION_RESULT_INVALID")
                print(json.dumps(record, sort_keys=True))
                ensure_prod(receipt["prodBefore"])
                return 0
            if args.action == "worker-tick":
                check(args.release == "new" and not args.approve_plan and
                      args.operation == "execute", "RR2_WORKER_ARGUMENT_INVALID")
                old = json.loads(OLD_RECEIPT.read_text())
                new = json.loads(NEW_RECEIPT.read_text())
                image_preflight(old, new)
                image = receipt["images"]["new"]["cpu-worker"]
                volume = receipt["liveVolume"]
                check(docker_one("volume", "inspect", volume).get("Labels", {}).get(
                      "com.planner77.rr2.nonce") == receipt["nonce"],
                      "RR2_WORKER_VOLUME_OWNERSHIP_INVALID")
                result = run_owned_child(receipt, ["docker", "run", "--rm", "--network", "none",
                    "--read-only", "--user", "10001:10001", "--cap-drop", "ALL",
                    "--security-opt", "no-new-privileges", "--pids-limit", "64",
                    "--memory", "768m", "--cpus", "1.0", "--tmpfs",
                    "/tmp:rw,noexec,nosuid,nodev,size=96m,uid=10001,gid=10001",
                    "--mount", "type=volume,source=" + volume + ",target=/data",
                    "-e", "NODE_ENV=production", "-e", "G7_GREENFIELD_MODE=true",
                    "-e", "G7_GREENFIELD_AUTOMATED=true", "-e",
                    "DATABASE_URL=file:/data/db/cad.sqlite", "-e", "CAD_STORAGE_PATH=/data/cad",
                    "-e", "CAD_STORAGE_BACKEND=local", "-e", "G7_AUTH_ENABLED=true",
                    "-e", "G7_CAD_WRITE_CUTOVER_ENABLED=true", "-e",
                    "G7_RUNTIME_ORIGIN=http://127.0.0.1:" + str(receipt["oldPort"]),
                    "-e", "G7_RUNTIME_ALLOW_HTTP=true", "-e", "SCENE_AUTO_BUILD_ENABLED=true",
                    "-e", "SCENE_CPU_WORKER_ENABLED=true", "-e",
                    "G7_RELEASE_SOURCE_COMMIT=" + receipt["images"]["newSource"],
                    "-e", "G7_DEPLOY_APP_IMAGE=" + receipt["images"]["new"]["app"],
                    "-e", "G7_DEPLOY_MIGRATOR_IMAGE=" + receipt["images"]["new"]["migrator"],
                    "--entrypoint", "node", image, "--import", "tsx",
                    "scripts/scene-cpu-worker.ts", "--once"],
                    kind="worker-tick", volume=volume, image=image, timeout=120)
                lines = [json.loads(line) for line in result.stdout.splitlines()
                         if line.startswith('{') and 'CPU_SCENE_TICK' in line]
                check(len(lines) == 1 and lines[0].get("kind") == "CPU_SCENE_TICK",
                      "RR2_WORKER_TICK_INVALID")
                safe = {key: lines[0].get(key) for key in
                        ("kind", "outcome", "jobId", "code") if key in lines[0]}
                print(json.dumps(safe, sort_keys=True))
                ensure_prod(receipt["prodBefore"])
                return 0
            if args.action == "snapshot":
                check(not args.approve_plan and args.operation == "execute",
                      "RR2_SNAPSHOT_ARGUMENT_INVALID")
                volume = (receipt["restoreVolume"] if args.release == "restore"
                          else receipt["liveVolume"])
                print(json.dumps(snapshot_volume(receipt, volume), sort_keys=True))
                return 0
            if args.action == "browser-fixture":
                check(args.release == "old" and args.operation == "execute" and
                      not args.approve_plan, "RR2_FIXTURE_ARGUMENT_INVALID")
                old_state = json.loads((Path(receipt["root"]) / "old-http-state.json").read_text())
                check(old_state.get("kind") == "RR2_OLD_HTTP_STATE" and
                      old_state.get("nonce") == receipt["nonce"],
                      "RR2_OLD_HTTP_STATE_INVALID")
                old = json.loads(OLD_RECEIPT.read_text())
                new = json.loads(NEW_RECEIPT.read_text())
                image_preflight(old, new)
                sanitized = {key: old_state[key] for key in
                             ("nonce", "ids", "editorId", "readyVersion", "queuedVersion",
                              "sourceSha")}
                sanitized["kind"] = "RR2_FIXTURE_INPUT"
                input_file = Path(receipt["root"]) / "old-fixture-input.json"
                if input_file.exists():
                    check(json.loads(input_file.read_text()) == sanitized,
                          "RR2_FIXTURE_INPUT_CHANGED")
                else:
                    input_file.write_text(json.dumps(sanitized))
                # Only synthetic IDs/source SHA; the UID10001 fixture process
                # must read this bind mount without receiving account secrets.
                input_file.chmod(0o644)
                volume = receipt["liveVolume"]
                old_migrator = receipt["images"]["old"]["migrator"]
                worker = receipt["images"]["new"]["cpu-worker"]
                marker_command = "if test -e /data/rr2-ownership.marker; then test \"$(cat /data/rr2-ownership.marker)\" = \"RR2:$RR2_NONCE\"; else printf 'RR2:%s\\n' \"$RR2_NONCE\" > /data/rr2-ownership.marker && chmod 600 /data/rr2-ownership.marker; fi"
                run_owned_child(receipt, ["docker", "run", "--rm", "--network", "none", "--user",
                     "10001:10001", "--mount", "type=volume,source=" + volume +
                     ",target=/data", "-e", "RR2_NONCE=" + receipt["nonce"],
                     "--entrypoint", "sh", old_migrator, "-c", marker_command],
                    kind="old-marker", volume=volume, image=old_migrator, timeout=30)
                helper = ROOT / "src/tests/oci/rr2-browser-fixture.mjs"
                result = run_owned_child(receipt, ["docker", "run", "--rm", "--network", "none",
                     "--read-only", "--user", "10001:10001", "--cap-drop", "ALL",
                     "--security-opt", "no-new-privileges", "--pids-limit", "64",
                     "--memory", "768m", "--cpus", "1.0",
                     "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=96m,uid=10001,gid=10001",
                     "--mount", "type=volume,source=" + volume + ",target=/data",
                     "--mount", "type=bind,src=" + str(helper) +
                     ",dst=/app/src/scripts/rr2-browser-fixture.mjs,readonly",
                     "--mount", "type=bind,src=" + str(input_file) +
                     ",dst=/app/src/scripts/rr2-old-fixture-input.json,readonly",
                     "-e", "RR2_NONCE=" + receipt["nonce"],
                     "--entrypoint", "node", worker, "--import", "tsx",
                     "scripts/rr2-browser-fixture.mjs"],
                     kind="browser-fixture", volume=volume, image=worker, timeout=90)
                check(result.stdout.strip() == "RR2_BROWSER_FIXTURE_READY",
                      "RR2_BROWSER_FIXTURE_FAILED")
                ensure_prod(receipt["prodBefore"])
                print("RR2_BROWSER_FIXTURE_READY")
                return 0
            check(not args.approve_plan or re.fullmatch(r"[0-9a-f]{64}", args.approve_plan),
                  "RR2_APPROVAL_FORMAT_INVALID")
            check(args.action in ("execute", "start") or args.approve_plan is None,
                  "RR2_APPROVAL_ACTION_INVALID")
            check(args.action == "plan" or args.operation == "execute",
                  "RR2_OPERATION_ACTION_INVALID")
            env_key = {"old": "oldEnv", "new": "newEnv", "restore": "restoreEnv"}[args.release]
            deploy_root = (Path(receipt["root"]) / "restore" if args.release == "restore"
                           else Path(receipt["root"]))
            project = (receipt["restoreProject"] if args.release == "restore"
                       else receipt["project"])
            command = [sys.executable, str(deploy_root / "src/scripts/g7-deploy.py"),
                       receipt[env_key], args.action, "--project-name", project, "--json"]
            if args.action == "plan" and args.operation == "start":
                command += ["--operation", "start"]
            if args.approve_plan:
                command += ["--approve-plan", args.approve_plan]
            result = host_run(receipt, command, timeout=600)
            record = json.loads(result.stdout.strip().splitlines()[-1])
            print(json.dumps({"action": args.action, "result": record}, sort_keys=True))
            ensure_prod(receipt["prodBefore"])
            check(result.returncode == 0, "RR2_HOST_ACTION_BLOCKED")
    except (Blocked, OSError, ValueError, KeyError, TypeError) as error:
        if args.action == "restore" and "receipt" in locals():
            frame = error.__traceback__
            while frame and frame.tb_next:
                frame = frame.tb_next
            diagnostic = {"kind": "RR2_RESTORE_EXCEPTION_DIAGNOSTIC",
                          "type": type(error).__name__,
                          "source": Path(frame.tb_frame.f_code.co_filename).name if frame else None,
                          "sourceLine": frame.tb_lineno if frame else None}
            (Path(receipt["root"]) / "restore-exception-diagnostic.json").write_text(
                json.dumps(diagnostic, sort_keys=True) + "\n")
        print("RR2_PROOF_FAILED " + (str(error) if isinstance(error, Blocked) else
                                    "RR2_INVALID_INPUT"), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
