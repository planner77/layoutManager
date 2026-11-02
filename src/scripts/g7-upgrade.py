#!/usr/bin/env python3
"""Host-owned local Greenfield maintenance. Never sources an environment file.

Requires Python 3 and Docker Compose v2. Image labels are host-verified release
metadata, not a signature/provenance service. Only trusted, previously pulled
images may be used. Runtime images are never pulled or published by this tool.
"""
import argparse
import json
from pathlib import Path
import re
import secrets
import subprocess
import sys


class Blocked(Exception):
    pass


def run(command, *, allow_failure=False):
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode and not allow_failure:
        raise Blocked("G7_UPGRADE_HOST_COMMAND_FAILED")
    return result


def inspect_pair(app_ref, migrator_ref, source, inspect):
    """Validate actual locally resolved image IDs before any maintenance write."""
    if not re.fullmatch(r"[a-f0-9]{40}", source):
        raise Blocked("G7_UPGRADE_SOURCE_REQUIRED")
    app, migrator = inspect(app_ref), inspect(migrator_ref)
    repository = lambda ref: ref.split("@")[0].rsplit(":", 1)[0] if ":" in ref.split("@")[0].split("/")[-1] else ref.split("@")[0]
    if repository(app_ref) != repository(migrator_ref) or app["Id"] == migrator["Id"]:
        raise Blocked("G7_UPGRADE_PAIR_MISMATCH")
    version = None
    for role, image in (("app", app), ("migrator", migrator)):
        labels = image.get("Config", {}).get("Labels") or {}
        release = labels.get("org.opencontainers.image.version", "")
        if (image.get("Os") != "linux" or image.get("Architecture") != "amd64"
                or not re.fullmatch(r"sha256:[a-f0-9]{64}", image.get("Id", ""))
                or not re.fullmatch(r"0\.\d+\.\d+", release)
                or labels.get("org.opencontainers.image.revision") != source
                or labels.get("org.opencontainers.image.source") != "https://github.com/planner77/layoutManager"
                or labels.get("com.planner77.g7.image-role") != role
                or (version is not None and version != release)):
            raise Blocked("G7_UPGRADE_PAIR_MISMATCH")
        version = release
        ref = app_ref if role == "app" else migrator_ref
        name, separator, digest = ref.partition("@")
        if separator and not re.fullmatch(r"sha256:[a-f0-9]{64}", digest):
            raise Blocked("G7_UPGRADE_PAIR_MISMATCH")
        tag = name.rsplit("/", 1)[-1]
        if ":" in tag:
            expected = release + ("-migrate" if role == "migrator" else "")
            if tag.rsplit(":", 1)[-1].removeprefix("v") != expected:
                raise Blocked("G7_UPGRADE_PAIR_MISMATCH")
        elif not separator:
            raise Blocked("G7_UPGRADE_PAIR_MISMATCH")
    return app["Id"], migrator["Id"]


def main(args=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("env_file", type=Path)
    parser.add_argument("action", choices=("preflight", "plan", "auto", "apply", "status", "restore"))
    parser.add_argument("--approve-plan")
    parser.add_argument("--backup")
    parser.add_argument("--restore-volume")
    parser.add_argument("--project-name")
    options = parser.parse_args(args)
    if options.project_name and not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", options.project_name):
        raise Blocked("G7_UPGRADE_PROJECT_INVALID")
    if options.action == "apply" and not re.fullmatch(r"[a-f0-9]{64}", options.approve_plan or ""):
        raise Blocked("G7_UPGRADE_APPROVAL_REQUIRED")
    if options.action == "restore" and (not re.fullmatch(r"[a-f0-9-]{36}", options.backup or "")
            or not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}", options.restore_volume or "")):
        raise Blocked("G7_UPGRADE_RESTORE_TARGET_REQUIRED")
    project = Path(__file__).resolve().parents[2]
    compose = ["docker", "compose", "--env-file", str(options.env_file.resolve()),
               "-f", str(project / "src/docker-compose.yml")]
    if options.project_name:
        compose += ["--project-name", options.project_name]
    # config may contain private operational settings; retain it in memory only.
    config = json.loads(run(compose + ["config", "--format", "json"]).stdout)
    services = config["services"]
    migrate = services["migrate"]
    env = migrate["environment"]
    if (env.get("CAD_STORAGE_BACKEND") != "local"
            or env.get("G7_GREENFIELD_AUTOMATED") != "true"
            or env.get("G7_GREENFIELD_MODE") != "true"):
        raise Blocked("G7_UPGRADE_UNSUPPORTED_PATH")
    app_ref, migrator_ref = services["app"]["image"], migrate["image"]
    if env.get("G7_DEPLOY_APP_IMAGE") != app_ref or env.get("G7_DEPLOY_MIGRATOR_IMAGE") != migrator_ref:
        raise Blocked("G7_UPGRADE_PAIR_MISMATCH")
    def inspect(ref):
        return json.loads(run(["docker", "image", "inspect", ref]).stdout)[0]
    app_id, migrator_id = inspect_pair(app_ref, migrator_ref, env.get("G7_RELEASE_SOURCE_COMMIT", ""), inspect)
    mounts = migrate.get("volumes", [])
    if len(mounts) != 1 or mounts[0].get("type") != "volume" or mounts[0].get("target") != "/data":
        raise Blocked("G7_UPGRADE_VOLUME_MISMATCH")
    source_volume = config["volumes"][mounts[0]["source"]]["name"]
    # Existing installs only. Never implicitly create a misspelled source volume.
    run(["docker", "volume", "inspect", source_volume])
    mutating = options.action in ("auto", "apply", "restore")
    if mutating:
        # An env typo must never stop an App from another installation. Validate
        # ALL matched service containers' actual mount before invoking stop.
        matched = run(compose + ["ps", "--all", "--quiet", "app"]).stdout.splitlines()
        for container in matched:
            mounted = json.loads(run(["docker", "inspect", container]).stdout)[0].get("Mounts", [])
            data = [mount for mount in mounted if mount.get("Destination") == "/data"]
            if len(data) != 1 or data[0].get("Type") != "volume" or data[0].get("Name") != source_volume:
                raise Blocked("G7_UPGRADE_VOLUME_MISMATCH")
        # Stop via Compose and independently inspect ALL containers mounting the
        # source volume (including another project). A failed stop never proceeds.
        run(compose + ["stop", "app"])
        running = run(["docker", "ps", "--quiet", "--filter", "volume=" + source_volume]).stdout.strip()
        if running:
            raise Blocked("G7_UPGRADE_WRITER_NOT_STOPPED")
    command = ["docker", "run", "--rm", "--network", "none",
               "--mount", "type=volume,source=" + source_volume + ",target=/data"
               + (",readonly" if options.action in ("restore", "preflight", "plan", "status") else "")]
    allowed_env = {"G7_GREENFIELD_MODE", "G7_GREENFIELD_AUTOMATED", "DATABASE_URL", "CAD_STORAGE_PATH",
                   "CAD_STORAGE_BACKEND", "G7_DEPLOY_APP_IMAGE", "G7_DEPLOY_MIGRATOR_IMAGE",
                   "G7_RELEASE_SOURCE_COMMIT", "G7_AUTH_ENABLED", "G7_CAD_WRITE_CUTOVER_ENABLED"}
    for key, value in env.items():
        if key in allowed_env:
            command += ["--env", key + "=" + str(value)]
    command += ["--env", "G7_UPGRADE_PAIR_VERIFIED=true"]
    if mutating:
        command += ["--env", "G7_UPGRADE_MAINTENANCE_ACK=APP_STOPPED_BY_HOST_HELPER"]
    # An immutable local IMAGE ID prevents tag retargeting after inspection.
    cli = [options.action]
    if options.action == "apply":
        cli += ["--approve-plan", options.approve_plan]
    if options.action == "restore":
        target_volume = options.restore_volume
        existing = run(["docker", "volume", "ls", "--format", "{{.Name}}", "--filter", "name=" + target_volume]).stdout.splitlines()
        if target_volume == source_volume or target_volume in existing:
            raise Blocked("G7_UPGRADE_RESTORE_TARGET_NOT_EMPTY")
        nonce = secrets.token_hex(16)
        label = "com.planner77.g7.restore-owner"
        run(["docker", "volume", "create", "--label", label + "=" + nonce, target_volume])
        created = json.loads(run(["docker", "volume", "inspect", target_volume]).stdout)[0]
        if (created.get("Labels") or {}).get(label) != nonce:
            raise Blocked("G7_UPGRADE_RESTORE_TARGET_NOT_EMPTY")
        run(["docker", "run", "--rm", "--network", "none", "--user", "0",
             "--mount", "type=volume,source=" + target_volume + ",target=/restore",
             "--entrypoint", "sh", migrator_id, "-c",
             "test -z \"$(ls -A /restore)\" && mkdir /restore/db /restore/cad && chown 10001:10001 /restore /restore/db /restore/cad && chmod 700 /restore /restore/db /restore/cad"])
        command += ["--mount", "type=volume,source=" + target_volume + ",target=/restore"]
        cli += ["--backup", options.backup, "--target-db-dir", "/restore/db",
                "--target-cad-dir", "/restore/cad", "--ack-empty-target"]
    command += ["--entrypoint", "node", migrator_id, "--import", "tsx", "scripts/g7-greenfield.ts"] + cli
    result = run(command, allow_failure=True)
    # The CLI contract emits only safe structured diagnostics. Do not forward a
    # Docker/native stack trace if the process fails before reaching that CLI.
    for stream, destination in ((result.stdout, sys.stdout), (result.stderr, sys.stderr)):
        for line in stream.splitlines():
            try:
                value = json.loads(line)
                if isinstance(value, dict) and ("state" in value or "code" in value):
                    safe_keys = {"state", "code", "stage", "retryable", "nextAction", "action", "mode",
                                 "planHash", "decision", "backupId", "sourceVersion", "targetVersion",
                                 "restoreRequired", "step", "planId", "from", "to", "requiresApproval",
                                 "phase", "recovery"}
                    safe = {key: item for key, item in value.items() if key in safe_keys
                            and isinstance(item, (str, bool, int, type(None)))}
                    destination.write(json.dumps(safe, separators=(",", ":")) + "\n")
            except ValueError:
                pass
    if result.returncode:
        raise Blocked("G7_UPGRADE_MIGRATOR_FAILED_APP_STOPPED")
    if mutating:
        print(json.dumps({"state": "G7_UPGRADE_HOST_COMPLETE_APP_STOPPED", "verifiedAppImageId": app_id,
                          "nextAction": "Confirm App still resolves to verifiedAppImageId, start it, then verify health, login, grants and CAD."}))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (Blocked, OSError, ValueError, KeyError, IndexError) as error:
        code = str(error) if isinstance(error, Blocked) else "G7_UPGRADE_HOST_BLOCKED"
        print(json.dumps({"code": code, "stage": "HOST", "retryable": False,
                          "nextAction": "Keep App stopped; inspect the documented preflight/restore procedure."}), file=sys.stderr)
        sys.exit(1)
