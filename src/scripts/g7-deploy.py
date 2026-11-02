#!/usr/bin/env python3
"""Issue #211: read-only deployment decisions and approved host orchestration.

This frontend uses the registered #209 upgrade helper. It never sources or
edits .env, creates a volume during inspection, bypasses schema approval, or
performs a restore. Image labels are release metadata, not signed provenance.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys


class Blocked(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def command(argv, *, allow_failure=False):
    try:
        result = subprocess.run(argv, text=True, capture_output=True, check=False)
    except OSError:
        raise Blocked("G7_DEPLOY_DOCKER_UNAVAILABLE") from None
    if result.returncode and not allow_failure:
        raise Blocked("G7_DEPLOY_HOST_COMMAND_FAILED")
    return result


def digest(value):
    if not isinstance(value, (str, bytes)):
        value = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(value.encode("utf-8") if isinstance(value, str) else value).hexdigest()


def parse_json(result, code="G7_DEPLOY_HOST_RESPONSE_INVALID"):
    try:
        return json.loads(result.stdout)
    except (ValueError, TypeError):
        raise Blocked(code) from None


def docker_json(argv, *, optional=False):
    result = command(["docker"] + argv, allow_failure=optional)
    if optional and result.returncode:
        message = result.stderr.lower()
        if (("no such volume" in message or "no such object" in message
             or "no such network" in message or "not found" in message) and
                "permission" not in message):
            return None
        raise Blocked("G7_DEPLOY_DOCKER_INSPECTION_FAILED")
    return parse_json(result)


def checked_name(value):
    return isinstance(value, str) and bool(re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}", value))


def _host_helper():
    # Reuse exactly the image-pair guard from #209, not a second validator.
    filename = Path(__file__).with_name("g7-upgrade.py")
    spec = importlib.util.spec_from_file_location("g7_upgrade_host_211", filename)
    if spec is None or spec.loader is None:
        raise Blocked("G7_DEPLOY_HELPER_UNAVAILABLE")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _field_action(code):
    if code == "G7_UPGRADE_SOURCE_REQUIRED":
        return "SET_G7_RELEASE_SOURCE_COMMIT_FROM_VERIFIED_TARGET_IMAGE_REVISION"
    if code in ("G7_UPGRADE_PAIR_MISMATCH", "G7_DEPLOY_IMAGE_CHANGED"):
        return "PULL_AND_VERIFY_MATCHING_APP_MIGRATOR_PAIR_AND_REPLAN"
    if code in ("G7_UPGRADE_INSTALL_UNKNOWN", "G7_DEPLOY_VOLUME_OCCUPIED",
                "G7_DEPLOY_VOLUME_FOREIGN"):
        return "STOP_AND_IDENTIFY_VOLUME_DO_NOT_ADOPT_OR_DELETE"
    if code in ("G7_UPGRADE_RESTORE_REQUIRED", "G7_DEPLOY_RESTORE_REQUIRED"):
        return "KEEP_APP_STOPPED_USE_ISOLATED_RESTORE_RUNBOOK"
    if code in ("G7_DEPLOY_STALE_PLAN", "G7_DEPLOY_APPROVAL_REQUIRED"):
        return "REINSPECT_REPLAN_AND_APPROVE_EXACT_PLAN"
    if code == "G7_DEPLOY_APP_NOT_VERIFIED":
        return "STOP_APP_RECHECK_VERIFIED_IMAGE_ID_AND_HEALTH"
    return "CHECK_G7_DEPLOY_RUNBOOK_AND_REINSPECT"


def upgrade(env_file, action, project_name=None, approved=None):
    argv = [sys.executable, str(Path(__file__).with_name("g7-upgrade.py")),
            str(env_file), action]
    if approved:
        argv += ["--approve-plan", approved]
    if project_name:
        argv += ["--project-name", project_name]
    result = command(argv, allow_failure=True)
    data = None
    for line in (result.stdout + "\n" + result.stderr).splitlines():
        try:
            obj = json.loads(line)
        except (ValueError, TypeError):
            continue
        if isinstance(obj, dict) and ("state" in obj or "code" in obj):
            data = obj
    if result.returncode:
        raise Blocked((data or {}).get("code") or "G7_DEPLOY_UPGRADE_FAILED")
    if data is None:
        raise Blocked("G7_DEPLOY_HELPER_RESPONSE_INVALID")
    if action == "plan":
        # The #209 host helper must preserve the real registry chain. Do not
        # show an empty or inferred upgrade plan when a filter drops 'steps'.
        steps = data.get("steps")
        state = data.get("state")
        plan_id = data.get("planId")
        if (not isinstance(steps, list) or len(steps) > 64 or
                any(type(item) is not str or item not in ("COMPATIBLE", "MIGRATION")
                    for item in steps) or
                not isinstance(plan_id, str) or
                not re.fullmatch(r"[a-f0-9]{64}", plan_id)):
            raise Blocked("G7_DEPLOY_UPGRADE_CHAIN_INVALID")
        if state == "RESTART_SAME_RELEASE":
            if steps or data.get("from") != data.get("to"):
                raise Blocked("G7_DEPLOY_UPGRADE_CHAIN_INVALID")
        elif state == "UPGRADE_COMPATIBLE":
            if not steps or "MIGRATION" in steps or data.get("from") == data.get("to"):
                raise Blocked("G7_DEPLOY_UPGRADE_CHAIN_INVALID")
        elif state == "UPGRADE_MIGRATION_REQUIRED":
            if "MIGRATION" not in steps or data.get("from") == data.get("to"):
                raise Blocked("G7_DEPLOY_UPGRADE_CHAIN_INVALID")
        else:
            raise Blocked("G7_DEPLOY_UPGRADE_CHAIN_INVALID")
    return data


def _explicit_volume_name(env_file):
    # Shell expansion is forbidden; Compose is the sole interpolation authority.
    try:
        raw = env_file.read_bytes()
    except OSError:
        raise Blocked("G7_DEPLOY_ENV_INVALID") from None
    if not env_file.is_file() or env_file.is_symlink():
        raise Blocked("G7_DEPLOY_ENV_INVALID")
    matched = re.findall(rb"(?m)^\s*CAD_DATA_VOLUME_NAME\s*=\s*([^\r\n#]+)", raw)
    if len(matched) != 1 or not matched[0].strip():
        raise Blocked("G7_DEPLOY_EXPLICIT_VOLUME_REQUIRED")
    return digest(raw)


def _container(identifier):
    data = docker_json(["inspect", identifier], optional=True)
    if data is None:
        return None
    if not isinstance(data, list) or len(data) != 1:
        raise Blocked("G7_DEPLOY_CONTAINER_INVALID")
    return data[0]


def _compose_context(env_file, project_name):
    if project_name and not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", project_name):
        raise Blocked("G7_DEPLOY_PROJECT_INVALID")
    env_sha = _explicit_volume_name(env_file)
    compose = ["docker", "compose", "--env-file", str(env_file),
               "-f", str(Path(__file__).resolve().parents[1] / "docker-compose.yml")]
    if project_name:
        compose += ["--project-name", project_name]
    config = parse_json(command(compose + ["config", "--format", "json"]))
    try:
        services = config["services"]
        app, migrate = services["app"], services["migrate"]
        env = migrate["environment"]
        if (env["CAD_STORAGE_BACKEND"] != "local" or
                env["G7_GREENFIELD_MODE"] != "true" or
                env["G7_GREENFIELD_AUTOMATED"] != "true"):
            raise Blocked("G7_UPGRADE_UNSUPPORTED_PATH")
        if (env["G7_DEPLOY_APP_IMAGE"] != app["image"] or
                env["G7_DEPLOY_MIGRATOR_IMAGE"] != migrate["image"]):
            raise Blocked("G7_UPGRADE_PAIR_MISMATCH")

        def data_mount(service):
            mounts = [v for v in service["volumes"] if v.get("target") == "/data"]
            if len(mounts) != 1 or mounts[0].get("type") != "volume":
                raise Blocked("G7_DEPLOY_VOLUME_MISMATCH")
            return mounts[0]["source"]

        logical = data_mount(migrate)
        if data_mount(app) != logical:
            raise Blocked("G7_DEPLOY_VOLUME_MISMATCH")
        volume = config["volumes"][logical]["name"]
        project = config["name"]
        if not checked_name(volume) or not checked_name(project):
            raise Blocked("G7_DEPLOY_VOLUME_MISMATCH")
        if volume in {"cad-layout-viewer-data", "cad-layout-viewer-greenfield-data"}:
            raise Blocked("G7_DEPLOY_LEGACY_VOLUME_FORBIDDEN")
    except (KeyError, IndexError, TypeError):
        raise Blocked("G7_DEPLOY_COMPOSE_INVALID") from None

    # Static Compose network names are global. Never attach a second project to
    # an existing project's network, including a manually created one.
    for network in config.get("networks", {}).values():
        name = network.get("name")
        if not checked_name(name):
            raise Blocked("G7_DEPLOY_COMPOSE_INVALID")
        existing = docker_json(["network", "inspect", name], optional=True)
        if existing is not None:
            if not isinstance(existing, list) or len(existing) != 1:
                raise Blocked("G7_DEPLOY_NETWORK_CONFLICT")
            labels = existing[0].get("Labels") or {}
            if labels.get("com.docker.compose.project") != project:
                raise Blocked("G7_DEPLOY_NETWORK_CONFLICT")

    helper = _host_helper()
    def inspect_image(ref):
        result = docker_json(["image", "inspect", ref])
        if not isinstance(result, list) or len(result) != 1:
            raise Blocked("G7_DEPLOY_IMAGE_UNAVAILABLE")
        return result[0]
    try:
        app_id, migrate_id = helper.inspect_pair(
            app["image"], migrate["image"], env.get("G7_RELEASE_SOURCE_COMMIT", ""), inspect_image)
    except helper.Blocked as error:
        raise Blocked(str(error)) from None
    image = inspect_image(app["image"])
    target_version = image["Config"]["Labels"]["org.opencontainers.image.version"]
    return {"compose": compose, "config": config, "app": app, "migrate": migrate,
            "volume": volume, "project": project, "envSha": env_sha,
            "appId": app_id, "migrateId": migrate_id, "targetVersion": target_version,
            "projectName": project_name}


def _volume_info(name):
    info = docker_json(["volume", "inspect", name], optional=True)
    if info is None:
        return None
    if not isinstance(info, list) or len(info) != 1 or info[0].get("Name") != name:
        raise Blocked("G7_DEPLOY_VOLUME_MISMATCH")
    if info[0].get("Driver") != "local":
        raise Blocked("G7_DEPLOY_UNSUPPORTED_VOLUME_DRIVER")
    return info[0]


def _is_empty(volume, image_id):
    # --mount never auto-creates a missing volume. The caller inspected it first.
    js = ("const fs=require('fs');process.stdout.write("
          "JSON.stringify({empty:fs.readdirSync('/data').length===0}));")
    result = command(["docker", "run", "--rm", "--network", "none",
                      "--mount", "type=volume,source=" + volume + ",target=/data,readonly,volume-nocopy",
                      "--entrypoint", "node", image_id, "-e", js])
    data = parse_json(result)
    if not isinstance(data, dict) or type(data.get("empty")) is not bool:
        raise Blocked("G7_DEPLOY_VOLUME_INSPECTION_FAILED")
    return data["empty"]


def _app_state(context):
    compose = context["compose"]
    ids = command(compose + ["ps", "--all", "--quiet", "app"]).stdout.splitlines()
    if len(ids) > 1:
        raise Blocked("G7_DEPLOY_APP_AMBIGUOUS")
    running = _container(ids[0]) if ids else None
    if ids and running is None:
        raise Blocked("G7_DEPLOY_APP_STATE_CHANGED")
    name = context["app"].get("container_name")
    existing = _container(name) if name else None
    if existing and (not running or existing["Id"] != running["Id"]):
        raise Blocked("G7_DEPLOY_CONTAINER_NAME_CONFLICT")
    if running:
        mounts = [v for v in running.get("Mounts", [])
                  if v.get("Destination") == "/data"]
        if (len(mounts) != 1 or mounts[0].get("Type") != "volume"
                or mounts[0].get("Name") != context["volume"]):
            raise Blocked("G7_DEPLOY_VOLUME_MISMATCH")
        labels = running.get("Config", {}).get("Labels") or {}
        if labels.get("com.docker.compose.project") != context["project"]:
            raise Blocked("G7_DEPLOY_PROJECT_CONFLICT")
    container_image_id = running.get("Image") if running else None
    version = None
    if container_image_id:
        current_image = docker_json(["image", "inspect", container_image_id], optional=True)
        if isinstance(current_image, list) and len(current_image) == 1:
            version = (current_image[0].get("Config", {}).get("Labels") or {}).get(
                "org.opencontainers.image.version")
    return {"containerId": running.get("Id") if running else None,
            "imageId": container_image_id, "version": version,
            "state": (running.get("State") or {}).get("Status", "UNKNOWN") if running else "absent",
            "health": ((running.get("State") or {}).get("Health") or {}).get("Status", "UNKNOWN")
            if running else "UNKNOWN"}


def _foreign_attachments(context):
    ids = command(["docker", "ps", "--all", "--quiet",
                   "--filter", "volume=" + context["volume"]]).stdout.splitlines()
    app_name = context["app"].get("container_name")
    for identifier in ids:
        container = _container(identifier)
        if container is None:
            raise Blocked("G7_DEPLOY_VOLUME_INSPECTION_FAILED")
        labels = container.get("Config", {}).get("Labels") or {}
        if (labels.get("com.docker.compose.project") != context["project"]
                or labels.get("com.docker.compose.service") not in ("app", "migrate")):
            raise Blocked("G7_DEPLOY_VOLUME_FOREIGN")
        if (container.get("State") or {}).get("Running") and (
                labels.get("com.docker.compose.service") != "app" or
                (container.get("Name") or "").lstrip("/") != app_name):
            raise Blocked("G7_DEPLOY_WRITER_RUNNING")


def inspect(env_file, project_name=None):
    context = _compose_context(env_file, project_name)
    volume = _volume_info(context["volume"])
    app = _app_state(context)
    if volume is not None:
        _foreign_attachments(context)
    mode = "FRESH_INSTALL"
    engine = {}
    steps = []
    if volume is not None and not _is_empty(context["volume"], context["migrateId"]):
        engine = upgrade(env_file, "status", project_name)
        if engine.get("state") == "RESTORE_REQUIRED":
            mode = "RESTORE_REQUIRED"
        else:
            plan = upgrade(env_file, "plan", project_name)
            mode = plan.get("state", "BLOCKED")
            if mode not in ("RESTART_SAME_RELEASE", "UPGRADE_COMPATIBLE",
                            "UPGRADE_MIGRATION_REQUIRED"):
                raise Blocked("G7_DEPLOY_DECISION_INVALID")
            if plan.get("to") != context["targetVersion"]:
                raise Blocked("G7_DEPLOY_TARGET_DRIFT")
            engine = plan
            steps = plan.get("steps", [])
    if mode == "FRESH_INSTALL" and app["containerId"]:
        raise Blocked("G7_DEPLOY_FRESH_APP_EXISTS")
    if mode == "RESTART_SAME_RELEASE" and app["state"] == "running" and (
            app["imageId"] != context["appId"]):
        raise Blocked("G7_DEPLOY_APP_IMAGE_MISMATCH")
    volume_key = digest(context["volume"])[:16]
    project_key = digest(context["project"])[:16]
    view = {
        "state": mode, "decision": mode,
        "installedVersion": engine.get("from") if mode not in ("FRESH_INSTALL", "RESTORE_REQUIRED") else "UNKNOWN",
        "targetVersion": context["targetVersion"],
        "runningAppVersion": app["version"] or "UNKNOWN",
        "runningAppImageId": app["imageId"] or "UNKNOWN",
        "targetAppImageId": context["appId"],
        "targetMigratorImageId": context["migrateId"],
        "targetReleaseSourceCommit": context["migrate"].get("environment", {}).get(
            "G7_RELEASE_SOURCE_COMMIT", "UNKNOWN"),
        "projectKey": project_key, "volumeKey": volume_key,
        "volumeState": "ABSENT" if volume is None else "EXISTS",
        "appState": app["state"], "health": app["health"],
        "businessAcceptance": "NOT_VERIFIED",
        "schema": "VERIFIED_BY_REGISTERED_ENGINE" if mode not in ("FRESH_INSTALL", "RESTORE_REQUIRED") else "UNKNOWN",
        "registryChain": steps, "enginePlanId": engine.get("planId") or "UNKNOWN",
        "approvalRequired": True,
        "blockers": ["RECOVERY_HOLD"] if mode == "RESTORE_REQUIRED" else [],
        "recoveryStage": engine.get("phase") or "UNKNOWN" if mode == "RESTORE_REQUIRED" else None,
        "nextAction": "ISOLATED_RESTORE_ONLY" if mode == "RESTORE_REQUIRED" else
                      "REVIEW_AND_APPROVE_FRESH_INSTALL" if mode == "FRESH_INSTALL" else
                      "PLAN_START_OR_NOOP" if mode == "RESTART_SAME_RELEASE" else
                      "STOP_WRITERS_REVIEW_AND_APPROVE_UPGRADE",
    }
    volume_state = ("ABSENT" if volume is None else
                    digest({k: volume.get(k) for k in ("Name", "CreatedAt", "Driver", "Labels", "Options")}))
    stamp = {"envSha": context["envSha"], "configSha": digest(context["config"]),
             "project": context["project"], "volume": context["volume"],
             "volumeState": volume_state, "engine": engine.get("planId"),
             "engineState": engine.get("state"), "mode": mode,
             "appImageId": context["appId"], "migrateImageId": context["migrateId"],
             "app": app}
    return context, view, stamp


def build_plan(view, stamp, operation="execute"):
    mode = view["decision"]
    if mode == "RESTORE_REQUIRED":
        raise Blocked("G7_DEPLOY_RESTORE_REQUIRED")
    if operation == "start" and mode != "RESTART_SAME_RELEASE":
        raise Blocked("G7_DEPLOY_START_NOT_READY")
    if mode == "FRESH_INSTALL":
        effects = ["CREATE_VOLUME_IF_ABSENT", "RUN_MIGRATOR_CREATE_SCHEMA_SETUP_CODE",
                   "CREATE_COMPOSE_NETWORK", "PUBLISH_PORT_AND_START_APP"]
    elif mode == "RESTART_SAME_RELEASE":
        effects = ["NOOP_ALREADY_RUNNING" if view["appState"] == "running" else
                   "CREATE_OR_START_VERIFIED_APP_CONTAINER_AND_PUBLISH_PORT"]
    else:
        effects = ["STOP_APP", "CHECK_ALL_VOLUME_WRITERS",
                   "SQLITE_WAL_AWARE_BACKUP_AND_CAD_RECOVERY_SET", "APPLY_REGISTERED_CHAIN",
                   "POSTCHECK_AND_ATOMIC_MANIFEST", "KEEP_APP_STOPPED"]
    if operation == "start":
        effects = ["NOOP_ALREADY_RUNNING" if view["appState"] == "running" else
                   "CREATE_OR_START_VERIFIED_APP_CONTAINER_AND_PUBLISH_PORT"]
    fingerprint = digest({"stamp": stamp, "operation": operation, "effects": effects})
    return {**view, "operation": operation, "planId": fingerprint,
            "effects": effects,
            "downtime": "APP_STOP_REQUIRED" if mode.startswith("UPGRADE") else
                        "APP_START_OR_PORT_BIND" if effects[0] != "NOOP_ALREADY_RUNNING" else "NONE",
            "provenance": "OCI_LABELS_NOT_CRYPTOGRAPHIC_PROOF",
            "approvalRequired": True}


def _postcheck(env_file, project_name, expected_id, *, must_be_stopped):
    _, state, _ = inspect(env_file, project_name)
    if state["decision"] != "RESTART_SAME_RELEASE":
        raise Blocked("G7_DEPLOY_POSTCHECK_FAILED")
    if must_be_stopped and state["appState"] == "running":
        raise Blocked("G7_DEPLOY_APP_MUST_REMAIN_STOPPED")
    if state["targetAppImageId"] != expected_id:
        raise Blocked("G7_DEPLOY_IMAGE_CHANGED")
    if not must_be_stopped and (state["appState"] != "running"
                                or state["runningAppImageId"] != expected_id):
        raise Blocked("G7_DEPLOY_APP_NOT_VERIFIED")
    return state


def _start(context):
    # No network pull, build, dependencies or migrator replay on existing DB.
    command(context["compose"] + ["up", "-d", "--no-deps", "--no-build",
                                  "--pull", "never", "app"])


def apply(env_file, project_name, context, plan):
    mode = plan["decision"]
    if plan["operation"] == "start":
        if plan["appState"] == "running":
            return {"state": "NOOP_ALREADY_RUNNING", "nextAction": "CHECK_BUSINESS_ACCEPTANCE"}
        try:
            _start(context)
            after = _postcheck(env_file, project_name, context["appId"], must_be_stopped=False)
        except Blocked:
            command(context["compose"] + ["stop", "app"], allow_failure=True)
            raise
        return {"state": "STARTED_VERIFIED_IMAGE", "health": after["health"],
                "nextAction": "VERIFY_HEALTH_LOGIN_GRANTS_CAD_AUDIT"}
    if mode == "FRESH_INSTALL":
        # Existing-empty volumes and missing volumes are distinct, both pre-inspected.
        # Compose's migrator still owns the final no-adoption guard.
        try:
            command(context["compose"] + ["up", "-d", "--no-build", "--pull", "never", "app"])
            after = _postcheck(env_file, project_name, context["appId"], must_be_stopped=False)
        except Blocked:
            command(context["compose"] + ["stop", "app"], allow_failure=True)
            raise
        return {"state": "FRESH_INSTALLED", "health": after["health"],
                "nextAction": "COMPLETE_ONE_TIME_ADMIN_SETUP_AND_VERIFY_BUSINESS"}
    if mode == "RESTART_SAME_RELEASE":
        if plan["appState"] == "running":
            return {"state": "NOOP_ALREADY_RUNNING", "nextAction": "CHECK_BUSINESS_ACCEPTANCE"}
        return apply(env_file, project_name, context, {**plan, "operation": "start"})
    if mode not in ("UPGRADE_COMPATIBLE", "UPGRADE_MIGRATION_REQUIRED"):
        raise Blocked("G7_DEPLOY_ACTION_UNSUPPORTED")
    # #209 performs stop, writer0, backup, lock/hold, journal, SQL approval,
    # postcheck and manifest atomically; this layer must never replicate them.
    action = "apply" if mode == "UPGRADE_MIGRATION_REQUIRED" else "auto"
    result = upgrade(env_file, action, project_name,
                     plan["enginePlanId"] if action == "apply" else None)
    if result.get("state") != "G7_UPGRADE_HOST_COMPLETE_APP_STOPPED":
        raise Blocked("G7_DEPLOY_UPGRADE_RESULT_INVALID")
    _postcheck(env_file, project_name, context["appId"], must_be_stopped=True)
    return {"state": "UPGRADED_APP_STOPPED", "targetVersion": plan["targetVersion"],
            "nextAction": "PLAN_START_SEPARATELY_AFTER_REVERIFY"}


def emit(value, *, as_json):
    if as_json:
        print(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
        return
    for key in ("state", "decision", "operation", "installedVersion", "targetVersion",
                "runningAppVersion", "appState", "health", "businessAcceptance",
                "targetAppImageId", "targetMigratorImageId", "targetReleaseSourceCommit",
                "recoveryStage",
                "projectKey", "volumeKey", "volumeState", "registryChain",
                "planId", "effects", "approvalRequired", "code", "stage",
                "retryable", "nextAction"):
        if key in value:
            print(key + ": " + json.dumps(value[key], ensure_ascii=False))
    if value.get("state") == "RESTART_SAME_RELEASE":
        print("주의: manifest/목표 일치일 뿐 배포 완료·App health·업무 수용을 증명하지 않습니다.")
    if value.get("planId"):
        print("승인: 검토한 planId 전체를 --approve-plan 값으로 지정해야 합니다. .env는 직접 수정합니다.")


def main(args=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("env_file", type=Path)
    parser.add_argument("action", choices=("inspect", "status", "plan", "execute", "start"))
    parser.add_argument("--project-name")
    parser.add_argument("--operation", choices=("execute", "start"), default="execute")
    parser.add_argument("--approve-plan")
    parser.add_argument("--json", action="store_true")
    options = parser.parse_args(args)
    try:
        if options.action not in ("plan",) and options.operation != "execute":
            raise Blocked("G7_DEPLOY_ARGUMENTS_INVALID")
        if options.action in ("execute", "start"):
            if not re.fullmatch(r"[a-f0-9]{64}", options.approve_plan or ""):
                raise Blocked("G7_DEPLOY_APPROVAL_REQUIRED")
        elif options.approve_plan is not None:
            raise Blocked("G7_DEPLOY_ARGUMENTS_INVALID")
        env_file = options.env_file.resolve(strict=True)
        context, view, stamp = inspect(env_file, options.project_name)
        if options.action in ("inspect", "status"):
            emit(view, as_json=options.json)
        elif options.action == "plan":
            emit(build_plan(view, stamp, options.operation), as_json=options.json)
        else:
            operation = "start" if options.action == "start" else "execute"
            plan = build_plan(view, stamp, operation)
            if options.approve_plan != plan["planId"]:
                raise Blocked("G7_DEPLOY_STALE_PLAN")
            # Read-only reinspection immediately before any Docker mutation.
            new_context, new_view, new_stamp = inspect(env_file, options.project_name)
            if build_plan(new_view, new_stamp, operation)["planId"] != plan["planId"]:
                raise Blocked("G7_DEPLOY_STALE_PLAN")
            result = apply(env_file, options.project_name, new_context, plan)
            emit(result, as_json=options.json)
        return 0
    except (Blocked, OSError, ValueError, KeyError, TypeError) as error:
        code = error.code if isinstance(error, Blocked) else "G7_DEPLOY_INSPECT_BLOCKED"
        emit({"state": "BLOCKED", "code": code, "stage": options.action,
              "retryable": code not in ("G7_DEPLOY_RESTORE_REQUIRED", "G7_UPGRADE_RESTORE_REQUIRED"),
              "nextAction": _field_action(code)}, as_json=options.json)
        return 1


if __name__ == "__main__":
    sys.exit(main())
